from pydantic_settings import BaseSettings
from pathlib import Path

# Get the backend folder path
BASE_DIR = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    DATABASE_URL: str = f"sqlite:///{BASE_DIR / 'fras.db'}"
    JWT_SECRET_KEY: str = "super-secret-key-change-this-later-123456789"
    ADMIN_EMAIL: str = "admin@yourcollege.edu"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()