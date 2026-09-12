import { useEffect, useState } from 'react'
import { Images, UploadCloud } from 'lucide-react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, Panel, SectionHeader } from '../../components/ui'
import type { WebsitePost } from '../../types/domain'

type PostForm = {
  title_en: string
  title_fa: string
  title_ps: string
  content_en: string
  content_fa: string
  content_ps: string
}

const emptyForm: PostForm = {
  title_en: '', title_fa: '', title_ps: '',
  content_en: '', content_fa: '', content_ps: '',
}

function errorMessage(caught: unknown): string {
  if (caught instanceof ApiError && caught.details && typeof caught.details === 'object') {
    return Object.entries(caught.details as Record<string, unknown>)
      .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
      .join(' ')
  }
  return caught instanceof Error ? caught.message : 'Unable to save the website post.'
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`
}

export function WebsitePostsPage() {
  const [posts, setPosts] = useState<WebsitePost[]>([])
  const [form, setForm] = useState<PostForm>(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function loadPosts() {
    setLoading(true)
    try {
      setPosts(await apiFetch<WebsitePost[]>('/website-posts/'))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPosts()
  }, [])

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setPhotos([])
    setError('')
  }

  function startEditing(post: WebsitePost) {
    setForm({
      title_en: post.title_en, title_fa: post.title_fa, title_ps: post.title_ps,
      content_en: post.content_en, content_fa: post.content_fa, content_ps: post.content_ps,
    })
    setEditingId(post.id)
    setPhotos([])
    setError('')
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function savePost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const body = new FormData()
      Object.entries(form).forEach(([field, value]) => body.append(field, value))
      photos.forEach((photo) => body.append('images', photo))
      await apiFetch<WebsitePost>(editingId === null ? '/website-posts/' : `/website-posts/${editingId}/`, {
        method: editingId === null ? 'POST' : 'PATCH',
        body,
      })
      resetForm()
      setMessage(editingId === null ? 'Website post created.' : 'Website post updated.')
      await loadPosts()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  async function removePost(post: WebsitePost) {
    if (!window.confirm(`Delete “${post.title_en}” and its photos?`)) return
    setError('')
    try {
      await apiFetch<void>(`/website-posts/${post.id}/`, { method: 'DELETE' })
      if (editingId === post.id) resetForm()
      setMessage('Website post deleted.')
      await loadPosts()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  async function removePhoto(postId: number, imageId: number) {
    if (!window.confirm('Delete this photo?')) return
    setError('')
    try {
      await apiFetch<void>(`/website-posts/${postId}/images/${imageId}/`, { method: 'DELETE' })
      await loadPosts()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const editingPost = posts.find((post) => post.id === editingId)

  return (
    <div className="space-y-5">
      <SectionHeader title="Website posts" subtitle="Create posts in English, Dari, and Pashto. All three languages are required." />
      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      <Panel>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><p className="font-semibold text-slate-950">{editingId === null ? 'New post' : 'Edit post'}</p><p className="text-sm text-zinc-500">Photos larger than 1 MB are compressed automatically during upload.</p></div>
          {editingId !== null ? <button type="button" className={ghostButtonClassName} onClick={resetForm}>Cancel edit</button> : null}
        </div>
        <form className="grid gap-4 md:grid-cols-3" onSubmit={savePost}>
          <Field label="English title"><input className={inputClassName} value={form.title_en} onChange={(event) => setForm({ ...form, title_en: event.target.value })} required /></Field>
          <Field label="Dari title"><input className={inputClassName} dir="rtl" value={form.title_fa} onChange={(event) => setForm({ ...form, title_fa: event.target.value })} required /></Field>
          <Field label="Pashto title"><input className={inputClassName} dir="rtl" value={form.title_ps} onChange={(event) => setForm({ ...form, title_ps: event.target.value })} required /></Field>
          <div className="md:col-span-3 grid gap-4 md:grid-cols-3">
            <Field label="English post"><textarea className={`${inputClassName} min-h-36`} value={form.content_en} onChange={(event) => setForm({ ...form, content_en: event.target.value })} required /></Field>
            <Field label="Dari post"><textarea className={`${inputClassName} min-h-36`} dir="rtl" value={form.content_fa} onChange={(event) => setForm({ ...form, content_fa: event.target.value })} required /></Field>
            <Field label="Pashto post"><textarea className={`${inputClassName} min-h-36`} dir="rtl" value={form.content_ps} onChange={(event) => setForm({ ...form, content_ps: event.target.value })} required /></Field>
          </div>
          <div className="md:col-span-3">
            <label className="group block cursor-pointer rounded-2xl border-2 border-dashed border-sky-200 bg-gradient-to-br from-sky-50 via-white to-pink-50 p-5 transition hover:border-pink-300 hover:shadow-md hover:shadow-sky-100">
              <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setPhotos(Array.from(event.target.files ?? []))} />
              <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-pink-500 text-white shadow-lg shadow-sky-200 transition group-hover:scale-105"><Images className="h-6 w-6" /></span>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">Photos <span className="font-normal text-zinc-500">(optional; select one or more)</span></p>
                  <p className="mt-1 text-sm text-zinc-500">Choose JPG, PNG, or WEBP photos. Large photos are automatically compressed below 1 MB.</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-sky-700 shadow-sm ring-1 ring-sky-100"><UploadCloud className="h-4 w-4" />Choose photos</span>
              </div>
            </label>
            {photos.length ? <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{photos.length} photo(s) ready to upload.</p> : null}
          </div>
          {editingPost?.images.length ? <div className="md:col-span-3"><p className="mb-2 text-sm font-medium text-zinc-700">Current photos</p><div className="flex flex-wrap gap-3">{editingPost.images.map((image) => <div key={image.id} className="w-32 rounded border border-sky-100 p-2"><img src={image.image_url} alt="Post" className="h-24 w-full object-cover" /><p className="mt-1 text-xs text-zinc-500">{formatSize(image.file_size_bytes)}</p><button type="button" className="mt-2 text-xs text-red-600" onClick={() => void removePhoto(editingPost.id, image.id)}>Remove photo</button></div>)}</div></div> : null}
          <div className="md:col-span-3"><button className={buttonClassName} disabled={saving}>{saving ? 'Saving...' : editingId === null ? 'Publish post' : 'Save post'}</button></div>
        </form>
      </Panel>

      <Panel>
        <p className="mb-4 font-semibold text-slate-950">Published posts</p>
        {loading ? <p className="text-sm text-zinc-500">Loading posts...</p> : null}
        {!loading && !posts.length ? <p className="text-sm text-zinc-500">No website posts yet.</p> : null}
        <div className="space-y-4">
          {posts.map((post) => (
            <article key={post.id} className="rounded border border-sky-100 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{post.title_en}</p><p className="mt-1 text-sm" dir="rtl">{post.title_fa}</p><p className="mt-1 text-sm" dir="rtl">{post.title_ps}</p><p className="mt-2 text-xs text-zinc-500">Updated {new Date(post.updated_at).toLocaleString()} by {post.updated_by_name || 'MCHC staff'}</p></div><div className="flex gap-2"><button className={ghostButtonClassName} type="button" onClick={() => startEditing(post)}>Edit</button><button className={ghostButtonClassName} type="button" onClick={() => void removePost(post)}>Delete</button></div></div>
              {post.images.length ? <div className="mt-3 flex flex-wrap gap-2">{post.images.map((image) => <img key={image.id} src={image.image_url} alt="Post" className="h-24 w-32 rounded border border-sky-100 object-cover" />)}</div> : null}
            </article>
          ))}
        </div>
      </Panel>
    </div>
  )
}
