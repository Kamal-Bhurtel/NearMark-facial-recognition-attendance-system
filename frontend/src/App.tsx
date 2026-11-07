import Attendance from "./pages/Attendance";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import TeacherDashboard from "./pages/TeacherDashboard";
import StudentRegister from "./pages/StudentRegister";
import StudentDashboard from "./pages/StudentDashboard";
import FaceEnrollment from "./pages/FaceEnrollment";
import Navbar from "./components/Navbar";

function App() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  return (
    <BrowserRouter>
      <Navbar />
      <div className="max-w-5xl mx-auto p-4">
        <Routes>
          <Route
            path="/attendance"
            element={
              token && role === "teacher" ? <Attendance /> : <Navigate to="/" />
            }
          />
          <Route path="/" element={<Login />} />
          <Route path="/register-student" element={<StudentRegister />} />
          <Route
            path="/teacher"
            element={
              token && role === "teacher" ? (
                <TeacherDashboard />
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route
            path="/student"
            element={
              token && role === "student" ? (
                <StudentDashboard />
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route
            path="/enroll-face"
            element={
              token && role === "student" ? (
                <FaceEnrollment />
              ) : (
                <Navigate to="/" />
              )
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
