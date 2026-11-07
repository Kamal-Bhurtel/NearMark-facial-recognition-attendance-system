import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Camera,
  UploadCloud,
  CheckCircle2,
  XCircle,
  Trash2,
  AlertCircle,
  Users,
  Search,
  Check,
  X,
  Lock,
  ChevronLeft
} from 'lucide-react'
import api from '../api'
import Spinner from '../components/Spinner'

interface RecordItem {
  record_id: string
  enrollment_id: string
  name: string
  registration_number: string
  status: string
  auto_status: string
  source: string
  similarity: number | null
  has_face: boolean
}

interface PhotoSummary {
  id: string
  index: number
  created_at: string | null
  discarded: boolean
  total_faces: number
  auto_present: number
  review: number
  unmatched: number
}

interface SessionResult {
  session_id: string
  status: string
  class_name: string
  present: number
  absent: number
  total: number
  records: RecordItem[]
  photos?: PhotoSummary[]
}

interface SelectedFilePreview {
  file: File
  previewUrl: string
}

export default function Attendance() {
  const [searchParams] = useSearchParams()
  const classId = searchParams.get('class_id') || ''
  const existingSessionId = searchParams.get('session_id') || ''
  const navigate = useNavigate()

  const [sessionId, setSessionId] = useState('')
  const [result, setResult] = useState<SessionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Multi-photo state
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedFilePreview[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Filters & search
  const [filterTab, setFilterTab] = useState<'all' | 'present' | 'absent'>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const showMessage = (msg: string) => {
    setMessage(msg)
    setError('')
    setTimeout(() => setMessage(''), 5000)
  }

  const showError = (msg: string) => {
    setError(msg)
    setMessage('')
  }

  // Load results for an existing attendance session
  const loadResults = async (sid: string) => {
    try {
      const res = await api.get(`/attendance/${sid}/results`)
      setResult(res.data)
      setSessionId(sid)
    } catch (err: any) {
      showError(err.response?.data?.detail || 'Failed to load results')
      throw err
    }
  }

  // Clean up object URLs when selectedPhotos change or unmount
  useEffect(() => {
    return () => {
      selectedPhotos.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    }
  }, [selectedPhotos])

  // Resume or discover active session
  useEffect(() => {
    const resume = async () => {
      if (existingSessionId) {
        setSessionId(existingSessionId)
        setLoading(true)
        try {
          await loadResults(existingSessionId)
        } catch {
          showError('Could not load the previous session')
        } finally {
          setLoading(false)
        }
        return
      }

      if (classId && !existingSessionId) {
        try {
          const res = await api.get('/attendance/active')
          const active = res.data.find((s: any) => s.class_id === classId)
          if (active) {
            setLoading(true)
            await loadResults(active.session_id)
          }
        } catch {
          // No active session found
        } finally {
          setLoading(false)
        }
      }
    }

    resume()
  }, [classId, existingSessionId])

  // Start a new attendance session
  const startSession = async () => {
    if (!classId) {
      showError('No class selected')
      return
    }

    setLoading(true)
    try {
      const res = await api.post(`/attendance/start/${classId}`)
      setSessionId(res.data.session_id)
      showMessage(res.data.message)
      await loadResults(res.data.session_id)
    } catch (err: any) {
      showError(err.response?.data?.detail || 'Failed to start session')
    } finally {
      setLoading(false)
    }
  }

  // File selection handlers (Multi-photo)
  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return

    const newItems: SelectedFilePreview[] = []
    const totalCount = selectedPhotos.length + files.length

    if (totalCount > 10) {
      showError('You can upload up to 10 photos maximum.')
      return
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith('image/')) {
        continue
      }
      newItems.push({
        file,
        previewUrl: URL.createObjectURL(file)
      })
    }

    setSelectedPhotos((prev) => [...prev, ...newItems])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeSelectedPhoto = (index: number) => {
    setSelectedPhotos((prev) => {
      const itemToRemove = prev[index]
      if (itemToRemove) {
        URL.revokeObjectURL(itemToRemove.previewUrl)
      }
      return prev.filter((_, i) => i !== index)
    })
  }

  const clearAllSelectedPhotos = () => {
    selectedPhotos.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    setSelectedPhotos([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Upload classroom photos (multi-file)
  const handleUploadPhotos = async (e: React.FormEvent) => {
    e.preventDefault()

    if (selectedPhotos.length === 0 || !sessionId) return

    setUploading(true)
    setUploadProgress(`Processing ${selectedPhotos.length} classroom photo(s)...`)

    const formData = new FormData()
    selectedPhotos.forEach((item) => {
      formData.append('files', item.file)
    })

    try {
      const res = await api.post(`/attendance/${sessionId}/upload-photos`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      const newlyMarked = res.data.newly_marked_present || 0
      const totalPresent = res.data.total_present || 0
      const totalProcessed = res.data.photos_processed || selectedPhotos.length

      showMessage(
        `Processed ${totalProcessed} photo(s)! Marked ${newlyMarked} new student(s) Present (Total Present: ${totalPresent}).`
      )

      clearAllSelectedPhotos()
      await loadResults(sessionId)
    } catch (err: any) {
      showError(err.response?.data?.detail || 'Failed to process classroom photos')
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }

  // Discard a photo from the session
  const discardPhoto = async (photoId: string, photoIndex: number) => {
    if (
      !window.confirm(
        `Are you sure you want to discard Photo #${photoIndex}? Attendance will be recalculated without this photo.`
      )
    ) {
      return
    }

    try {
      await api.post(`/attendance/${sessionId}/photos/${photoId}/discard`)
      showMessage(`Photo #${photoIndex} discarded. Attendance recalculated.`)
      await loadResults(sessionId)
    } catch (err: any) {
      showError(err.response?.data?.detail || 'Failed to discard photo')
    }
  }

  // Override student attendance status
  const override = async (enrollmentId: string, newStatus: string, name: string) => {
    if (!window.confirm(`Mark ${name} as ${newStatus}?`)) return

    try {
      await api.post(
        `/attendance/${sessionId}/override?enrollment_id=${enrollmentId}&status=${newStatus}`
      )
      showMessage(`${name} marked as ${newStatus}`)
      await loadResults(sessionId)
    } catch (err: any) {
      showError(err.response?.data?.detail || 'Override failed')
    }
  }

  // Lock attendance session
  const lockSession = async () => {
    if (
      !window.confirm(
        'Lock this attendance session? You will not be able to change attendance or upload more photos after finalizing.'
      )
    ) {
      return
    }

    try {
      await api.post(`/attendance/${sessionId}/lock`)
      showMessage('Session locked and finalized successfully!')
      await loadResults(sessionId)
    } catch (err: any) {
      showError(err.response?.data?.detail || 'Failed to lock session')
    }
  }

  // Filtered & searched records
  const filteredRecords = (result?.records || []).filter((r) => {
    const matchesFilter =
      filterTab === 'all' ||
      (filterTab === 'present' && r.status === 'present') ||
      (filterTab === 'absent' && r.status === 'absent')

    const term = searchTerm.toLowerCase().trim()
    const matchesSearch =
      !term ||
      r.name.toLowerCase().includes(term) ||
      r.registration_number.toLowerCase().includes(term)

    return matchesFilter && matchesSearch
  })

  const suggestedAngleLabels = [
    'Left Side of Classroom',
    'Center / Middle Rows',
    'Right Side of Classroom',
    'Back Rows'
  ]

  const activePhotosCount = result?.photos?.filter((p) => !p.discarded).length || 0
  const attendancePercent =
    result && result.total > 0 ? Math.round((result.present / result.total) * 100) : 0

  return (
    <div className="max-w-4xl mx-auto mt-6 space-y-6 pb-16 px-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/teacher')}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition"
            title="Back to Dashboard"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Classroom Attendance</h1>
            <p className="text-sm text-gray-500">
              Upload 3–4 classroom photos for full multi-angle student coverage
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/teacher')}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Teacher Dashboard
        </button>
      </div>

      {/* Notifications */}
      {message && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-sm shadow-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-sm shadow-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Start Session Prompt */}
      {!sessionId && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center space-y-4">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
            <Camera className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Start Attendance Session</h2>
            <p className="text-gray-500 text-sm max-w-md mx-auto mt-1">
              Begin a live session for this class. Once started, you can take or upload 3–4 photos of the classroom to mark all present students automatically.
            </p>
          </div>

          <button
            onClick={startSession}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-2.5 rounded-xl font-medium shadow-sm flex items-center justify-center gap-2 mx-auto transition"
          >
            {loading && <Spinner size="sm" />}
            {loading ? 'Starting Session...' : 'Start Live Session'}
          </button>
        </div>
      )}

      {/* Active Session Content */}
      {sessionId && result && (
        <>
          {/* Top Session Stats Bar */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <div className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span>{result.class_name}</span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                      result.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-gray-100 text-gray-700 border border-gray-200'
                    }`}
                  >
                    {result.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Active Photos: <span className="font-semibold text-gray-700">{activePhotosCount}</span> | AI Union Matching Active
                </p>
              </div>

              {/* Present / Absent Badges */}
              <div className="flex items-center gap-3">
                <div className="bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-xl text-center">
                  <div className="text-xs font-medium text-emerald-600 uppercase">Present</div>
                  <div className="text-lg font-bold text-emerald-700">{result.present}</div>
                </div>

                <div className="bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl text-center">
                  <div className="text-xs font-medium text-rose-600 uppercase">Absent</div>
                  <div className="text-lg font-bold text-rose-700">{result.absent}</div>
                </div>

                <div className="bg-gray-50 border border-gray-200 px-4 py-2 rounded-xl text-center">
                  <div className="text-xs font-medium text-gray-500 uppercase">Total</div>
                  <div className="text-lg font-bold text-gray-800">{result.total}</div>
                </div>
              </div>
            </div>

            {/* Attendance Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1.5 font-medium">
                <span>Class Attendance</span>
                <span>{attendancePercent}% ({result.present} of {result.total} students)</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${attendancePercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Multi-Photo Upload Section (Active Session only) */}
          {result.status === 'active' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Camera className="w-5 h-5 text-purple-600" />
                    Upload Classroom Photos
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Select 3–4 photos (e.g. Left, Center, Right, Back) for wide-angle classroom coverage. Attendance marks any student visible in <em>any</em> photo.
                  </p>
                </div>

                {selectedPhotos.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllSelectedPhotos}
                    disabled={uploading}
                    className="text-xs text-rose-600 hover:text-rose-800 font-medium self-start sm:self-auto"
                  >
                    Clear Selected ({selectedPhotos.length})
                  </button>
                )}
              </div>

              {/* Photo Previews Strip */}
              {selectedPhotos.length > 0 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {selectedPhotos.map((item, idx) => (
                      <div
                        key={idx}
                        className="relative group border border-gray-200 rounded-xl overflow-hidden bg-gray-50 shadow-sm flex flex-col"
                      >
                        <div className="h-28 w-full bg-gray-900 overflow-hidden relative">
                          <img
                            src={item.previewUrl}
                            alt={`Preview ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md backdrop-blur-xs">
                            Photo #{idx + 1}
                          </span>
                          {!uploading && (
                            <button
                              type="button"
                              onClick={() => removeSelectedPhoto(idx)}
                              className="absolute top-1.5 right-1.5 bg-rose-600/90 hover:bg-rose-600 text-white p-1 rounded-md transition shadow"
                              title="Remove photo"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="p-2 text-xs">
                          <div className="font-medium text-gray-700 truncate">
                            {suggestedAngleLabels[idx] || `Angle #${idx + 1}`}
                          </div>
                          <div className="text-[11px] text-gray-400 truncate">
                            {item.file.name} ({(item.file.size / (1024 * 1024)).toFixed(1)} MB)
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Dropzone / Action Bar */}
              <form onSubmit={handleUploadPhotos} className="space-y-4">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  multiple
                  onChange={(e) => handleFilesSelected(e.target.files)}
                  className="hidden"
                  id="classroom-photos-input"
                  disabled={uploading}
                />

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <label
                    htmlFor="classroom-photos-input"
                    className={`cursor-pointer border-2 border-dashed border-gray-300 hover:border-purple-500 rounded-xl px-5 py-4 flex items-center justify-center gap-3 text-sm text-gray-600 hover:text-purple-600 hover:bg-purple-50/50 transition w-full sm:flex-1 ${
                      uploading ? 'pointer-events-none opacity-50' : ''
                    }`}
                  >
                    <UploadCloud className="w-5 h-5 text-purple-600" />
                    <span className="font-medium">
                      {selectedPhotos.length === 0
                        ? 'Select 3–4 Classroom Photos'
                        : `+ Add More Photos (${selectedPhotos.length} selected)`}
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={uploading || selectedPhotos.length === 0}
                    className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-6 py-4 rounded-xl font-medium shadow-sm flex items-center justify-center gap-2 transition"
                  >
                    {uploading ? (
                      <>
                        <Spinner size="sm" />
                        <span>Processing Photos...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>
                          {selectedPhotos.length > 0
                            ? `Process ${selectedPhotos.length} Photo${
                                selectedPhotos.length > 1 ? 's' : ''
                              }`
                            : 'Upload & Match'}
                        </span>
                      </>
                    )}
                  </button>
                </div>

                {uploading && (
                  <div className="bg-purple-50 border border-purple-200 text-purple-900 p-3 rounded-xl text-xs flex items-center gap-2">
                    <Spinner size="sm" />
                    <span>{uploadProgress || 'Extracting face embeddings and calculating student matches...'}</span>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* Uploaded Session Photos Summary */}
          {result.photos && result.photos.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  Uploaded Photos in this Session ({result.photos.length})
                </h2>
                <span className="text-xs text-gray-500">
                  Union-based: Students present in any active photo are marked Present
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {result.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className={`border rounded-xl p-3.5 space-y-2 transition ${
                      photo.discarded
                        ? 'bg-gray-50 border-gray-200 opacity-60'
                        : 'bg-white border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-800">
                          Photo #{photo.index}
                        </span>
                        {photo.discarded ? (
                          <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                            Discarded
                          </span>
                        ) : (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-medium">
                            Active
                          </span>
                        )}
                      </div>

                      {result.status === 'active' && !photo.discarded && (
                        <button
                          type="button"
                          onClick={() => discardPhoto(photo.id, photo.index)}
                          className="text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1 font-medium"
                          title="Discard photo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Discard</span>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-medium">
                        {photo.auto_present} Auto Present
                      </span>
                      {photo.review > 0 && (
                        <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-medium">
                          {photo.review} Review
                        </span>
                      )}
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {photo.total_faces} Total Faces
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Student Attendance List with Filters */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Student Attendance Roster</h2>
                <p className="text-xs text-gray-500">
                  Verify attendance and make manual adjustments as needed
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-medium self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    filterTab === 'all'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All ({result.records.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('present')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    filterTab === 'present'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Present ({result.present})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('absent')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    filterTab === 'absent'
                      ? 'bg-white text-rose-700 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Absent ({result.absent})
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search students by name or registration number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Students List */}
            <div className="space-y-2">
              {filteredRecords.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No students found matching current filter or search.
                </div>
              ) : (
                filteredRecords.map((r) => {
                  const isPresent = r.status === 'present'
                  const confidence = r.similarity ? Math.round(r.similarity * 100) : null

                  return (
                    <div
                      key={r.record_id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between border border-gray-200 hover:border-gray-300 rounded-xl p-3.5 gap-3 transition bg-white"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate flex items-center gap-2">
                          <span>{r.name}</span>
                          {!r.has_face && (
                            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-normal">
                              No face profile
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                          <span className="font-mono">{r.registration_number}</span>
                          {confidence !== null && isPresent && (
                            <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              Match: {confidence}%
                            </span>
                          )}
                          {r.source === 'manual' && (
                            <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              Manual
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <span
                          className={`text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1 ${
                            isPresent
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {isPresent ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>PRESENT</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" />
                              <span>ABSENT</span>
                            </>
                          )}
                        </span>

                        {result.status === 'active' && (
                          <div className="flex gap-1.5">
                            {!isPresent ? (
                              <button
                                type="button"
                                onClick={() => override(r.enrollment_id, 'present', r.name)}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg font-medium transition shadow-xs"
                              >
                                Mark Present
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => override(r.enrollment_id, 'absent', r.name)}
                                className="text-xs bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-lg font-medium transition shadow-xs"
                              >
                                Mark Absent
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Finalize Session / Lock CTA */}
          {result.status === 'active' && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center space-y-3">
              <h3 className="font-semibold text-gray-900">Done Taking Attendance?</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Once locked, attendance is finalized into students' official records. Review the student counts above before locking.
              </p>
              <button
                onClick={lockSession}
                className="bg-gray-900 hover:bg-black text-white px-8 py-3 rounded-xl font-medium shadow transition inline-flex items-center gap-2"
              >
                <Lock className="w-4 h-4" />
                <span>Finalize & Lock Session</span>
              </button>
            </div>
          )}

          {result.status === 'locked' && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-6 rounded-2xl text-center space-y-2">
              <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base">Attendance Finalized & Locked</h3>
              <p className="text-xs text-emerald-700">
                Official attendance has been recorded for {result.present} present and {result.absent} absent students.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
