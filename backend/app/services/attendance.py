import numpy as np
from typing import List, Dict, Any, Optional
from app.services.face import get_face_app
import cv2

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))


def match_faces_in_photo(
    image_bytes: bytes,
    student_templates: List[Dict[str, Any]],
    t_high: float = 0.45,
    t_low: float = 0.30,
) -> Dict[str, Any]:
    """
    student_templates = [
        {"student_id": "...", "enrollment_id": "...", "name": "...", "embedding": np.array}
    ]
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return {"error": "Could not read image", "matches": [], "unmatched_faces": 0}

    app = get_face_app()
    faces = app.get(img)

    if len(faces) == 0:
        return {"matches": [], "unmatched_faces": 0, "message": "No faces detected"}

    results = []
    used_student_ids = set()

    # Sort faces by size (bigger faces first – usually closer students)
    faces = sorted(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)

    for face in faces:
        emb = face.normed_embedding
        best_score = -1.0
        best_student = None

        for stu in student_templates:
            if stu["student_id"] in used_student_ids:
                continue
            score = cosine_similarity(emb, stu["embedding"])
            if score > best_score:
                best_score = score
                best_student = stu

        if best_student is None:
            results.append({
                "student_id": None,
                "enrollment_id": None,
                "name": None,
                "similarity": 0,
                "band": "unmatched"
            })
            continue

        if best_score >= t_high:
            band = "auto"
            used_student_ids.add(best_student["student_id"])
        elif best_score >= t_low:
            band = "review"
            used_student_ids.add(best_student["student_id"])
        else:
            band = "unmatched"
            best_student = None

        results.append({
            "student_id": best_student["student_id"] if best_student else None,
            "enrollment_id": best_student["enrollment_id"] if best_student else None,
            "name": best_student["name"] if best_student else None,
            "similarity": round(best_score, 4),
            "band": band
        })

    unmatched = sum(1 for r in results if r["band"] == "unmatched")
    return {
        "matches": results,
        "unmatched_faces": unmatched,
        "total_faces": len(faces)
    }