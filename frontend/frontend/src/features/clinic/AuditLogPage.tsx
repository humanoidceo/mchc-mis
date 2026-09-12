import { useDeferredValue, useEffect, useState } from 'react'
import { Activity, Pencil, Plus, Trash2 } from 'lucide-react'

import { ApiError, apiFetch } from '../../api/client'
import { Field, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { AuditLog, PaginatedResponse } from '../../types/domain'

const actionStyle = {
  create: { label: 'Created', className: 'bg-emerald-100 text-emerald-700', icon: Plus },
  update: { label: 'Updated', className: 'bg-amber-100 text-amber-700', icon: Pencil },
  delete: { label: 'Deleted', className: 'bg-rose-100 text-rose-700', icon: Trash2 },
} as const

function errorMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : 'Unable to load the audit log.'
}

function humanize(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [error, setError] = useState('')
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    setPage(1)
  }, [deferredSearch, action])

  async function loadLogs(currentPage = page, currentSearch = deferredSearch, currentAction = action) {
    try {
      const params = new URLSearchParams({ page: String(currentPage) })
      if (currentSearch.trim()) params.set('q', currentSearch.trim())
      if (currentAction) params.set('action', currentAction)
      const response = await apiFetch<PaginatedResponse<AuditLog>>(`/audit-logs/?${params.toString()}`)
      setLogs(response.results)
      setTotalCount(response.count)
      setError('')
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  useEffect(() => {
    void loadLogs(page, deferredSearch, action)
  }, [page, deferredSearch, action])

  return (
    <>
      <SectionHeader title="Audit Log" subtitle="Review successful changes made through the system. Request contents are not stored in the audit log." />
      <Panel>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><Activity className="h-6 w-6" /></span><div><p className="font-semibold text-slate-950">System activity</p><p className="text-sm text-zinc-600">Create, update, and delete actions from authenticated users.</p></div></div>
          <button className="rounded border border-sky-200 bg-white px-3 py-2 text-sm font-medium hover:bg-sky-50" type="button" onClick={() => void loadLogs(page, deferredSearch, action)}>Refresh</button>
        </div>
        {error ? <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <div className="grid gap-3 md:grid-cols-[1fr_12rem]">
          <Field label="Search audit log"><input className={inputClassName} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="User, resource, ID, endpoint, or IP" /></Field>
          <Field label="Action"><select className={inputClassName} value={action} onChange={(event) => setAction(event.target.value)}><option value="">All actions</option><option value="create">Created</option><option value="update">Updated</option><option value="delete">Deleted</option></select></Field>
        </div>
        <div className="mt-5 grid gap-3">
          {logs.map((log) => {
            const presentation = actionStyle[log.action]
            const Icon = presentation.icon
            return <div key={log.id} className="rounded-xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-full ${presentation.className}`}><Icon className="h-5 w-5" /></span><div><p className="font-semibold text-slate-950">{presentation.label} {humanize(log.resource)}{log.target_id ? ` #${log.target_id}` : ''}</p><p className="mt-1 text-sm text-slate-600">By {log.actor_name} · {new Date(log.created_at).toLocaleString()}</p></div></div><span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">HTTP {log.status_code}</span></div><div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2"><p><strong>Endpoint:</strong> {log.endpoint}</p><p><strong>IP:</strong> {log.ip_address || 'Not available'}</p></div></div>
          })}
          {!logs.length ? <div className="rounded border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">No audit events recorded yet.</div> : null}
        </div>
        <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
      </Panel>
    </>
  )
}
