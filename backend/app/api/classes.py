from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from uuid import UUID
import csv
import io

from app.db.session import get_db
from app.models.models import Class, Enrollment, User, AttendanceSession, Student, AttendanceRecord
from app.schemas.class_ import ClassCreate, ClassOut
from app.schemas.enrollment import EnrollmentOut, RosterStudent
from app.api.deps import get_current_teacher


router = APIRouter(prefix="/classes", tags=["Classes"])


@router.post("/", response_model=ClassOut)
def create_class(
    class_in: ClassCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    new_class = Class(
        class_name=class_in.class_name,
        subject_code=class_in.subject_code,
        teacher_id=current_user.id
    )

    db.add(new_class)
    db.commit()
    db.refresh(new_class)

    return new_class


@router.get("/", response_model=List[ClassOut])
def get_my_classes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    classes = db.query(Class).filter(
        Class.teacher_id == current_user.id
    ).all()

    return classes


@router.post("/{class_id}/roster", response_model=List[EnrollmentOut])
def upload_roster(
    class_id: str,
    file: UploadFile = File(...),
    replace: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    try:
        class_uuid = str(UUID(class_id))
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid class ID"
        )

    class_obj = db.query(Class).filter(
        Class.id == class_uuid,
        Class.teacher_id == current_user.id
    ).first()

    if not class_obj:
        raise HTTPException(
            status_code=404,
            detail="Class not found"
        )

    content = file.file.read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))

    required_columns = {
        "Name",
        "RegistrationNumber",
        "Email"
    }

    if not required_columns.issubset(
        set(reader.fieldnames or [])
    ):
        raise HTTPException(
            status_code=400,
            detail="CSV must have columns: Name, RegistrationNumber, Email"
        )

    seen_reg_nos = set()
    seen_emails = set()

    for row in reader:
        reg_no = (row.get("RegistrationNumber") or "").strip()
        name = (row.get("Name") or "").strip()
        email = (row.get("Email") or "").strip().lower()

        if not reg_no or not name or not email:
            continue

        seen_reg_nos.add(reg_no.upper())
        seen_emails.add(email)

        # 1. Search by registration number in this class
        exists = db.query(Enrollment).filter(
            Enrollment.class_id == class_uuid,
            func.upper(func.trim(Enrollment.registration_number)) == reg_no.upper()
        ).first()

        # 2. If not found by reg_no, search by email in this class (handles reg_no updates!)
        if not exists:
            exists = db.query(Enrollment).filter(
                Enrollment.class_id == class_uuid,
                func.lower(func.trim(Enrollment.roster_email)) == email
            ).first()

        if exists:
            # Update to latest name, reg_no, and email
            exists.registration_number = reg_no
            exists.roster_name = name
            exists.roster_email = email
            exists.status = "active"

            # Check if this student is registered & approved
            if not exists.student_id:
                student = db.query(Student).filter(
                    func.upper(func.trim(Student.registration_number)) == reg_no.upper(),
                    Student.status == "approved"
                ).first()
                if student:
                    exists.student_id = student.id
            else:
                student = db.query(Student).filter(Student.id == exists.student_id).first()
                if student:
                    student.full_name = name
                    student.registration_number = reg_no

            continue

        # 3. Create a new enrollment
        enrollment = Enrollment(
            class_id=class_uuid,
            registration_number=reg_no,
            roster_name=name,
            roster_email=email,
            status="active"
        )

        student = db.query(Student).filter(
            func.upper(func.trim(Student.registration_number)) == reg_no.upper(),
            Student.status == "approved"
        ).first()

        if student:
            enrollment.student_id = student.id

        db.add(enrollment)

    # If replace is requested, handle students currently in the class but NOT in the uploaded CSV
    if replace:
        existing_enrollments = db.query(Enrollment).filter(
            Enrollment.class_id == class_uuid,
            Enrollment.status == "active"
        ).all()

        for old_enr in existing_enrollments:
            if (old_enr.registration_number.strip().upper() not in seen_reg_nos and
                old_enr.roster_email.strip().lower() not in seen_emails):
                has_records = db.query(AttendanceRecord).filter(
                    AttendanceRecord.enrollment_id == old_enr.id
                ).first()

                if has_records:
                    old_enr.status = "dropped"
                else:
                    db.delete(old_enr)

    db.commit()

    active_roster = db.query(Enrollment).filter(
        Enrollment.class_id == class_uuid,
        Enrollment.status == "active"
    ).all()

    return active_roster


