from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List
from uuid import UUID
import json
import numpy as np

from app.db.session import get_db
from app.models.models import (
    User, Class, Enrollment, Student,
    AttendanceSession, SessionPhoto, AttendanceRecord
)
from app.api.deps import get_current_teacher
from app.services.attendance import match_faces_in_photo

router = APIRouter(prefix="/attendance", tags=["Attendance"])


def recompute_attendance_from_photos(session_id: str, db: Session):
    """
    Recomputes attendance status as the union of all auto matches across
    all active (non-discarded) photos for this session.
    Preserves manual overrides made by the teacher.
    """
    photos = (
        db.query(SessionPhoto)
        .filter(
            SessionPhoto.session_id == session_id,
            SessionPhoto.discarded == False
        )
        .order_by(SessionPhoto.created_at.asc())
        .all()
    )

    # enrollment_id -> highest similarity score among auto-detected matches
    best_matches = {}
    for p in photos:
        p_matches = p.matches
        if isinstance(p_matches, str):
            try:
                p_matches = json.loads(p_matches)
            except Exception:
                p_matches = []
        if isinstance(p_matches, list):
            for m in p_matches:
                if m.get("band") == "auto" and m.get("enrollment_id"):
                    try:
                        eid = str(UUID(m["enrollment_id"]))
                        sim = float(m.get("similarity", 0.0))
                        if eid not in best_matches or sim > best_matches[eid]:
                            best_matches[eid] = sim
                    except (ValueError, TypeError):
                        continue

    records = db.query(AttendanceRecord).filter(
        AttendanceRecord.session_id == session_id
    ).all()

    for rec in records:
        eid_str = str(rec.enrollment_id)
        # Never overwrite a teacher's manual override
        if rec.source == "manual":
            continue

        if eid_str in best_matches:
            rec.status = "present"
            rec.auto_status = "present"
            rec.similarity = best_matches[eid_str]
        else:
            rec.status = "absent"
            rec.auto_status = "absent"
            rec.similarity = None

    db.commit()


