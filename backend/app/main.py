from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.base import Base
from app.db.session import engine
from app.models import models
from app.api import auth, classes, students, approvals, enrollment, attendance

app = FastAPI(
    title="NearMark - Facial Recognition Attendance System",
    version="1.0.0",
    description="Backend for classroom facial attendance"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

# Include routers
app.include_router(auth.router)
app.include_router(classes.router)
app.include_router(students.router)
app.include_router(approvals.router)
app.include_router(enrollment.router)
app.include_router(attendance.router)

@app.get("/")
def root():
    return {"message": "NearMark backend is running!", "status": "ok"}

@app.get("/health")
def health():
    return {"status": "healthy"}