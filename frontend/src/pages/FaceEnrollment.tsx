import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function FaceEnrollment() {
  const [files, setFiles] = useState<FileList | null>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files
    if (!selected) return

    if (selected.length > 3) {
      setError('You can upload maximum 3 photos')
      return
    }

    setFiles(selected)
    setError('')

    // Create previews
    const urls: string[] = []
    Array.from(selected).forEach((file) => {
      urls.push(URL.createObjectURL(file))
    })
    setPreviews(urls)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!files || files.length === 0) {
      setError('Please select at least 1 photo')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    const formData = new FormData()
    Array.from(files).forEach((file) => {
      formData.append('files', file)
    })

    try {
      const res = await api.post('/enrollment/upload-faces', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setMessage(res.data.message + ` (${res.data.faces_accepted} face(s) accepted)`)
      setTimeout(() => {
        navigate('/student')
      }, 2500)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        setError(detail)
      } else {
        setError('Failed to enroll face. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto mt-10 space-y-6">
      <h1 className="text-2xl font-bold text-center">NearMark - Face Enrollment</h1>

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <p className="text-sm text-gray-600">
          Upload <b>1 to 3 clear photos</b> of your face (front-facing is best).
          Good lighting, no sunglasses, no mask.
        </p>

        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-100 text-green-700 p-3 rounded text-sm">{message}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          {/* Image previews */}
          {previews.length > 0 && (
            <div className="flex gap-3 flex-wrap">
              {previews.map((url, idx) => (
                <img
                  key={idx}
                  src={url}
                  alt={`Preview ${idx + 1}`}
                  className="w-24 h-24 object-cover rounded border"
                />
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2 rounded font-medium"
          >
            {loading ? 'Processing... Please wait' : 'Submit Face Photos'}
          </button>
        </form>
      </div>

      <div className="text-center">
        <button
          onClick={() => navigate('/student')}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  )
}