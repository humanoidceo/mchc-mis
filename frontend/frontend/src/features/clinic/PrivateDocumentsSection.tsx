import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { PaginatedResponse, PrivateDocument } from '../../types/domain'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

type CategoryOption = {
  id: number
  name: string
}

function describeApiError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.details && typeof error.details === 'object') {
      return Object.values(error.details as Record<string, unknown>)
        .flatMap((value) => Array.isArray(value) ? value.map(String) : [String(value)])
        .join(' ') || error.message
    }
    return error.message
  }
  return fallback
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export function PrivateDocumentsSection() {
  const [documents, setDocuments] = useState<PrivateDocument[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '',
    category: '',
    max_size_mb: '1.00',
    file: null as File | null,
  })

  useEffect(() => {
    setPage(1)
  }, [deferredSearch, categoryFilter])

  async function loadCategories() {
    const response = await apiFetch<{ results: CategoryOption[] }>('/private-documents/categories/')
    setCategories(response.results)
  }

  async function loadDocuments(currentPage = page, currentSearch = deferredSearch, currentCategory = categoryFilter) {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(currentPage) })
      if (currentSearch.trim()) params.set('q', currentSearch.trim())
      if (currentCategory.trim()) params.set('category', currentCategory.trim())
      const response = await apiFetch<PaginatedResponse<PrivateDocument>>(`/private-documents/?${params.toString()}`)
      setDocuments(response.results)
      setTotalCount(response.count)
      setError('')
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to load private documents.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.all([loadDocuments(page, deferredSearch, categoryFilter), loadCategories()])
  }, [page, deferredSearch, categoryFilter])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.file) {
      setError('Choose a file to upload.')
      return
    }

    const payload = new FormData()
    payload.append('title', form.title.trim())
    payload.append('category', form.category.trim())
    payload.append('max_size_mb', form.max_size_mb || '1.00')
    payload.append('file', form.file)

    setSaving(true)
    setError('')
    setNotice('')
    try {
      await apiFetch<PrivateDocument>('/private-documents/', {
        method: 'POST',
        body: payload,
      })
      setForm({
        title: '',
        category: '',
        max_size_mb: '1.00',
        file: null,
      })
      setNotice('Private document uploaded.')
      await Promise.all([loadDocuments(1, deferredSearch, categoryFilter), loadCategories()])
      setPage(1)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to upload private document.'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteDocument(document: PrivateDocument) {
    const confirmed = window.confirm(`Delete "${document.title}"?`)
    if (!confirmed) return
    setError('')
    setNotice('')
    try {
      await apiFetch(`/private-documents/${document.id}/`, { method: 'DELETE' })
      setNotice('Private document deleted.')
      await Promise.all([loadDocuments(page, deferredSearch, categoryFilter), loadCategories()])
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to delete private document.'))
    }
  }

  const downloadBaseUrl = useMemo(() => `${API_BASE_URL}/private-documents`, [])

  return (
    <div className="space-y-5">
      <SectionHeader title="Private documents" subtitle="Upload internal DOCX, PDF, PNG, JPG, and JPEG files for reception and super admin use only." />

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}

      <Panel>
        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Title">
            <input
              className={inputClassName}
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Document title"
              required
            />
          </Field>
          <Field label="Category">
            <input
              className={inputClassName}
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              placeholder="HR, Finance, Contracts"
              required
            />
          </Field>
          <Field label="Maximum file size (MB)">
            <input
              className={inputClassName}
              type="number"
              min="0.01"
              step="0.01"
              value={form.max_size_mb}
              onChange={(event) => setForm((current) => ({ ...current, max_size_mb: event.target.value }))}
              required
            />
          </Field>
          <Field label="File">
            <input
              className={inputClassName}
              type="file"
              accept=".docx,.pdf,.png,.jpg,.jpeg"
              onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))}
              required
            />
          </Field>
          <div className="md:col-span-2 xl:col-span-4 flex flex-wrap items-center gap-2">
            <button className={buttonClassName} disabled={saving}>{saving ? 'Uploading...' : 'Upload private document'}</button>
            <p className="text-sm text-zinc-500">Default maximum file size is 1 MB. You can increase or reduce it before upload.</p>
          </div>
        </form>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-slate-950">Document archive</p>
            <p className="text-sm text-zinc-500">Search by title, category, or file name. Filter by category. 10 items per page.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className={inputClassName}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search documents"
            />
            <select
              className={inputClassName}
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((category) => <option key={category.name} value={category.name}>{category.name}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="py-2 font-semibold">Title</th>
                <th className="py-2 font-semibold">Category</th>
                <th className="py-2 font-semibold">Type</th>
                <th className="py-2 font-semibold">Size</th>
                <th className="py-2 font-semibold">Limit</th>
                <th className="py-2 font-semibold">Uploaded by</th>
                <th className="py-2 font-semibold">Created</th>
                <th className="py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id} className="border-b border-zinc-100">
                  <td className="py-2">
                    <div>
                      <p className="font-medium text-slate-900">{document.title}</p>
                      <p className="text-xs text-zinc-500">{document.file_name}</p>
                    </div>
                  </td>
                  <td className="py-2">{document.category}</td>
                  <td className="py-2 uppercase">{document.file_extension || '-'}</td>
                  <td className="py-2">{formatFileSize(document.file_size_bytes)}</td>
                  <td className="py-2">{document.max_size_mb} MB</td>
                  <td className="py-2">{document.uploaded_by_name || '-'}</td>
                  <td className="py-2">{formatDate(document.created_at)}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <a
                        className={ghostButtonClassName}
                        href={`${downloadBaseUrl}/${document.id}/download/`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download
                      </a>
                      <button className={ghostButtonClassName} type="button" onClick={() => void deleteDocument(document)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!documents.length && !loading ? (
                <tr>
                  <td className="py-6 text-center text-zinc-500" colSpan={8}>No private documents found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <PaginationControls page={page} totalCount={totalCount} pageSize={10} onPageChange={setPage} />
        </div>
      </Panel>
    </div>
  )
}
