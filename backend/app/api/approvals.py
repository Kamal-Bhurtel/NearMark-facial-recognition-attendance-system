from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from datetime import datetime
import base64

from app.db.session import get_db
from app.models.models import User, Student, Enrollment
from app.api.deps import get_current_teacher
from pydantic import BaseModel

router = APIRouter(prefix="/approvals", tags=["Approvals"])


class PendingStudentOut(BaseModel):
    id: UUID
    registration_number: str
    full_name: str
    status: str
    created_at: datetime
    has_face: bool
    face_crop_base64: Optional[str] = None

    class Config:
        from_attributes = True


class RejectRequest(BaseModel):
    reason: str = "Rejected by teacher"


@router.get("/pending", response_model=List[PendingStudentOut])
def get_pending_students(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    students = db.query(Student).filter(Student.status == "pending").all()
    result = []

    for s in students:
        crop_b64 = None
        if s.pending_crop:
            crop_b64 = base64.b64encode(s.pending_crop).decode("utf-8")

        result.append({
            "id": s.id,
            "registration_number": s.registration_number,
            "full_name": s.full_name,
            "status": s.status,
            "created_at": s.created_at,
            "has_face": s.embedding_mean is not None,
            "face_crop_base64": crop_b64,
        })

    return result


@router.post("/{student_id}/approve")
def approve_student(
    student_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    try:
        sid = str(UUID(student_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student ID")

    student = db.query(Student).filter(Student.id == sid).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if student.status != "pending":
        raise HTTPException(status_code=400, detail=f"Student is already {student.status}")

    student.status = "approved"
    student.pending_crop = None  # delete crop after approval (as per report)

    enrollments = db.query(Enrollment).filter(
        Enrollment.registration_number == student.registration_number,
        Enrollment.status == "active"
    ).all()

    for enrollment in enrollments:
        enrollment.student_id = student.id

    db.commit()

    return {
        "message": "Student approved successfully",
        "student_id": str(student.id),
        "linked_enrollments": len(enrollments)
    }


@router.post("/{student_id}/reject")
def reject_student(
    student_id: str,
    body: RejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    try:
        sid = str(UUID(student_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student ID")

    student = db.query(Student).filter(Student.id == sid).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if student.status != "pending":
        raise HTTPException(status_code=400, detail=f"Student is already {student.status}")

    student.status = "rejected"
    student.rejection_reason = body.reason
    student.pending_crop = None
    student.embeddings = None
    student.embedding_mean = None

    db.commit()

    return {
        "message": "Student rejected",
        "reason": body.reason
    }