@router.post("/{class_id}/roster/student", response_model=EnrollmentOut)
def add_student_to_roster(
    class_id: str,
    student_in: RosterStudent,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    try:
        class_uuid = str(UUID(class_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid class ID")

    class_obj = db.query(Class).filter(
        Class.id == class_uuid,
        Class.teacher_id == current_user.id
    ).first()

    if not class_obj:
        raise HTTPException(status_code=404, detail="Class not found")

    reg_no = student_in.registration_number.strip()
    name = student_in.roster_name.strip()
    email = student_in.roster_email.strip().lower()

    if not reg_no or not name or not email:
        raise HTTPException(status_code=400, detail="Name, Registration Number, and Email are required")

    exists = db.query(Enrollment).filter(
        Enrollment.class_id == class_uuid,
        func.upper(func.trim(Enrollment.registration_number)) == reg_no.upper()
    ).first()

    if exists:
        exists.roster_name = name
        exists.roster_email = email
        exists.status = "active"
        student = db.query(Student).filter(
            func.upper(func.trim(Student.registration_number)) == reg_no.upper(),
            Student.status == "approved"
        ).first()
        if student:
            exists.student_id = student.id
        db.commit()
        db.refresh(exists)
        return exists

    new_enrollment = Enrollment(
        class_id=class_uuid,
        registration_number=reg_no,
        roster_name=name,
        roster_email=email,
        status="active"
    )

    student = db.query(Student).filter(
        func.upper(func.trim(Student.registration_number)) == reg_no.upper(),
        Student.status == "approved"
    ).first()
    if student:
        new_enrollment.student_id = student.id

    db.add(new_enrollment)
    db.commit()
    db.refresh(new_enrollment)
    return new_enrollment


@router.put("/{class_id}/roster/{enrollment_id}", response_model=EnrollmentOut)
def update_roster_student(
    class_id: str,
    enrollment_id: str,
    student_in: RosterStudent,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    try:
        cid = str(UUID(class_id))
        eid = str(UUID(enrollment_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")

    class_obj = db.query(Class).filter(Class.id == cid, Class.teacher_id == current_user.id).first()
    if not class_obj:
        raise HTTPException(status_code=404, detail="Class not found")

    enrollment = db.query(Enrollment).filter(Enrollment.id == eid, Enrollment.class_id == cid).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Student not found in roster")

    new_reg = student_in.registration_number.strip()
    new_name = student_in.roster_name.strip()
    new_email = student_in.roster_email.strip().lower()

    if not new_reg or not new_name or not new_email:
        raise HTTPException(status_code=400, detail="Name, Registration Number, and Email cannot be empty")

    duplicate = db.query(Enrollment).filter(
        Enrollment.class_id == cid,
        Enrollment.id != eid,
        func.upper(func.trim(Enrollment.registration_number)) == new_reg.upper()
    ).first()
    if duplicate:
        raise HTTPException(status_code=400, detail=f"Registration number '{new_reg}' is already used by another student in this class")

    enrollment.registration_number = new_reg
    enrollment.roster_name = new_name
    enrollment.roster_email = new_email
    enrollment.status = "active"

    if enrollment.student_id:
        student = db.query(Student).filter(Student.id == enrollment.student_id).first()
        if student:
            student.full_name = new_name
            student.registration_number = new_reg

    db.commit()
    db.refresh(enrollment)
    return enrollment


@router.get("/{class_id}/roster", response_model=List[EnrollmentOut])
def get_roster(
    class_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    try:
        class_uuid = str(UUID(class_id))
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid class ID"
        )

    class_obj = db.query(Class).filter(
        Class.id == class_uuid,
        Class.teacher_id == current_user.id
    ).first()

    if not class_obj:
        raise HTTPException(
            status_code=404,
            detail="Class not found"
        )

    enrollments = db.query(Enrollment).filter(
        Enrollment.class_id == class_uuid,
        Enrollment.status == "active"
    ).all()

    return enrollments


@router.delete("/{class_id}")
def delete_class(
    class_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    try:
        cid = str(UUID(class_id))
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid class ID"
        )

    class_obj = db.query(Class).filter(
        Class.id == cid,
        Class.teacher_id == current_user.id
    ).first()

    if not class_obj:
        raise HTTPException(
            status_code=404,
            detail="Class not found"
        )

    active_session = db.query(AttendanceSession).filter(
        AttendanceSession.class_id == cid,
        AttendanceSession.status == "active"
    ).first()

    if active_session:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot delete class while an attendance session "
                "is active. Lock it first."
            )
        )

    db.delete(class_obj)
    db.commit()

    return {"message": "Class deleted successfully"}


@router.delete("/{class_id}/roster/{enrollment_id}")
def delete_from_roster(
    class_id: str,
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    try:
        cid = str(UUID(class_id))
        eid = str(UUID(enrollment_id))
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid ID"
        )

    class_obj = db.query(Class).filter(
        Class.id == cid,
        Class.teacher_id == current_user.id
    ).first()

    if not class_obj:
        raise HTTPException(
            status_code=404,
            detail="Class not found"
        )

    enrollment = db.query(Enrollment).filter(
        Enrollment.id == eid,
        Enrollment.class_id == cid
    ).first()

    if not enrollment:
        raise HTTPException(
            status_code=404,
            detail="Student not found in roster"
        )

    # Check if student has attendance records
    has_records = db.query(AttendanceRecord).filter(
        AttendanceRecord.enrollment_id == eid
    ).first()

    if has_records:
        enrollment.status = "dropped"
    else:
        db.delete(enrollment)

    db.commit()

    return {"message": "Student removed from roster"}
