from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel

from app.db.session import get_db
from app.models.models import User, Student, Enrollment, Class, AttendanceSession, AttendanceRecord
from app.schemas.student import StudentRegister, StudentOut
from app.core.security import get_password_hash
from app.core.config import settings
from app.api.deps import get_current_user


router = APIRouter(prefix="/students", tags=["Students"])


@router.post("/register", response_model=StudentOut)
def register_student(
    data: StudentRegister,
    db: Session = Depends(get_db)
):
    if data.confirm_password is not None and data.password != data.confirm_password:
        raise HTTPException(
            status_code=400,
            detail="Passwords do not match."
        )

    if len(data.password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters."
        )

    reg_no = data.registration_number.strip()
    email = data.email.lower().strip()
    full_name = data.full_name.strip()

    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(
            status_code=400,
            detail="Email already registered. Please log in instead."
        )

    if db.query(Student).filter(
        func.upper(func.trim(Student.registration_number)) == reg_no.upper()
    ).first():
        raise HTTPException(
            status_code=400,
            detail=f"Registration number '{reg_no}' is already registered."
        )

    matching_enrollments = db.query(Enrollment).filter(
        func.upper(func.trim(Enrollment.registration_number)) == reg_no.upper(),
        func.lower(func.trim(Enrollment.roster_email)) == email,
        Enrollment.status == "active"
    ).all()

    if not matching_enrollments:
        reg_match = db.query(Enrollment).filter(
            func.upper(func.trim(Enrollment.registration_number)) == reg_no.upper(),
            Enrollment.status == "active"
        ).first()

        email_match = db.query(Enrollment).filter(
            func.lower(func.trim(Enrollment.roster_email)) == email,
            Enrollment.status == "active"
        ).first()

        if reg_match:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Registration number '{reg_no}' is enrolled with email '{reg_match.roster_email}'. "
                    f"Please enter that exact email address to complete registration."
                )
            )
        elif email_match:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Email '{email}' is enrolled with registration number '{email_match.registration_number}'. "
                    f"Please enter that registration number."
                )
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Registration number '{reg_no}' and email '{email}' were not found in any class roster. "
                    "Ask your teacher to add you to the class roster first."
                )
            )

    hashed = get_password_hash(data.password)
    is_admin = (email == settings.ADMIN_EMAIL.lower())

    new_user = User(
        email=email,
        hashed_password=hashed,
        role="student",
        is_admin=is_admin,
        email_verified_at=datetime.utcnow()
    )

    db.add(new_user)
    db.flush()

    new_student = Student(
        user_id=new_user.id,
        registration_number=reg_no,
        full_name=full_name,
        status="pending",
        consent_at=datetime.utcnow(),
        consent_version=data.consent_version
    )

    db.add(new_student)
    db.commit()
    db.refresh(new_student)

    return {
        "id": new_student.id,
        "registration_number": new_student.registration_number,
        "full_name": new_student.full_name,
        "status": new_student.status,
        "has_face": False,
        "created_at": new_student.created_at,
    }


@router.get("/me", response_model=StudentOut)
def get_my_student_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "student":
        raise HTTPException(
            status_code=403,
            detail="Only students can access this"
        )

    student = db.query(Student).filter(
        Student.user_id == current_user.id
    ).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student profile not found"
        )

    return {
        "id": student.id,
        "registration_number": student.registration_number,
        "full_name": student.full_name,
        "status": student.status,
        "has_face": student.embedding_mean is not None,
        "created_at": student.created_at
    }


