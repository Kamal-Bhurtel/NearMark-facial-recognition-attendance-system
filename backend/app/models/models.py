from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, Float, Integer,
    ForeignKey, Text, LargeBinary, JSON
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.db.base import Base


def generate_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # teacher / student
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    email_verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    student = relationship("Student", back_populates="user", uselist=False)
    classes = relationship("Class", back_populates="teacher")


class Student(Base):
    __tablename__ = "students"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    registration_number = Column(String(50), unique=True, nullable=False, index=True)
    full_name = Column(String(150), nullable=False)
    status = Column(String(20), default="pending")  # pending / approved / rejected
    rejection_reason = Column(Text, nullable=True)

    # Face data
    embeddings = Column(LargeBinary, nullable=True)
    embedding_mean = Column(LargeBinary, nullable=True)
    embedding_model = Column(String(50), nullable=True)
    pending_crop = Column(LargeBinary, nullable=True)

    consent_at = Column(DateTime, nullable=True)
    consent_version = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="student")
    enrollments = relationship("Enrollment", back_populates="student")


class Class(Base):
    __tablename__ = "classes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    class_name = Column(String(150), nullable=False)
    subject_code = Column(String(50), nullable=False)
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    teacher = relationship("User", back_populates="classes")
    enrollments = relationship("Enrollment", back_populates="class_", cascade="all, delete-orphan")
    sessions = relationship("AttendanceSession", back_populates="class_", cascade="all, delete-orphan")


class Enrollment(Base):
    __tablename__ = "enrollments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=False)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=True)
    registration_number = Column(String(50), nullable=False, index=True)
    roster_name = Column(String(150), nullable=False)
    roster_email = Column(String(255), nullable=False)
    status = Column(String(20), default="active")  # active / dropped
    created_at = Column(DateTime, default=datetime.utcnow)

    class_ = relationship("Class", back_populates="enrollments")
    student = relationship("Student", back_populates="enrollments")
    attendance_records = relationship("AttendanceRecord", back_populates="enrollment")


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    class_id = Column(String(36), ForeignKey("classes.id"), nullable=False)
    session_date = Column(Date, nullable=True)
    status = Column(String(20), default="active")  # active / locked
    model_version = Column(String(50), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    locked_at = Column(DateTime, nullable=True)
    auto_lock_at = Column(DateTime, nullable=True)

    class_ = relationship("Class", back_populates="sessions")
    photos = relationship("SessionPhoto", back_populates="session", cascade="all, delete-orphan")
    records = relationship("AttendanceRecord", back_populates="session", cascade="all, delete-orphan")


class SessionPhoto(Base):
    __tablename__ = "session_photos"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("attendance_sessions.id"), nullable=False)
    discarded = Column(Boolean, default=False)
    matches = Column(JSON, nullable=True)          # stores list of match results as JSON
    unmatched_faces = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("AttendanceSession", back_populates="photos")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("attendance_sessions.id"), nullable=False)
    enrollment_id = Column(String(36), ForeignKey("enrollments.id"), nullable=False)
    status = Column(String(20), default="absent")       # present / absent
    auto_status = Column(String(20), default="absent")  # what the AI decided
    source = Column(String(20), default="auto")         # auto / manual
    similarity = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("AttendanceSession", back_populates="records")
    enrollment = relationship("Enrollment", back_populates="attendance_records")