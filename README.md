# FRAS - Face Recognition Attendance System

An automated facial recognition attendance management system with a FastAPI + InsightFace backend and a React + Vite + Tailwind + Capacitor cross-platform frontend.

---

## 📁 Project Structure

```text
fras/
├── backend/                 # FastAPI + InsightFace
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   └── config.py
│   │   ├── db/
│   │   │   ├── base.py
│   │   │   └── session.py
│   │   ├── models/          # SQLAlchemy tables
│   │   ├── schemas/         # Pydantic models
│   │   ├── api/             # API routers
│   │   ├── services/        # Face recognition & business logic
│   │   └── workers/         # Async recognition background tasks
│   ├── requirements.txt
│   └── .env
├── frontend/                # React + Vite + Tailwind + Capacitor
│   ├── src/
│   ├── package.json
│   ├── capacitor.config.ts
│   └── ...
├── docker-compose.yml       # Container orchestration
└── README.md
```

---

## 🚀 Getting Started

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # Windows PowerShell:
   .\venv\Scripts\Activate.ps1
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the FastAPI dev server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

---

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm run dev
   ```
