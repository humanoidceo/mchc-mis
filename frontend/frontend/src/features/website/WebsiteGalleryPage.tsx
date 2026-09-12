import { useEffect, useState } from 'react'
import { Images, Trash2, UploadCloud } from 'lucide-react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Panel, SectionHeader } from '../../components/ui'
import type { WebsiteGalleryImage } from '../../types/domain'

function errorMessage(caught: unknown): string {
  if (caught instanceof ApiError && caught.details && typeof caught.details === 'object') {
    return Object.entries(caught.details as Record<string, unknown>)
      .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
      .join(' ')
  }
  return caught instanceof Error ? caught.message : 'Unable to update the website gallery.'
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`
}

export function WebsiteGalleryPage() {
  const [images, setImages] = useState<WebsiteGalleryImage[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function loadGallery() {
    setLoading(true)
    try {
      setImages(await apiFetch<WebsiteGalleryImage[]>('/website-gallery/'))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadGallery()
  }, [])

  async function uploadImages() {
    if (!selectedFiles.length) return
    setError('')
    setMessage('')
    setUploading(true)
    try {
      const body = new FormData()
      selectedFiles.forEach((file) => body.append('images', file))
      await apiFetch<WebsiteGalleryImage[]>('/website-gallery/upload/', { method: 'POST', body })
      setSelectedFiles([])
      setMessage('Gallery photos uploaded.')
      await loadGallery()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setUploading(false)
    }
  }

  async function deleteImage(image: WebsiteGalleryImage) {
    if (!window.confirm('Delete this gallery photo?')) return
    setError('')
    try {
      await apiFetch<void>(`/website-gallery/${image.id}/`, { method: 'DELETE' })
      setMessage('Gallery photo deleted.')
      await loadGallery()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Website gallery" subtitle="Upload clinic photos for the public website. Photos larger than 1 MB are compressed automatically." />
      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Panel>
        <label className="group block cursor-pointer rounded-2xl border-2 border-dashed border-sky-200 bg-gradient-to-br from-sky-50 via-white to-pink-50 p-6 transition hover:border-pink-300 hover:shadow-md hover:shadow-sky-100">
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))} />
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-pink-500 text-white shadow-lg shadow-sky-200 transition group-hover:scale-105"><Images className="h-7 w-7" /></span>
            <div className="flex-1"><p className="font-semibold text-slate-900">Choose clinic photos</p><p className="mt-1 text-sm text-zinc-500">Select one or more JPG, PNG, or WEBP photos. Large photos are compressed below 1 MB.</p></div>
            <span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-sky-700 shadow-sm ring-1 ring-sky-100"><UploadCloud className="h-4 w-4" />Choose photos</span>
          </div>
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600">{selectedFiles.length ? `${selectedFiles.length} photo(s) ready to upload.` : 'No photos selected.'}</p>
          <button type="button" className={buttonClassName} disabled={!selectedFiles.length || uploading} onClick={() => void uploadImages()}>{uploading ? 'Uploading...' : 'Upload to gallery'}</button>
        </div>
      </Panel>
      <Panel>
        <div className="mb-4 flex items-center justify-between"><p className="font-semibold text-slate-950">Gallery photos</p><p className="text-sm text-zinc-500">{images.length} photo(s)</p></div>
        {loading ? <p className="text-sm text-zinc-500">Loading gallery...</p> : null}
        {!loading && !images.length ? <p className="text-sm text-zinc-500">No gallery photos yet.</p> : null}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {images.map((image) => <article key={image.id} className="group overflow-hidden rounded-2xl border border-sky-100 bg-sky-50 shadow-sm"><img src={image.image_url} alt="Clinic gallery" className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105" /><div className="flex items-center justify-between gap-2 p-3 text-xs text-zinc-600"><span>{formatSize(image.file_size_bytes)}</span><button type="button" className="inline-flex items-center gap-1 text-red-600" onClick={() => void deleteImage(image)}><Trash2 className="h-3.5 w-3.5" />Delete</button></div></article>)}
        </div>
      </Panel>
    </div>
  )
}
