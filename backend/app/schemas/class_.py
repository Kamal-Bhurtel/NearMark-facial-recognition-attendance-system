from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

class ClassCreate(BaseModel):
    class_name: str
    subject_code: str

class ClassOut(BaseModel):
    id: UUID
    class_name: str
    subject_code: str
    teacher_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True