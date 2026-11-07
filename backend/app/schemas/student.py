from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID
from datetime import datetime

class StudentRegister(BaseModel):
    full_name: str
    registration_number: str
    email: EmailStr
    password: str
    confirm_password: Optional[str] = None
    consent_version: str = "1.0"

class StudentOut(BaseModel):
    id: UUID
    registration_number: str
    full_name: str
    status: str
    has_face: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
