import { Link } from 'react-router-dom'

export default function Navbar() {
  const token = localStorage.getItem('token')
  const role = localStorage.getItem('role')

  const logout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('token')
      localStorage.removeItem('role')
      window.location.href = '/'
    }
  }

  return (
    <nav className="bg-blue-700 text-white px-6 py-3 flex justify-between items-center shadow">
      <div className="font-bold text-lg tracking-wide">NearMark</div>
      <div className="flex gap-4 items-center text-sm">
        {!token && (
          <>
            <Link to="/" className="hover:underline">Login</Link>
            <Link to="/register-student" className="hover:underline">Student Register</Link>
          </>
        )}

        {token && role === 'teacher' && (
          <Link to="/teacher" className="hover:underline">Dashboard</Link>
        )}

        {token && role === 'student' && (
          <Link to="/student" className="hover:underline">My Status</Link>
        )}

        {token && (
          <button
            onClick={logout}
            className="bg-red-500 hover:bg-red-600 px-3 py-1 rounded"
          >
            Logout
          </button>
        )}
      </div>
    </nav>
  )
}