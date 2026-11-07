from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID

class RosterStudent(BaseModel):
    registration_number: str
    roster_name: str
    roster_email: EmailStr

class EnrollmentOut(BaseModel):
    id: UUID
    registration_number: str
    roster_name: Optional[str]
    roster_email: Optional[str]
    status: str
    student_id: Optional[UUID]

    class Config:
        from_attributes = True