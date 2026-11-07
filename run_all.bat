@echo off
echo ==============================================
echo   Starting FRAS Attendance System Services
echo ==============================================
echo.
echo Launching Backend (FastAPI on port 8000)...
start "FRAS Backend (FastAPI)" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate.bat && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo Launching Frontend (Vite on port 5173)...
start "FRAS Frontend (Vite)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ==============================================
echo Backend running at:  http://127.0.0.1:8000
echo Swagger API Docs at: http://127.0.0.1:8000/docs
echo Frontend running at: http://127.0.0.1:5173
echo ==============================================
