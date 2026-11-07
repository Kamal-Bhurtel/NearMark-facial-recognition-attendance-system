@echo off
echo Starting FRAS Backend (FastAPI)...
cd /d "%~dp0backend"
call venv\Scripts\activate.bat
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
pause
