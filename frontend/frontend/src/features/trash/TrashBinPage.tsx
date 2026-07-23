import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, ghostButtonClassName, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { PaginatedResponse, TrashItem } from '../../types/domain'

const modelOptions = [
  { value: '', label: 'All types' },
  { value: 'patient', label: 'Patients' },
  { value: 'payment', label: 'Payments' },
  { value: 'clinical_document', label: 'Clinical documents' },
  { value: 'private_document', label: 'Private documents' },
  { value: 'expense', label: 'Expenses' },
  { value: 'salary_advance', label: 'Salary advances' },
  { value: 'salary_payment', label: 'Salary payments' },
  { value: 'clinic_medicine', label: 'Clinic medicines' },
  { value: 'pharmacy_medicine', label: 'Pharmacy medicines' },
  { value: 'pharmacy_sale', label: 'Pharmacy sales' },
  { value: 'employee', label: 'Employees' },
  { value: 'user', label: 'Users' },
]

type TrashSettingsResponse = {
  trash_retention_days: number
}

type ContextMenuState = {
  x: number
  y: number
  item: TrashItem
} | null

function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.details && typeof error.details === 'object') {
      const messages = Object.values(error.details as Record<string, unknown>).flatMap((value) => Array.isArray(value) ? value.map(String) : [String(value)])
      return messages.join(' ') || error.message
    }
    return error.message
  }
  return fallback
}

function formatDeletedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function TrashBinPage() {
  const [items, setItems] = useState<TrashItem[]>([])
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [modelFilter, setModelFilter] = useState('')
  const [retentionDays, setRetentionDays] = useState('30')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  useEffect(() => {
    setPage(1)
  }, [deferredSearch, modelFilter])

  useEffect(() => {
    const closeMenu = () => setContextMenu(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  async function loadSettings() {
    const response = await apiFetch<TrashSettingsResponse>('/auth/trash/settings/')
    setRetentionDays(String(response.trash_retention_days))
  }

  async function loadItems(currentPage = page, currentSearch = deferredSearch, currentModel = modelFilter) {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(currentPage) })
      if (currentSearch.trim()) params.set('q', currentSearch.trim())
      if (currentModel.trim()) params.set('model', currentModel.trim())
      const response = await apiFetch<PaginatedResponse<TrashItem>>(`/auth/trash/items/?${params.toString()}`)
      setItems(response.results)
      setTotalCount(response.count)
      setSelectedKeys((current) => current.filter((key) => response.results.some((item) => `${item.model}:${item.id}` === key)))
      setError('')
    } catch (caught) {
      setError(describeError(caught, 'Unable to load trash items.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.all([loadSettings(), loadItems(page, deferredSearch, modelFilter)])
  }, [page, deferredSearch, modelFilter])

  async function saveRetention() {
    setSavingSettings(true)
    setError('')
    setNotice('')
    try {
      const response = await apiFetch<TrashSettingsResponse>('/auth/trash/settings/', {
        method: 'PATCH',
        body: JSON.stringify({ trash_retention_days: retentionDays }),
      })
      setRetentionDays(String(response.trash_retention_days))
      setNotice('Trash retention period updated.')
    } catch (caught) {
      setError(describeError(caught, 'Unable to save trash retention period.'))
    } finally {
      setSavingSettings(false)
    }
  }

  const selectedEntries = useMemo(
    () => selectedKeys.map((key) => {
      const [model, id] = key.split(':')
      return { model, id: Number(id) }
    }),
    [selectedKeys],
  )

  async function runBulkAction(path: string, successMessage: string, requireConfirm = false, entries = selectedEntries) {
    if (!entries.length) {
      setError('Select at least one trash item.')
      return
    }
    if (requireConfirm && !window.confirm('Permanently delete the selected trash items? This cannot be undone.')) {
      return
    }
    setWorking(true)
    setError('')
    setNotice('')
    try {
      await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({ entries }),
      })
      setSelectedKeys([])
      setNotice(successMessage)
      await Promise.all([loadSettings(), loadItems(page, deferredSearch, modelFilter)])
    } catch (caught) {
      setError(describeError(caught, 'Trash action failed.'))
    } finally {
      setWorking(false)
      setContextMenu(null)
    }
  }

  function toggleSelection(item: TrashItem) {
    const key = `${item.model}:${item.id}`
    setSelectedKeys((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])
  }

  function toggleCurrentPageSelection() {
    const pageKeys = items.map((item) => `${item.model}:${item.id}`)
    const allSelected = pageKeys.length > 0 && pageKeys.every((key) => selectedKeys.includes(key))
    setSelectedKeys((current) => {
      if (allSelected) {
        return current.filter((key) => !pageKeys.includes(key))
      }
      return [...new Set([...current, ...pageKeys])]
    })
  }

  async function restoreSingle(item: TrashItem) {
    const entry = [{ model: item.model, id: item.id }]
    setSelectedKeys([`${item.model}:${item.id}`])
    await runBulkAction('/auth/trash/restore/', 'Trash item restored.', false, entry)
  }

  async function deleteSingle(item: TrashItem) {
    const entry = [{ model: item.model, id: item.id }]
    setSelectedKeys([`${item.model}:${item.id}`])
    await runBulkAction('/auth/trash/delete/', 'Trash item permanently deleted.', true, entry)
  }

  const pageAllSelected = items.length > 0 && items.every((item) => selectedKeys.includes(`${item.model}:${item.id}`))

  return (
    <div className="space-y-5">
      <SectionHeader title="Trash" subtitle="Only the deleted records removed by your account are shown here. Restored records return to their original section." />

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}

      <Panel>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-pink-50 px-4 py-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Trash retention</p>
            <p className="mt-1 text-sm text-zinc-600">Deleted records stay here for the number of days you choose, then the system removes them automatically.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-44">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Days to keep deleted data</span>
              <input
                className={inputClassName}
                type="number"
                min="1"
                max="3650"
                value={retentionDays}
                onChange={(event) => setRetentionDays(event.target.value)}
              />
            </label>
            <button className={buttonClassName} type="button" disabled={savingSettings} onClick={() => void saveRetention()}>
              {savingSettings ? 'Saving...' : 'Save period'}
            </button>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-slate-950">Deleted data</p>
            <p className="text-sm text-zinc-500">Right-click any row for quick restore or permanent delete.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className={inputClassName}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search deleted data"
            />
            <select className={inputClassName} value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
              {modelOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={pageAllSelected} onChange={toggleCurrentPageSelection} />
            Select current page
          </label>
          <div className="flex flex-wrap gap-2">
            <button className={ghostButtonClassName} type="button" disabled={working || !selectedEntries.length} onClick={() => void runBulkAction('/auth/trash/restore/', 'Selected trash items restored.')}>
              Restore selected
            </button>
            <button className={ghostButtonClassName} type="button" disabled={working || !selectedEntries.length} onClick={() => void runBulkAction('/auth/trash/delete/', 'Selected trash items permanently deleted.', true)}>
              Delete selected
            </button>
          </div>
        </div>

        <div className="relative mt-4 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="py-2 pr-3 font-semibold">Select</th>
                <th className="py-2 pr-3 font-semibold">Type</th>
                <th className="py-2 pr-3 font-semibold">Deleted record</th>
                <th className="py-2 pr-3 font-semibold">Deleted at</th>
                <th className="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const key = `${item.model}:${item.id}`
                return (
                  <tr
                    key={key}
                    className="border-b border-zinc-100 transition hover:bg-pink-50/40"
                    onContextMenu={(event: ReactMouseEvent<HTMLTableRowElement>) => {
                      event.preventDefault()
                      setContextMenu({ x: event.clientX, y: event.clientY, item })
                    }}
                  >
                    <td className="py-3 pr-3">
                      <input type="checkbox" checked={selectedKeys.includes(key)} onChange={() => toggleSelection(item)} />
                    </td>
                    <td className="py-3 pr-3">
                      <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">{item.model_label}</span>
                    </td>
                    <td className="py-3 pr-3 font-medium text-slate-900">{item.title}</td>
                    <td className="py-3 pr-3 text-zinc-600">{formatDeletedAt(item.deleted_at)}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button className={ghostButtonClassName} type="button" disabled={working} onClick={() => void restoreSingle(item)}>Restore</button>
                        <button className={ghostButtonClassName} type="button" disabled={working} onClick={() => void deleteSingle(item)}>Delete forever</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!items.length && !loading ? (
                <tr>
                  <td className="py-8 text-center text-zinc-500" colSpan={5}>No deleted data found for your account.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {contextMenu ? (
            <div
              className="fixed z-50 min-w-44 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-sky-50" type="button" onClick={() => void restoreSingle(contextMenu.item)}>Restore</button>
              <button className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-rose-50" type="button" onClick={() => void deleteSingle(contextMenu.item)}>Delete forever</button>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <PaginationControls page={page} totalCount={totalCount} pageSize={10} onPageChange={setPage} />
        </div>
      </Panel>
    </div>
  )
}
