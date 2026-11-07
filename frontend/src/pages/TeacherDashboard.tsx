import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import Spinner from '../components/Spinner'

interface ClassItem {
  id: string
  class_name: string
  subject_code: string
  student_count?: number
}

interface PendingStudent {
  id: string
  full_name: string
  registration_number: string
  status: string
  has_face: boolean
  face_crop_base64?: string
}

interface RosterStudent {
  id: string
  registration_number: string
  roster_name: string
  roster_email: string
  status: string
  student_id: string | null
}

interface ActiveSession {
  session_id: string
  class_id: string
  class_name: string
  started_at: string | null
}

export default function TeacherDashboard() {
  const navigate = useNavigate()

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [pending, setPending] = useState<PendingStudent[]>([])
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([])

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [className, setClassName] = useState('')
  const [subjectCode, setSubjectCode] = useState('')
  const [creating, setCreating] = useState(false)

  const [selectedClassId, setSelectedClassId] = useState('')
  const [rosterFile, setRosterFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const [viewingClassId, setViewingClassId] = useState('')
  const [roster, setRoster] = useState<RosterStudent[]>([])
  const [loadingRoster, setLoadingRoster] = useState(false)

  const [rosterTab, setRosterTab] = useState<'csv' | 'manual'>('csv')
  const [singleClassId, setSingleClassId] = useState('')
  const [singleName, setSingleName] = useState('')
  const [singleReg, setSingleReg] = useState('')
  const [singleEmail, setSingleEmail] = useState('')
  const [addingSingle, setAddingSingle] = useState(false)

  const [replaceRoster, setReplaceRoster] = useState(false)
  const [editingEnrollmentId, setEditingEnrollmentId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editReg, setEditReg] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // =========================
  // Load dashboard data
  // =========================
  const loadData = async (targetViewingId?: string) => {
    try {
      setLoading(true)

      const [classRes, pendingRes, activeRes] = await Promise.all([
        api.get('/classes/'),
        api.get('/approvals/pending'),
        api.get('/attendance/active'),
      ])

      const classesWithCount = await Promise.all(
        classRes.data.map(async (c: ClassItem) => {
          try {
            const rosterRes = await api.get(`/classes/${c.id}/roster`)

            return {
              ...c,
              student_count: rosterRes.data.length,
            }
          } catch {
            return {
              ...c,
              student_count: 0,
            }
          }
        })
      )

      setClasses(classesWithCount)
      setPending(pendingRes.data)
      setActiveSessions(activeRes.data)

      const idToRefresh = targetViewingId !== undefined ? targetViewingId : viewingClassId
      if (idToRefresh) {
        try {
          const freshRoster = await api.get(`/classes/${idToRefresh}/roster`)
          setRoster(freshRoster.data)
        } catch {}
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // =========================
  // Messages
  // =========================
  const showMessage = (msg: string) => {
    setMessage(msg)
    setError('')

    setTimeout(() => setMessage(''), 3500)
  }

  const showError = (msg: string) => {
    setError(msg)
    setMessage('')
  }

  // =========================
  // Create class
  // =========================
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)

    try {
      await api.post('/classes/', {
        class_name: className,
        subject_code: subjectCode,
      })

      showMessage('Class created successfully!')

      setClassName('')
      setSubjectCode('')

      loadData()
    } catch (err: any) {
      showError(
        err.response?.data?.detail || 'Failed to create class'
      )
    } finally {
      setCreating(false)
    }
  }

  // =========================
  // Upload roster
  // =========================
  const handleUploadRoster = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedClassId || !rosterFile) {
      showError('Please select a class and a CSV file')
      return
    }

    setUploading(true)

    const formData = new FormData()
    formData.append('file', rosterFile)
    formData.append('replace', replaceRoster ? 'true' : 'false')

    try {
      const res = await api.post(
        `/classes/${selectedClassId}/roster`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      )

      showMessage(
        `Roster updated! ${res.data.length} active students in roster.`
      )

      const targetId = selectedClassId
      setRosterFile(null)
      setSelectedClassId('')
      setViewingClassId(targetId)
      setRoster(res.data)

      loadData(targetId)
    } catch (err: any) {
      showError(
        err.response?.data?.detail || 'Failed to upload roster'
      )
    } finally {
      setUploading(false)
    }
  }

  // =========================
  // Edit Roster Student Inline
  // =========================
  const handleStartEdit = (r: RosterStudent) => {
    setEditingEnrollmentId(r.id)
    setEditName(r.roster_name || '')
    setEditReg(r.registration_number || '')
    setEditEmail(r.roster_email || '')
  }

  const handleCancelEdit = () => {
    setEditingEnrollmentId(null)
    setEditName('')
    setEditReg('')
    setEditEmail('')
  }

  const handleSaveEdit = async (enrollmentId: string) => {
    if (!editName.trim() || !editReg.trim() || !editEmail.trim()) {
      showError('Name, Registration Number, and Email cannot be empty')
      return
    }

    setSavingEdit(true)
    try {
      const res = await api.put(`/classes/${viewingClassId}/roster/${enrollmentId}`, {
        registration_number: editReg.trim(),
        roster_name: editName.trim(),
        roster_email: editEmail.trim().toLowerCase(),
      })
      showMessage(`Updated student "${res.data.roster_name}"!`)
      setEditingEnrollmentId(null)
      loadData(viewingClassId)
    } catch (err: any) {
      showError(err.response?.data?.detail || 'Failed to update student')
    } finally {
      setSavingEdit(false)
    }
  }

  // =========================
  // Add Single Student to Roster
  // =========================
  const handleAddSingleStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!singleClassId || !singleName || !singleReg || !singleEmail) {
      showError('Please fill all fields: Class, Name, Reg No, and Email')
      return
    }

    setAddingSingle(true)
    try {
      await api.post(`/classes/${singleClassId}/roster/student`, {
        registration_number: singleReg.trim(),
        roster_name: singleName.trim(),
        roster_email: singleEmail.trim().toLowerCase(),
      })

      showMessage(`Added "${singleName.trim()}" to roster!`)
      setSingleName('')
      setSingleReg('')
      setSingleEmail('')

      loadData()
      if (viewingClassId === singleClassId) {
        handleViewRoster(singleClassId)
      }
    } catch (err: any) {
      showError(
        err.response?.data?.detail || 'Failed to add student to roster'
      )
    } finally {
      setAddingSingle(false)
    }
  }

  // =========================
  // View roster
  // =========================
  const handleViewRoster = async (classId: string) => {
    if (viewingClassId === classId) {
      setViewingClassId('')
      return
    }

    setViewingClassId(classId)
    setLoadingRoster(true)

    try {
      const res = await api.get(`/classes/${classId}/roster`)
      setRoster(res.data)
    } catch {
      showError('Failed to load roster')
    } finally {
      setLoadingRoster(false)
    }
  }

  // =========================
  // Delete student from roster
  // =========================
  const handleDeleteFromRoster = async (
    classId: string,
    enrollmentId: string,
    name: string
  ) => {
    if (!window.confirm(`Remove "${name}" from this roster?`)) {
      return
    }

    try {
      await api.delete(
        `/classes/${classId}/roster/${enrollmentId}`
      )

      showMessage(`"${name}" removed from roster`)

      // Refresh the currently displayed roster
      const res = await api.get(`/classes/${classId}/roster`)
      setRoster(res.data)

      // Refresh student count on the class
      loadData()
    } catch (err: any) {
      showError(
        err.response?.data?.detail ||
          'Failed to remove student'
      )
    }
  }

  // =========================
  // Reset student password
  // =========================
  const handleResetPassword = async (
    name: string,
    studentId?: string | null,
    registrationNumber?: string
  ) => {
    const newPassword = window.prompt(
      `Enter a new temporary password for "${name}":\n\n(Minimum 6 characters)`
    )

    if (!newPassword) return

    if (newPassword.length < 6) {
      showError('Password must be at least 6 characters')
      return
    }

    if (!window.confirm(`Reset password for "${name}"?`)) return

    try {
      const payload: any = {
        new_password: newPassword,
      }

      if (registrationNumber) {
        payload.registration_number = registrationNumber
      }

      // If we have student_id, pass it as query param
      const url = studentId
        ? `/students/reset-password?student_id=${studentId}`
        : `/students/reset-password`

      await api.post(url, payload)

      showMessage(
        `Password reset for "${name}". Tell the student the new password.`
      )
    } catch (err: any) {
      showError(
        err.response?.data?.detail ||
          'Failed to reset password'
      )
    }
  }

  // =========================
  // Delete class
  // =========================
  const handleDeleteClass = async (
    classId: string,
    name: string
  ) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the class "${name}"?\n\nThis will also delete its roster.`
      )
    ) {
      return
    }

    try {
      await api.delete(`/classes/${classId}`)

      showMessage(
        `Class "${name}" deleted successfully`
      )

      if (viewingClassId === classId) {
        setViewingClassId('')
        setRoster([])
      }

      loadData()
    } catch (err: any) {
      showError(
        err.response?.data?.detail ||
          'Failed to delete class'
      )
    }
  }

  // =========================
  // Terminate attendance
  // =========================
  const handleTerminateSession = async (
    sessionId: string,
    className: string
  ) => {
    if (
      !window.confirm(
        `Terminate the active session for "${className}"?`
      )
    ) {
      return
    }

    try {
      await api.post(`/attendance/${sessionId}/cancel`)

      showMessage(
        `Session for "${className}" terminated`
      )

      loadData()
    } catch (err: any) {
      showError(
        err.response?.data?.detail ||
          'Failed to terminate session'
      )
    }
  }

  // =========================
  // Approve student
  // =========================
  const approve = async (
    id: string,
    name: string
  ) => {
    if (!window.confirm(`Approve ${name}?`)) {
      return
    }

    setActionLoading(id)

    try {
      await api.post(`/approvals/${id}/approve`)

      showMessage(
        `${name} approved successfully`
      )

      loadData()
    } catch (err: any) {
      showError(
        err.response?.data?.detail ||
          'Error approving'
      )
    } finally {
      setActionLoading(null)
    }
  }

  // =========================
  // Reject student
  // =========================
  const reject = async (
    id: string,
    name: string
  ) => {
    if (
      !window.confirm(
        `Reject ${name}? This cannot be undone easily.`
      )
    ) {
      return
    }

    setActionLoading(id)

    try {
      await api.post(
        `/approvals/${id}/reject`,
        {
          reason: 'Rejected by teacher',
        }
      )

      showMessage(`${name} rejected`)

      loadData()
    } catch (err: any) {
      showError(
        err.response?.data?.detail ||
          'Error rejecting'
      )
    } finally {
      setActionLoading(null)
    }
  }

  // =========================
  // Loading state
  // =========================
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center mt-24 gap-3 text-gray-500">
        <Spinner />
        <span>Loading dashboard...</span>
      </div>
    )
  }

  // =========================
  // Dashboard
  // =========================
  return (
    <div className="space-y-8 mt-6 pb-12">
      <h1 className="text-2xl font-bold">
        NearMark — Teacher Dashboard
      </h1>

      {message && (
        <div className="bg-green-100 text-green-800 p-3 rounded-lg text-sm">
          {message}
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* =========================
          Active Sessions
          ========================= */}
      {activeSessions.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl shadow p-5">
          <h2 className="text-lg font-semibold mb-3 text-yellow-800">
            Active Attendance Sessions (
            {activeSessions.length})
          </h2>

          <div className="space-y-3">
            {activeSessions.map((s) => (
              <div
                key={s.session_id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white rounded-lg p-3"
              >
                <div>
                  <div className="font-medium">
                    {s.class_name}
                  </div>

                  <div className="text-xs text-gray-500">
                    Started:{' '}
                    {s.started_at
                      ? new Date(
                          s.started_at
                        ).toLocaleString()
                      : '—'}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      navigate(
                        `/attendance?class_id=${s.class_id}&session_id=${s.session_id}`
                      )
                    }
                    className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg"
                  >
                    Continue
                  </button>

                  <button
                    onClick={() =>
                      handleTerminateSession(
                        s.session_id,
                        s.class_name
                      )
                    }
                    className="text-sm bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg"
                  >
                    Terminate
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================
          Create Class
          ========================= */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="text-lg font-semibold mb-3">
          Create New Class
        </h2>

        <form
          onSubmit={handleCreateClass}
          className="flex flex-col sm:flex-row gap-3"
        >
          <input
            type="text"
            placeholder="Class Name"
            value={className}
            onChange={(e) =>
              setClassName(e.target.value)
            }
            className="border rounded-lg px-3 py-2 flex-1"
            required
          />

          <input
            type="text"
            placeholder="Subject Code"
            value={subjectCode}
            onChange={(e) =>
              setSubjectCode(e.target.value)
            }
            className="border rounded-lg px-3 py-2 sm:w-36"
            required
          />

          <button
            type="submit"
            disabled={creating}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-5 py-2 rounded-lg flex items-center justify-center gap-2"
          >
            {creating && <Spinner size="sm" />}

            {creating
              ? 'Creating...'
              : 'Create'}
          </button>
        </form>
      </div>

      {/* =========================
          Roster Management (CSV / Manual)
          ========================= */}
      <div className="bg-white rounded-xl shadow p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
          <h2 className="text-lg font-semibold">
            Manage Class Roster
          </h2>
          <div className="flex rounded-lg bg-gray-100 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setRosterTab('csv')}
              className={`px-3 py-1.5 rounded-md transition ${
                rosterTab === 'csv'
                  ? 'bg-white shadow text-purple-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Upload CSV
            </button>
            <button
              type="button"
              onClick={() => setRosterTab('manual')}
              className={`px-3 py-1.5 rounded-md transition ${
                rosterTab === 'manual'
                  ? 'bg-white shadow text-purple-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              + Add Single Student
            </button>
          </div>
        </div>

        {rosterTab === 'csv' ? (
          <form
            onSubmit={handleUploadRoster}
            className="space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedClassId}
                onChange={(e) =>
                  setSelectedClassId(e.target.value)
                }
                className="border rounded-lg px-3 py-2 flex-1"
                required
              >
                <option value="">
                  Select a class
                </option>

                {classes.map((c) => (
                  <option
                    key={c.id}
                    value={c.id}
                  >
                    {c.class_name} ({c.subject_code})
                  </option>
                ))}
              </select>

              <input
                type="file"
                accept=".csv"
                onChange={(e) =>
                  setRosterFile(
                    e.target.files?.[0] || null
                  )
                }
                className="border rounded-lg px-3 py-2"
                required
              />

              <button
                type="submit"
                disabled={uploading}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-5 py-2 rounded-lg flex items-center justify-center gap-2"
              >
                {uploading && (
                  <Spinner size="sm" />
                )}

                {uploading
                  ? 'Uploading...'
                  : 'Upload CSV'}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceRoster}
                  onChange={(e) => setReplaceRoster(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span>
                  <b>Sync / Replace mode:</b> Overwrite class roster to match this CSV (removes dropped students).
                </span>
              </label>
              <p className="text-xs text-gray-500">
                Columns: <b>Name, RegistrationNumber, Email</b>
              </p>
            </div>
          </form>
        ) : (
          <form
            onSubmit={handleAddSingleStudent}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select
                value={singleClassId}
                onChange={(e) => setSingleClassId(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
                required
              >
                <option value="">Select Class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.class_name} ({c.subject_code})
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Student Full Name"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
                required
              />

              <input
                type="text"
                placeholder="Reg. No (e.g. 2024CS042)"
                value={singleReg}
                onChange={(e) => setSingleReg(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
                required
              />

              <input
                type="email"
                placeholder="Email Address"
                value={singleEmail}
                onChange={(e) => setSingleEmail(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={addingSingle}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-5 py-2 rounded-lg text-sm flex items-center justify-center gap-2"
              >
                {addingSingle && <Spinner size="sm" />}
                {addingSingle ? 'Adding Student...' : 'Add to Roster'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* =========================
          Pending Approvals
          ========================= */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="text-lg font-semibold mb-4">
          Pending Approvals ({pending.length})
        </h2>

        {pending.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No students waiting for approval
          </p>
        ) : (
          <div className="space-y-4">
            {pending.map((s) => (
              <div
                key={s.id}
                className="border rounded-lg p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center"
              >
                <div className="flex-shrink-0">
                  {s.face_crop_base64 ? (
                    <img
                      src={`data:image/jpeg;base64,${s.face_crop_base64}`}
                      alt="Face"
                      className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border"
                    />
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-400">
                      No photo
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-base sm:text-lg truncate">
                    {s.full_name}
                  </div>

                  <div className="text-sm text-gray-500">
                    {s.registration_number}
                  </div>

                  <div className="mt-1">
                    {s.has_face ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        Face enrolled
                      </span>
                    ) : (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                        No face yet
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                  <button
                    onClick={() =>
                      approve(
                        s.id,
                        s.full_name
                      )
                    }
                    disabled={
                      actionLoading === s.id
                    }
                    className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-4 py-1.5 rounded-lg text-sm flex items-center justify-center gap-1"
                  >
                    {actionLoading ===
                    s.id ? (
                      <Spinner size="sm" />
                    ) : (
                      'Approve'
                    )}
                  </button>

                  <button
                    onClick={() =>
                      reject(
                        s.id,
                        s.full_name
                      )
                    }
                    disabled={
                      actionLoading === s.id
                    }
                    className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-4 py-1.5 rounded-lg text-sm"
                  >
                    Reject
                  </button>

                  <button
                    onClick={() =>
                      handleResetPassword(
                        s.full_name,
                        s.id
                      )
                    }
                    className="flex-1 sm:flex-none bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-1.5 rounded-lg text-sm"
                  >
                    Reset Password
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =========================
          My Classes
          ========================= */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="text-lg font-semibold mb-4">
          My Classes
        </h2>

        {classes.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No classes yet. Create one above.
          </p>
        ) : (
          <div className="space-y-3">
            {classes.map((c) => (
              <div
                key={c.id}
                className="border rounded-lg p-3"
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div>
                    <div className="font-medium">
                      {c.class_name}
                    </div>

                    <div className="text-sm text-gray-500">
                      {c.subject_code} ·{' '}
                      {c.student_count ?? 0}{' '}
                      students
                    </div>
                  </div>

                  <div className="flex gap-2 self-start flex-wrap">
                    <button
                      onClick={() =>
                        navigate(
                          `/attendance?class_id=${c.id}`
                        )
                      }
                      className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg"
                    >
                      Take Attendance
                    </button>

                    <button
                      onClick={() =>
                        handleViewRoster(c.id)
                      }
                      className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg"
                    >
                      {viewingClassId === c.id
                        ? 'Hide Roster'
                        : 'View Roster'}
                    </button>

                    <button
                      onClick={() =>
                        handleDeleteClass(
                          c.id,
                          c.class_name
                        )
                      }
                      className="text-sm bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* =========================
                    Roster
                    ========================= */}
                {viewingClassId === c.id && (
                  <div className="mt-4 overflow-x-auto">
                    {loadingRoster ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                        <Spinner size="sm" />
                        Loading roster...
                      </div>
                    ) : roster.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No students in this roster
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b">
                            <th className="py-2 pr-2">
                              Name
                            </th>

                            <th className="py-2 pr-2">
                              Reg. No
                            </th>

                            <th className="py-2 pr-2 hidden sm:table-cell">
                              Email
                            </th>

                            <th className="py-2">
                              Linked
                            </th>

                            <th className="py-2">
                              Action
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {roster.map((r) => (
                            <tr
                              key={r.id}
                              className="border-b last:border-0 hover:bg-gray-50/50"
                            >
                              {editingEnrollmentId === r.id ? (
                                <>
                                  <td className="py-2 pr-2">
                                    <input
                                      type="text"
                                      value={editName}
                                      onChange={(e) => setEditName(e.target.value)}
                                      className="border rounded px-2 py-1 text-xs w-full"
                                      placeholder="Full Name"
                                    />
                                  </td>
                                  <td className="py-2 pr-2">
                                    <input
                                      type="text"
                                      value={editReg}
                                      onChange={(e) => setEditReg(e.target.value)}
                                      className="border rounded px-2 py-1 text-xs w-full"
                                      placeholder="Reg. No"
                                    />
                                  </td>
                                  <td className="py-2 pr-2 hidden sm:table-cell">
                                    <input
                                      type="email"
                                      value={editEmail}
                                      onChange={(e) => setEditEmail(e.target.value)}
                                      className="border rounded px-2 py-1 text-xs w-full"
                                      placeholder="Email"
                                    />
                                  </td>
                                  <td className="py-2">
                                    <span className="text-gray-400 text-xs">-</span>
                                  </td>
                                  <td className="py-2">
                                    <div className="flex gap-2 items-center">
                                      <button
                                        onClick={() => handleSaveEdit(r.id)}
                                        disabled={savingEdit}
                                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded font-medium"
                                      >
                                        {savingEdit ? 'Saving...' : 'Save'}
                                      </button>
                                      <button
                                        onClick={handleCancelEdit}
                                        className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2.5 py-1 rounded"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="py-2 pr-2 font-medium text-gray-900">
                                    {r.roster_name}
                                  </td>
                                  <td className="py-2 pr-2 font-mono text-xs">
                                    {r.registration_number}
                                  </td>
                                  <td className="py-2 pr-2 hidden sm:table-cell text-gray-500 text-xs">
                                    {r.roster_email}
                                  </td>
                                  <td className="py-2">
                                    {r.student_id ? (
                                      <span className="text-green-600 text-xs font-semibold">
                                        ✓ Yes
                                      </span>
                                    ) : (
                                      <span className="text-amber-500 text-xs">
                                        Pending
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <button
                                        onClick={() => handleStartEdit(r)}
                                        className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                                      >
                                        Edit
                                      </button>
                                      <span className="text-gray-300">|</span>
                                      <button
                                        onClick={() =>
                                          handleDeleteFromRoster(
                                            viewingClassId,
                                            r.id,
                                            r.roster_name || ''
                                          )
                                        }
                                        className="text-xs text-red-600 hover:text-red-800 hover:underline"
                                      >
                                        Remove
                                      </button>
                                      <span className="text-gray-300">|</span>
                                      <button
                                        onClick={() =>
                                          handleResetPassword(
                                            r.roster_name || '',
                                            r.student_id,
                                            r.registration_number
                                          )
                                        }
                                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                      >
                                        Reset Pwd
                                      </button>
                                    </div>
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center text-xs text-gray-400 pt-4">
        NearMark v1.0 — Facial Recognition Attendance System
      </div>
    </div>
  )
}