@router.post("/start/{class_id}")
def start_session(
    class_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    try:
        cid = str(UUID(class_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid class ID")

    class_obj = db.query(Class).filter(
        Class.id == cid,
        Class.teacher_id == current_user.id
    ).first()
    if not class_obj:
        raise HTTPException(status_code=404, detail="Class not found")

    existing = db.query(AttendanceSession).filter(
        AttendanceSession.class_id == cid,
        AttendanceSession.status == "active"
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="An active session already exists for this class")

    session = AttendanceSession(
        class_id=cid,
        session_date=datetime.utcnow().date(),
        status="active",
        auto_lock_at=datetime.utcnow() + timedelta(hours=12),
        model_version="buffalo_l"
    )
    db.add(session)
    db.flush()

    enrollments = db.query(Enrollment).filter(
        Enrollment.class_id == cid,
        Enrollment.status == "active"
    ).all()

    for enr in enrollments:
        record = AttendanceRecord(
            session_id=session.id,
            enrollment_id=enr.id,
            status="absent",
            auto_status="absent",
            source="auto"
        )
        db.add(record)

    db.commit()
    db.refresh(session)

    return {
        "session_id": str(session.id),
        "class_name": class_obj.class_name,
        "total_students": len(enrollments),
        "message": "Attendance session started. All students marked Absent."
    }


def _get_templates_for_session(session: AttendanceSession, db: Session):
    enrollments = db.query(Enrollment).filter(
        Enrollment.class_id == session.class_id,
        Enrollment.status == "active"
    ).all()

    templates = []
    for enr in enrollments:
        if not enr.student_id:
            continue
        student = db.query(Student).filter(Student.id == enr.student_id).first()
        if not student or not student.embedding_mean:
            continue

        emb = np.frombuffer(student.embedding_mean, dtype=np.float32)
        templates.append({
            "student_id": str(student.id),
            "enrollment_id": str(enr.id),
            "name": student.full_name,
            "embedding": emb
        })
    return enrollments, templates


@router.post("/{session_id}/upload-photos")
async def upload_photos(
    session_id: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    """
    Upload 1 to multiple photos (e.g. 3-4 photos of the classroom).
    Attendance is marked as the union of all faces detected across all uploaded photos.
    """
    try:
        sid = str(UUID(session_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = db.query(AttendanceSession).filter(AttendanceSession.id == sid).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is already locked")

    class_obj = db.query(Class).filter(Class.id == session.class_id).first()
    if class_obj.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="Please select at least 1 photo")

    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 photos can be uploaded at a time")

    enrollments, templates = _get_templates_for_session(session, db)

    # Current present IDs before processing
    prev_present_ids = {
        str(r.enrollment_id)
        for r in db.query(AttendanceRecord).filter(
            AttendanceRecord.session_id == session.id,
            AttendanceRecord.status == "present"
        ).all()
    }

    photo_summaries = []

    for idx, file in enumerate(files):
        image_bytes = await file.read()
        if not image_bytes:
            continue

        match_result = match_faces_in_photo(image_bytes, templates)

        if "error" in match_result:
            photo_summaries.append({
                "photo_index": idx + 1,
                "filename": file.filename,
                "error": match_result["error"],
                "total_faces": 0,
                "auto_present": 0,
                "review": 0,
                "unmatched": 0
            })
            continue

        matches_list = match_result.get("matches", [])
        photo = SessionPhoto(
            session_id=session.id,
            discarded=False,
            matches=json.dumps(matches_list),
            unmatched_faces=match_result.get("unmatched_faces", 0)
        )
        db.add(photo)
        db.flush()

        auto_present_count = sum(1 for m in matches_list if m.get("band") == "auto")
        review_count = sum(1 for m in matches_list if m.get("band") == "review")

        photo_summaries.append({
            "photo_id": str(photo.id),
            "photo_index": idx + 1,
            "filename": file.filename,
            "total_faces": match_result.get("total_faces", 0),
            "auto_present": auto_present_count,
            "review": review_count,
            "unmatched": match_result.get("unmatched_faces", 0)
        })

    db.commit()

    # Recompute attendance union across all active photos
    recompute_attendance_from_photos(session.id, db)

    now_present_ids = {
        str(r.enrollment_id)
        for r in db.query(AttendanceRecord).filter(
            AttendanceRecord.session_id == session.id,
            AttendanceRecord.status == "present"
        ).all()
    }

    newly_marked = len(now_present_ids - prev_present_ids)

    return {
        "message": f"Successfully processed {len(files)} classroom photo(s)",
        "photos_processed": len(files),
        "photo_summaries": photo_summaries,
        "newly_marked_present": newly_marked,
        "total_present": len(now_present_ids),
        "total_enrolled": len(enrollments)
    }


@router.post("/{session_id}/upload-photo")
async def upload_photo(
    session_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    """Single photo upload endpoint (retains backwards compatibility)."""
    res = await upload_photos(session_id=session_id, files=[file], db=db, current_user=current_user)
    summaries = res.get("photo_summaries", [])
    first_summary = summaries[0] if summaries else {}
    return {
        "message": res.get("message"),
        "total_faces": first_summary.get("total_faces", 0),
        "auto_present": first_summary.get("auto_present", 0),
        "review": first_summary.get("review", 0),
        "unmatched": first_summary.get("unmatched", 0),
        "photo_summaries": summaries
    }


@router.post("/{session_id}/photos/{photo_id}/discard")
def discard_photo(
    session_id: str,
    photo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    """
    Discards an uploaded photo from the session and recomputes the attendance
    union without this photo's matches.
    """
    try:
        sid = str(UUID(session_id))
        pid = str(UUID(photo_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")

    session = db.query(AttendanceSession).filter(AttendanceSession.id == sid).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is already locked")

    class_obj = db.query(Class).filter(Class.id == session.class_id).first()
    if class_obj.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    photo = db.query(SessionPhoto).filter(
        SessionPhoto.id == pid,
        SessionPhoto.session_id == sid
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    photo.discarded = True
    db.commit()

    recompute_attendance_from_photos(session.id, db)

    return {"message": "Photo discarded and attendance recalculated", "photo_id": photo_id}


@router.get("/{session_id}/results")
def get_session_results(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    try:
        sid = str(UUID(session_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = db.query(AttendanceSession).filter(AttendanceSession.id == sid).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    class_obj = db.query(Class).filter(Class.id == session.class_id).first()
    if class_obj.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    records = db.query(AttendanceRecord).filter(
        AttendanceRecord.session_id == sid
    ).all()

    result_list = []
    for rec in records:
        enr = db.query(Enrollment).filter(Enrollment.id == rec.enrollment_id).first()
        student_name = enr.roster_name if enr else "Unknown"
        has_face = False
        reg_number = enr.registration_number if enr else ""
        if enr and enr.student_id:
            stu = db.query(Student).filter(Student.id == enr.student_id).first()
            if stu:
                student_name = stu.full_name
                has_face = stu.embedding_mean is not None

        result_list.append({
            "record_id": str(rec.id),
            "enrollment_id": str(rec.enrollment_id),
            "name": student_name,
            "registration_number": reg_number,
            "status": rec.status,
            "auto_status": rec.auto_status,
            "source": rec.source,
            "similarity": rec.similarity,
            "has_face": has_face
        })

    present_count = sum(1 for r in result_list if r["status"] == "present")
    absent_count = sum(1 for r in result_list if r["status"] == "absent")

    # Also return summary of session photos
    photos = (
        db.query(SessionPhoto)
        .filter(SessionPhoto.session_id == sid)
        .order_by(SessionPhoto.created_at.asc())
        .all()
    )

    photos_summary = []
    for idx, p in enumerate(photos):
        p_matches = p.matches
        if isinstance(p_matches, str):
            try:
                p_matches = json.loads(p_matches)
            except Exception:
                p_matches = []
        auto_count = sum(1 for m in p_matches if m.get("band") == "auto") if isinstance(p_matches, list) else 0
        review_count = sum(1 for m in p_matches if m.get("band") == "review") if isinstance(p_matches, list) else 0
        total_faces = auto_count + review_count + (p.unmatched_faces or 0)
        photos_summary.append({
            "id": str(p.id),
            "index": idx + 1,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "discarded": p.discarded,
            "total_faces": total_faces,
            "auto_present": auto_count,
            "review": review_count,
            "unmatched": p.unmatched_faces or 0
        })

    return {
        "session_id": str(session.id),
        "status": session.status,
        "class_name": class_obj.class_name,
        "present": present_count,
        "absent": absent_count,
        "total": len(result_list),
        "records": result_list,
        "photos": photos_summary
    }


@router.post("/{session_id}/override")
def override_status(
    session_id: str,
    enrollment_id: str,
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    if status not in ["present", "absent"]:
        raise HTTPException(status_code=400, detail="Status must be 'present' or 'absent'")

    try:
        sid = str(UUID(session_id))
        eid = str(UUID(enrollment_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")

    session = db.query(AttendanceSession).filter(AttendanceSession.id == sid).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is locked")

    class_obj = db.query(Class).filter(Class.id == session.class_id).first()
    if class_obj.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    record = db.query(AttendanceRecord).filter(
        AttendanceRecord.session_id == sid,
        AttendanceRecord.enrollment_id == eid
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    record.status = status
    record.source = "manual"
    db.commit()

    return {"message": f"Marked as {status}", "enrollment_id": enrollment_id}


@router.post("/{session_id}/lock")
def lock_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    try:
        sid = str(UUID(session_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = db.query(AttendanceSession).filter(AttendanceSession.id == sid).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is already locked")

    class_obj = db.query(Class).filter(Class.id == session.class_id).first()
    if class_obj.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    session.status = "locked"
    session.locked_at = datetime.utcnow()
    db.commit()

    return {"message": "Session locked successfully", "session_id": str(session.id)}


@router.post("/{session_id}/cancel")
def cancel_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    try:
        sid = str(UUID(session_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = db.query(AttendanceSession).filter(AttendanceSession.id == sid).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    class_obj = db.query(Class).filter(Class.id == session.class_id).first()
    if not class_obj or class_obj.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is not active")

    session.status = "locked"
    session.locked_at = datetime.utcnow()
    db.commit()

    return {"message": "Session terminated successfully"}


@router.get("/active")
def get_active_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    sessions = (
        db.query(AttendanceSession)
        .join(Class, Class.id == AttendanceSession.class_id)
        .filter(
            Class.teacher_id == current_user.id,
            AttendanceSession.status == "active"
        )
        .all()
    )

    result = []
    for s in sessions:
        class_obj = db.query(Class).filter(Class.id == s.class_id).first()
        result.append({
            "session_id": str(s.id),
            "class_id": str(s.class_id),
            "class_name": class_obj.class_name if class_obj else "Unknown",
            "started_at": s.started_at.isoformat() if s.started_at else None,
        })

    return result
