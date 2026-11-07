import numpy as np
import cv2
import insightface
from insightface.app import FaceAnalysis
from typing import List, Optional, Tuple
import io
from PIL import Image

# Load the model only once (when the server starts)
face_app = None

def get_face_app():
    global face_app
    if face_app is None:
        face_app = FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"]  # use CPU (works everywhere)
        )
        face_app.prepare(ctx_id=0, det_size=(640, 640))
    return face_app


def extract_embedding(image_bytes: bytes) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], str]:
    """
    Takes image bytes → returns (embedding, face_crop, message)
    """
    try:
        # Convert bytes to OpenCV image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return None, None, "Could not read image"

        app = get_face_app()
        faces = app.get(img)

        if len(faces) == 0:
            return None, None, "No face detected. Please upload a clear photo of your face."

        if len(faces) > 1:
            return None, None, "Multiple faces detected. Please upload a photo with only your face."

        face = faces[0]

        # Get the embedding (512 numbers)
        embedding = face.normed_embedding  # already normalized

        # Get a small face crop for the teacher to review
        bbox = face.bbox.astype(int)
        x1, y1, x2, y2 = bbox
        # Add a little padding
        h, w = img.shape[:2]
        pad = 20
        x1 = max(0, x1 - pad)
        y1 = max(0, y1 - pad)
        x2 = min(w, x2 + pad)
        y2 = min(h, y2 + pad)
        crop = img[y1:y2, x1:x2]

        # Convert crop to JPEG bytes
        _, crop_bytes = cv2.imencode(".jpg", crop)
        crop_bytes = crop_bytes.tobytes()

        return embedding, crop_bytes, "OK"

    except Exception as e:
        return None, None, f"Error processing image: {str(e)}"


def average_embeddings(embeddings: List[np.ndarray]) -> np.ndarray:
    """Average several embeddings and re-normalize"""
    avg = np.mean(embeddings, axis=0)
    avg = avg / np.linalg.norm(avg)
    return avg