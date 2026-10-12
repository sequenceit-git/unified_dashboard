import { useRef, useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'

export default function ImageDropzone({ images = [], onChange, maxImages = 10, label = 'Product Images' }) {
  const { token } = useAuth()
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return
    setError('')
    setUploading(true)

    try {
      const validFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
      if (validFiles.length === 0) {
        setError('Please drop valid image files (JPG, PNG, WebP, GIF)')
        setUploading(false)
        return
      }

      // Convert files to base64 Data URLs
      const readAsDataUrl = (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

      const base64List = await Promise.all(validFiles.map(readAsDataUrl))

      // Upload to backend API /api/upload
      try {
        const res = await api.post('/api/upload', { images: base64List }, token)
        const uploadedUrls = res.urls || []
        const next = [...images, ...uploadedUrls].slice(0, maxImages)
        onChange(next)
      } catch (uploadErr) {
        // Fallback: use base64 data URLs directly if offline/upload failed
        console.warn('Upload API fallback to data URL:', uploadErr.message)
        const next = [...images, ...base64List].slice(0, maxImages)
        onChange(next)
      }
    } catch (err) {
      setError(err.message || 'Failed to process images')
    } finally {
      setUploading(false)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const removeImage = (indexToRemove) => {
    onChange(images.filter((_, idx) => idx !== indexToRemove))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-xs text-gray-400 font-medium">
          {images.length} / {maxImages} images
        </span>
      </div>

      {/* Drag & Drop Target Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
          isDragging
            ? 'border-indigo-500 bg-indigo-50/70 scale-[0.99]'
            : 'border-gray-300 bg-gray-50/50 hover:border-indigo-400 hover:bg-gray-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-xs border border-gray-100 text-indigo-600 mb-2">
          {uploading ? (
            <svg className="h-6 w-6 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          )}
        </div>

        <p className="text-sm font-semibold text-gray-700">
          {uploading ? 'Processing & uploading images…' : 'Drag & drop image files here, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-gray-400">Supports JPG, PNG, WebP up to 15MB each</p>
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      {/* Uploaded Thumbnails Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 pt-1">
          {images.map((url, i) => (
            <div key={`${url.slice(0, 30)}-${i}`} className="group relative aspect-square rounded-lg border border-gray-200 bg-white overflow-hidden shadow-xs">
              <img
                src={url}
                alt={`Uploaded ${i + 1}`}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/150?text=Image'
                }}
              />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.2 text-[10px] font-bold text-white">
                #{i + 1}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeImage(i)
                }}
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white shadow-xs opacity-90 transition hover:bg-red-700 hover:scale-110"
                title="Remove image"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