@router.get("/me/attendance")
def get_my_attendance(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "student":
        raise HTTPException(
            status_code=403,
            detail="Only students can access this"
        )

    student = db.query(Student).filter(
        Student.user_id == current_user.id
    ).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student profile not found"
        )

    # Find all active enrollments for this student
    enrollments = db.query(Enrollment).filter(
        (Enrollment.student_id == student.id) |
        (Enrollment.registration_number == student.registration_number),
        Enrollment.status == "active"
    ).all()

    class_stats = []
    logs = []
    total_classes_count = 0
    total_attended_count = 0

    for enr in enrollments:
        cls = db.query(Class).filter(Class.id == enr.class_id).first()
        class_name = cls.class_name if cls else "Unknown Class"
        subject_code = cls.subject_code if cls else ""

        records = (
            db.query(AttendanceRecord)
            .filter(AttendanceRecord.enrollment_id == enr.id)
            .all()
        )

        attended = sum(1 for r in records if r.status == "present")
        total = len(records)
        percentage = round((attended / total * 100), 1) if total > 0 else 0.0

        total_classes_count += total
        total_attended_count += attended

        class_stats.append({
            "class_id": str(enr.class_id),
            "class_name": class_name,
            "subject_code": subject_code,
            "attended": attended,
            "total": total,
            "percentage": percentage
        })

        for r in records:
            session = db.query(AttendanceSession).filter(
                AttendanceSession.id == r.session_id
            ).first()

            date_str = "N/A"
            session_status = "locked"
            if session:
                session_status = session.status
                if session.session_date:
                    date_str = str(session.session_date)
                elif session.started_at:
                    date_str = session.started_at.strftime("%Y-%m-%d")

            logs.append({
                "record_id": str(r.id),
                "session_id": str(r.session_id),
                "class_name": class_name,
                "subject_code": subject_code,
                "date": date_str,
                "status": r.status,
                "source": r.source,
                "similarity": r.similarity,
                "session_status": session_status
            })

    # Sort logs with newest date first
    logs.sort(key=lambda x: x["date"], reverse=True)

    overall_percentage = (
        round((total_attended_count / total_classes_count * 100), 1)
        if total_classes_count > 0 else 0.0
    )

    return {
        "overall_percentage": overall_percentage,
        "total_classes": total_classes_count,
        "attended_classes": total_attended_count,
        "classes": class_stats,
        "logs": logs
    }


# =========================
# Reset Student Password
# =========================

class ResetPasswordRequest(BaseModel):
    new_password: str
    registration_number: str | None = None


@router.post("/reset-password")
def reset_student_password(
    body: ResetPasswordRequest,
    student_id: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role != "teacher":
        raise HTTPException(
            status_code=403,
            detail="Only teachers can reset passwords"
        )

    if len(body.new_password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters"
        )

    student = None

    # Method 1: by student_id
    # Used when the student is linked or selected from a
    # list that already contains the student ID.
    if student_id:
        try:
            sid = str(UUID(student_id))

            student = db.query(Student).filter(
                Student.id == sid
            ).first()

        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid student ID"
            )

    # Method 2: by registration_number
    # Used when the student is not linked yet.
    if not student and body.registration_number:
        student = db.query(Student).filter(
            Student.registration_number ==
            body.registration_number.strip()
        ).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail=(
                "Student not found. "
                "They may not have registered yet."
            )
        )

    if not student.user_id:
        raise HTTPException(
            status_code=400,
            detail="This student has no login account"
        )

    user = db.query(User).filter(
        User.id == student.user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User account not found"
        )

    user.hashed_password = get_password_hash(
        body.new_password
    )

    db.commit()

    return {
        "message": (
            f"Password reset successfully for "
            f"{student.full_name}"
        )
    }


# =========================
# Delete My Account
# =========================

@router.delete("/me")
def delete_my_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "student":
        raise HTTPException(
            status_code=403,
            detail="Only students can delete their own account"
        )

    student = db.query(Student).filter(
        Student.user_id == current_user.id
    ).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student profile not found"
        )

    # 1. Delete face data immediately
    student.embeddings = None
    student.embedding_mean = None
    student.pending_crop = None
    student.embedding_model = None

    # 2. Unlink from all enrollments (keep roster history)
    enrollments = db.query(Enrollment).filter(
        Enrollment.student_id == student.id
    ).all()

    for enr in enrollments:
        enr.student_id = None

    # 3. Free the registration number so the student
    #    can register again later.
    #    Change it to a unique deleted value instead
    #    of keeping the original registration number.
    import uuid as uuid_lib

    old_reg = student.registration_number

    student.registration_number = (
        f"deleted-{uuid_lib.uuid4().hex[:12]}"
    )

    student.full_name = "Deleted Student"
    student.status = "rejected"
    student.rejection_reason = (
        f"Account deleted by student (was {old_reg})"
    )
    student.user_id = None
    student.consent_at = None
    student.consent_version = None

    # 4. Delete the login account
    db.delete(current_user)

    db.commit()

    return {
        "message": "Your account and face data have been deleted successfully"
    }