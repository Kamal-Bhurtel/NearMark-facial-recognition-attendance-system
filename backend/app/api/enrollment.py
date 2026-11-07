from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import numpy as np

from app.db.session import get_db
from app.models.models import User, Student
from app.api.deps import get_current_user
from app.services.face import extract_embedding, average_embeddings

router = APIRouter(prefix="/enrollment", tags=["Face Enrollment"])


@router.post("/upload-faces")
async def upload_faces(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Student uploads 1–3 face photos.
    We extract embeddings and save them.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can enroll their face")

    student = db.query(Student).filter(Student.user_id == current_user.id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    if student.status not in ["pending", "rejected"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot enroll face when status is '{student.status}'"
        )

    if len(files) < 1 or len(files) > 3:
        raise HTTPException(status_code=400, detail="Please upload 1 to 3 photos")

    embeddings = []
    crop_bytes = None
    messages = []

    for file in files:
        content = await file.read()
        emb, crop, msg = extract_embedding(content)

        if emb is None:
            messages.append(f"{file.filename}: {msg}")
            continue

        embeddings.append(emb)
        if crop_bytes is None:
            crop_bytes = crop  # keep the first good crop for teacher review
        messages.append(f"{file.filename}: OK")

    if len(embeddings) == 0:
        raise HTTPException(
            status_code=400,
            detail="No valid faces found. " + " | ".join(messages)
        )

    # Average the embeddings
    mean_emb = average_embeddings(embeddings)

    # Store as binary (float32)
    student.embeddings = np.stack(embeddings).astype(np.float32).tobytes()
    student.embedding_mean = mean_emb.astype(np.float32).tobytes()
    student.embedding_model = "buffalo_l"
    student.pending_crop = crop_bytes
    student.status = "pending"  # back to pending for teacher approval

    db.commit()

    return {
        "message": "Face enrolled successfully. Waiting for teacher approval.",
        "faces_accepted": len(embeddings),
        "details": messages,
    }