import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  BookOpen, 
  Calendar, 
  TrendingUp, 
  Camera, 
  ShieldCheck, 
  Trash2,
  RefreshCw
} from 'lucide-react'
import Spinner from '../components/Spinner'

interface StudentProfile {
  id: string
  full_name: string
  registration_number: string
  status: string
  has_face: boolean
  created_at: string
  rejection_reason?: string
}

interface ClassStat {
  class_id: string
  class_name: string
  subject_code: string
  attended: number
  total: number
  percentage: number
}

interface AttendanceLog {
  record_id: string
  session_id: string
  class_name: string
  subject_code: string
  date: string
  status: 'present' | 'absent'
  source: string
  similarity?: number | null
  session_status: string
}

interface AttendanceData {
  overall_percentage: number
  total_classes: number
  attended_classes: number
  classes: ClassStat[]
  logs: AttendanceLog[]
}

export default function StudentDashboard() {
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [attendance, setAttendance] = useState<AttendanceData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const navigate = useNavigate()

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const [profileRes, attendanceRes] = await Promise.all([
        api.get('/students/me'),
        api.get('/students/me/attendance'),
      ])
      setProfile(profileRes.data)
      setAttendance(attendanceRes.data)
    } catch (err: any) {
      setError(
        err.response?.data?.detail || 'Failed to load student dashboard data'
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // =========================
  // Delete My Account
  // =========================
  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete your account?\n\n' +
      'This will permanently delete:\n' +
      '• Your login credentials\n' +
      '• Your facial biometric data\n' +
      '• Your profile\n\n' +
      'This action is irreversible.'
    )

    if (!confirmed) return

    const doubleCheck = window.prompt('Type DELETE to confirm permanently:')
    if (doubleCheck !== 'DELETE') {
      alert('Account deletion cancelled.')
      return
    }

    try {
      await api.delete('/students/me')
      localStorage.removeItem('token')
      localStorage.removeItem('role')
      alert('Your account and face biometrics have been deleted.')
      window.location.href = '/'
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete account')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'pending':
        return 'bg-amber-100 text-amber-800 border-amber-200'
      case 'rejected':
        return 'bg-rose-100 text-rose-800 border-rose-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getPercentageColor = (pct: number) => {
    if (pct >= 75) return 'text-emerald-600'
    if (pct >= 60) return 'text-amber-500'
    return 'text-rose-600'
  }

  const getProgressBgColor = (pct: number) => {
    if (pct >= 75) return 'bg-emerald-500'
    if (pct >= 60) return 'bg-amber-500'
    return 'bg-rose-500'
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Spinner size="lg" />
        <p className="text-gray-500 font-medium">Loading your attendance records...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white p-8 rounded-2xl shadow-lg border text-center space-y-4">
        <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="text-rose-600 font-semibold">{error}</div>
        <button
          onClick={() => {
            localStorage.clear()
            navigate('/')
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition"
        >
          Return to Login
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* =========================
          Top Bar & Profile Overview
          ========================= */}
      <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {profile?.full_name}
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold tracking-wide border uppercase ${getStatusColor(
                profile?.status || ''
              )}`}
            >
              {profile?.status}
            </span>
            {profile?.has_face ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                <ShieldCheck className="w-3.5 h-3.5" /> Face Registered
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                No Face
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 font-medium">
            Registration No: <span className="text-gray-900 font-semibold">{profile?.registration_number}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          {(profile?.status === 'pending' ||
            profile?.status === 'rejected' ||
            (profile?.status === 'approved' && !profile?.has_face)) && (
            <button
              onClick={() => navigate('/enroll-face')}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition shadow-sm"
            >
              <Camera className="w-4 h-4" />
              {profile?.has_face ? 'Update Face' : 'Enroll Face'}
            </button>
          )}
        </div>
      </div>

      {/* Rejection Notice Banner (if applicable) */}
      {profile?.status === 'rejected' && profile?.rejection_reason && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-600" />
          <div>
            <span className="font-semibold">Enrollment Rejected: </span>
            {profile.rejection_reason}. Please click "Update Face" above to submit a new photo.
          </div>
        </div>
      )}

      {/* =========================
          Live Attendance KPI Cards
          ========================= */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Overall Percentage Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-sm font-medium">Overall Attendance</span>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-extrabold ${getPercentageColor(attendance?.overall_percentage || 0)}`}>
              {attendance?.overall_percentage ?? 0}%
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-3 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${getProgressBgColor(
                attendance?.overall_percentage || 0
              )}`}
              style={{ width: `${Math.min(100, Math.max(0, attendance?.overall_percentage || 0))}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 pt-1">
            {(attendance?.overall_percentage || 0) >= 75
              ? '✓ Good standing (above 75% threshold)'
              : '⚠️ Below 75% required attendance minimum'}
          </p>
        </div>

        {/* Classes Attended Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-sm font-medium">Sessions Attended</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-4xl font-extrabold text-gray-900">
            {attendance?.attended_classes ?? 0}
            <span className="text-lg font-normal text-gray-400"> / {attendance?.total_classes ?? 0}</span>
          </div>
          <p className="text-xs text-gray-500 pt-3">
            Total classroom sessions conducted across all enrolled courses
          </p>
        </div>

        {/* Enrolled Courses Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-sm font-medium">Enrolled Courses</span>
            <BookOpen className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-4xl font-extrabold text-gray-900">
            {attendance?.classes?.length ?? 0}
          </div>
          <p className="text-xs text-gray-500 pt-3">
            Active courses linked to your registration number
          </p>
        </div>
      </div>

      {/* =========================
          Class-by-Class Breakdown
          ========================= */}
      <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Course Attendance Breakdown</h2>
            <p className="text-xs text-gray-500">Live attendance percentage per enrolled subject</p>
          </div>
        </div>

        {!attendance?.classes || attendance.classes.length === 0 ? (
          <div className="text-center py-10 text-gray-500 space-y-2">
            <BookOpen className="w-10 h-10 mx-auto text-gray-300" />
            <p className="font-medium">No courses found in roster</p>
            <p className="text-xs">Ask your teacher to upload or add you to a class roster.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {attendance.classes.map((cls) => (
              <div
                key={cls.class_id}
                className="p-5 rounded-xl border bg-gray-50/50 hover:bg-white hover:shadow-sm transition space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{cls.class_name}</h3>
                    <span className="inline-block text-xs font-mono font-medium bg-gray-200 text-gray-700 px-2 py-0.5 rounded mt-1">
                      {cls.subject_code}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className={`text-xl font-extrabold ${getPercentageColor(cls.percentage)}`}>
                      {cls.percentage}%
                    </span>
                    <div className="text-xs text-gray-500">
                      {cls.attended} / {cls.total} classes
                    </div>
                  </div>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${getProgressBgColor(cls.percentage)}`}
                    style={{ width: `${Math.min(100, Math.max(0, cls.percentage))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =========================
          Detailed Attendance Session Logs
          ========================= */}
      <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Attendance Session Logs</h2>
            <p className="text-xs text-gray-500">History of classroom sessions and automated recognition results</p>
          </div>
        </div>

        {!attendance?.logs || attendance.logs.length === 0 ? (
          <div className="text-center py-12 text-gray-500 space-y-2">
            <Calendar className="w-10 h-10 mx-auto text-gray-300" />
            <p className="font-medium">No attendance sessions recorded yet</p>
            <p className="text-xs text-gray-400">
              When your teacher starts an attendance session and snaps photos, your history will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold">
                <tr>
                  <th className="py-3 px-4 rounded-l-lg">Date</th>
                  <th className="py-3 px-4">Course</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Verification Method</th>
                  <th className="py-3 px-4 rounded-r-lg">Session State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {attendance.logs.map((log) => (
                  <tr key={log.record_id} className="hover:bg-gray-50/70 transition">
                    <td className="py-3.5 px-4 font-medium text-gray-900 whitespace-nowrap">
                      {log.date}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-gray-800">{log.class_name}</div>
                      <div className="text-xs text-gray-400 font-mono">{log.subject_code}</div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {log.status === 'present' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Present
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" /> Absent
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-600">
                      {log.source === 'auto' ? (
                        <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-medium">
                          Facial Recognition (Auto)
                          {log.similarity ? ` · ${(log.similarity * 100).toFixed(0)}%` : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-medium">
                          Teacher Manual Override
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-500 whitespace-nowrap">
                      <span className={`capitalize font-medium ${log.session_status === 'active' ? 'text-amber-600' : 'text-gray-500'}`}>
                        {log.session_status === 'active' ? '● In Progress' : 'Finalized / Locked'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =========================
          Privacy & Account Deletion
          ========================= */}
      <div className="border-t pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-4">
        <div>
          NearMark FRAS v2.0 • Biometric face templates are stored securely and never shared.
        </div>
        <button
          onClick={handleDeleteAccount}
          className="flex items-center gap-1.5 text-rose-600 hover:text-rose-800 font-medium transition"
        >
          <Trash2 className="w-4 h-4" />
          Delete My Account & Biometric Data
        </button>
      </div>
    </div>
  )
}