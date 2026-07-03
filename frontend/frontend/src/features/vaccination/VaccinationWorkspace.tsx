import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, UIEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { ClinicalDocument, PaginatedResponse, Patient, SearchResponse } from '../../types/domain'
import { PrintDocument } from '../clinic/PrintDocument'

type View = 'dashboard' | 'records'
type PatientSearchOption = Pick<Patient, 'id' | 'registration_number' | 'first_name' | 'last_name' | 'age'>
type VaccinationRow = { vaccine: string; quantity: string }

const common = {
  print: 'Print',
  close: 'Close',
  refresh: 'Refresh',
  saving: 'Saving...',
  cancel: 'Cancel',
  edit: 'Edit',
  delete: 'Delete',
}

const vaccinationDashboardText = {
  title: 'Vaccination dashboard',
  subtitle: 'Vaccination is free of charge. Search reception-registered patients and record vaccines with doses.',
  recentRecords: 'Recent vaccination records',
  noRecords: 'No vaccination records yet.',
}

const vaccinationRecordsText = {
  title: 'Vaccination record',
  subtitle: 'Search the patient registered by reception, record the vaccine types and doses, and mark whether the patient is new or follow-up.',
  recordsTitle: 'Vaccination records',
  recordsSubtitle: 'Review, print, edit, or delete records created from this account.',
  patient: 'Patient',
  patientSearch: 'Search patient name or registration number',
  patientType: 'Patient type',
  newPatient: 'New patient',
  followUp: 'Follow-up',
  vaccine: 'Vaccine',
  dose: 'Dose(s)',
  remove: 'Remove',
  addVaccine: 'Add vaccine',
  saveRecord: 'Save vaccination record',
  updateRecord: 'Update vaccination record',
  searchRecords: 'Search by patient or record',
  noRecords: 'No vaccination records found.',
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function describeApiError(caught: unknown, fallback: string): string {
  if (caught instanceof ApiError) {
    if (typeof caught.details === 'object' && caught.details) {
      const details = Object.values(caught.details as Record<string, unknown>)
        .flatMap((value) => Array.isArray(value) ? value.map(String) : [String(value)])
        .join(' ')
      return details || caught.message
    }
    return caught.message
  }
  return fallback
}

function vaccinationStatusLabel(document: ClinicalDocument): string {
  const value = typeof document.payload.patient_status === 'string' ? document.payload.patient_status : ''
  return value === 'follow_up' ? 'Follow-up' : value === 'new' ? 'New' : 'Not set'
}

function vaccinationItems(document: ClinicalDocument): VaccinationRow[] {
  const items = Array.isArray(document.payload.items) ? document.payload.items as Array<Record<string, unknown>> : []
  return items.map((item) => ({
    vaccine: String(item.vaccine ?? ''),
    quantity: String(item.quantity ?? '1'),
  }))
}

export function VaccinationWorkspace({ view }: { view: View }) {
  const [selectedDocument, setSelectedDocument] = useState<ClinicalDocument | null>(null)
  const [dashboardRecords, setDashboardRecords] = useState<ClinicalDocument[]>([])
  const [dashboardCount, setDashboardCount] = useState(0)
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async () => {
    setError('')
    try {
      const response = await apiFetch<PaginatedResponse<ClinicalDocument>>('/documents/?document_type=vaccination&mine=1&page=1')
      setDashboardRecords(response.results)
      setDashboardCount(response.count)
    } catch {
      setError('Unable to load vaccination data.')
    }
  }, [])

  useEffect(() => {
    if (view === 'dashboard') {
      void loadDashboard()
    }
  }, [loadDashboard, view])

  return (
    <div className="space-y-6">
      {error ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {view === 'dashboard' ? <VaccinationDashboard count={dashboardCount} records={dashboardRecords} onRefresh={() => void loadDashboard()} onPrint={setSelectedDocument} /> : null}
      {view === 'records' ? <VaccinationRecords onPrint={setSelectedDocument} /> : null}
      {selectedDocument ? (
        <div className="space-y-3">
          <div className="no-print flex gap-2">
            <button className={buttonClassName} onClick={() => window.print()}>{common.print}</button>
            <button className={ghostButtonClassName} onClick={() => setSelectedDocument(null)}>{common.close}</button>
          </div>
          <PrintDocument document={selectedDocument} />
        </div>
      ) : null}
    </div>
  )
}

function VaccinationDashboard({
  count,
  records,
  onRefresh,
  onPrint,
}: {
  count: number
  records: ClinicalDocument[]
  onRefresh: () => void
  onPrint: (document: ClinicalDocument) => void
}) {
  const t = vaccinationDashboardText
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title={t.title} subtitle={t.subtitle} />
        <button className={ghostButtonClassName} onClick={onRefresh}>{common.refresh}</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-md border border-sky-100 bg-sky-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Vaccination records</p>
          <p className="mt-3 text-4xl font-semibold text-slate-950">{count}</p>
          <p className="mt-2 text-sm text-slate-600">Total vaccination documents created by this account.</p>
        </div>

        <Panel>
          <p className="text-sm font-semibold text-slate-950">{t.recentRecords}</p>
          <div className="mt-4 space-y-3">
            {records.slice(0, 5).map((document) => (
              <button key={document.id} className="w-full rounded border border-sky-100 bg-white px-4 py-3 text-left text-sm hover:bg-sky-50" onClick={() => onPrint(document)}>
                <p className="font-semibold text-slate-950">{document.patient_name}</p>
                <p className="mt-1 text-slate-500">{vaccinationStatusLabel(document)} patient</p>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{formatDate(document.created_at)}</p>
              </button>
            ))}
            {!records.length ? <p className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-600">{t.noRecords}</p> : null}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function VaccinationRecords({ onPrint }: { onPrint: (document: ClinicalDocument) => void }) {
  const t = vaccinationRecordsText
  const [documents, setDocuments] = useState<ClinicalDocument[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [filterText, setFilterText] = useState('')
  const [deferredFilterText, setDeferredFilterText] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null)
  const [selectedPatientLabel, setSelectedPatientLabel] = useState('')
  const [patientStatus, setPatientStatus] = useState<'new' | 'follow_up'>('new')
  const [rows, setRows] = useState<VaccinationRow[]>([{ vaccine: '', quantity: '1' }])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const loadDocuments = useCallback(async (currentPage = page, search = deferredFilterText) => {
    const response = await apiFetch<PaginatedResponse<ClinicalDocument>>(`/documents/?document_type=vaccination&mine=1&page=${currentPage}&q=${encodeURIComponent(search)}`)
    setDocuments(response.results)
    setTotalCount(response.count)
  }, [deferredFilterText, page])

  useEffect(() => {
    startTransition(() => setDeferredFilterText(filterText))
  }, [filterText])

  useEffect(() => {
    setPage(1)
  }, [deferredFilterText])

  useEffect(() => {
    void loadDocuments(page, deferredFilterText).catch(() => setError('Unable to load vaccination records.'))
  }, [deferredFilterText, loadDocuments, page])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPatientId) {
      setError('Select a patient first.')
      return
    }
    const items = rows
      .filter((row) => row.vaccine.trim())
      .map((row) => ({ vaccine: row.vaccine.trim(), quantity: row.quantity || '1' }))
    if (!items.length) {
      setError('Add at least one vaccination row.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const document = await apiFetch<ClinicalDocument>(editingId ? `/documents/${editingId}/` : '/documents/', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          patient: selectedPatientId,
          document_type: 'vaccination',
          title: 'Vaccination record',
          total_amount: '0',
          payload: {
            patient_status: patientStatus,
            items,
          },
        }),
      })
      setSelectedPatientId(null)
      setSelectedPatientLabel('')
      setPatientStatus('new')
      setRows([{ vaccine: '', quantity: '1' }])
      setEditingId(null)
      setNotice(editingId ? 'Vaccination record updated.' : 'Vaccination record saved.')
      onPrint(document)
      await loadDocuments(page, deferredFilterText)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to save vaccination record.'))
    } finally {
      setSaving(false)
    }
  }

  function editDocument(document: ClinicalDocument) {
    setEditingId(document.id)
    setSelectedPatientId(document.patient)
    setSelectedPatientLabel(document.patient_name)
    const nextStatus = typeof document.payload.patient_status === 'string' && document.payload.patient_status === 'follow_up' ? 'follow_up' : 'new'
    setPatientStatus(nextStatus)
    const itemRows = vaccinationItems(document)
    setRows(itemRows.length ? itemRows : [{ vaccine: '', quantity: '1' }])
    setError('')
    setNotice('')
  }

  async function deleteDocument(documentId: number) {
    setError('')
    setNotice('')
    try {
      await apiFetch(`/documents/${documentId}/`, { method: 'DELETE' })
      setNotice('Vaccination record deleted.')
      await loadDocuments(page, deferredFilterText)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to delete vaccination record.'))
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <div className="xl:sticky xl:top-24 xl:self-start">
        <Panel>
        <SectionHeader title={t.title} subtitle={t.subtitle} />
        {error ? <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {notice ? <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr] xl:grid-cols-1">
            <SearchCombo<PatientSearchOption>
              label={t.patient}
              placeholder={t.patientSearch}
              searchPath="/patients/search/"
              valueText={selectedPatientLabel}
              renderOption={(patient) => `${patient.registration_number} - ${patient.first_name} ${patient.last_name}${patient.age ? ` (${patient.age})` : ''}`}
              onSelect={(patient) => {
                setSelectedPatientId(patient.id)
                setSelectedPatientLabel(`${patient.registration_number} - ${patient.first_name} ${patient.last_name}${patient.age ? ` (${patient.age})` : ''}`)
              }}
            />

            <div>
              <span className="mb-2 block text-sm font-medium text-zinc-700">{t.patientType}</span>
              <div className="grid grid-cols-2 gap-2 rounded border border-sky-100 bg-white p-2 text-sm">
                <button
                  type="button"
                  className={`rounded px-3 py-2 font-medium transition ${patientStatus === 'new' ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-700 hover:bg-sky-50'}`}
                  onClick={() => setPatientStatus('new')}
                >
                  {t.newPatient}
                </button>
                <button
                  type="button"
                  className={`rounded px-3 py-2 font-medium transition ${patientStatus === 'follow_up' ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-700 hover:bg-sky-50'}`}
                  onClick={() => setPatientStatus('follow_up')}
                >
                  {t.followUp}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="grid gap-3 rounded border border-sky-100 bg-slate-50 p-3 md:grid-cols-[1fr_7rem_auto] md:items-end">
                <Field label={rows.length === 1 ? t.vaccine : `${t.vaccine} ${index + 1}`}>
                  <input className={inputClassName} value={row.vaccine} onChange={(event) => {
                    const nextRows = [...rows]
                    nextRows[index] = { ...row, vaccine: event.target.value }
                    setRows(nextRows)
                  }} placeholder={t.vaccine} required />
                </Field>
                <Field label={t.dose}>
                  <input className={inputClassName} min="1" type="number" value={row.quantity} onChange={(event) => {
                    const nextRows = [...rows]
                    nextRows[index] = { ...row, quantity: event.target.value }
                    setRows(nextRows)
                  }} required />
                </Field>
                <div className="flex items-end">
                  <button className={ghostButtonClassName} type="button" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}>{t.remove}</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-sky-100 pt-2">
            <button className={ghostButtonClassName} type="button" onClick={() => setRows([...rows, { vaccine: '', quantity: '1' }])}>{t.addVaccine}</button>
            <button className={buttonClassName} disabled={saving}>{saving ? common.saving : editingId ? t.updateRecord : t.saveRecord}</button>
            {editingId ? <button className={ghostButtonClassName} type="button" onClick={() => { setEditingId(null); setSelectedPatientId(null); setSelectedPatientLabel(''); setPatientStatus('new'); setRows([{ vaccine: '', quantity: '1' }]) }}>{common.cancel}</button> : null}
          </div>
        </form>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sky-100 pb-4">
          <SectionHeader title={t.recordsTitle} subtitle={t.recordsSubtitle} />
          <label className="w-full max-w-sm">
            <span className="sr-only">{t.searchRecords}</span>
            <input className={inputClassName} value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder={t.searchRecords} />
          </label>
        </div>

        <div className="mt-5 xl:max-h-[calc(100vh-16rem)] xl:overflow-y-auto xl:pr-1">
          <div className="grid gap-3 lg:grid-cols-2">
            {documents.map((document) => (
            <div key={document.id} className="rounded border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-950">{document.patient_name}</p>
                  <p className="text-sm text-slate-500">{vaccinationStatusLabel(document)} patient</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{formatDate(document.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Vaccines</p>
                  <p className="text-xl font-semibold text-slate-950">{vaccinationItems(document).length}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {vaccinationItems(document).slice(0, 3).map((item, index) => (
                  <span key={`${item.vaccine}-${index}`} className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
                    {item.vaccine} x {item.quantity}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className={buttonClassName} onClick={() => onPrint(document)}>{common.print}</button>
                <button className={ghostButtonClassName} onClick={() => editDocument(document)}>{common.edit}</button>
                <button className={ghostButtonClassName} onClick={() => void deleteDocument(document.id)}>{common.delete}</button>
              </div>
            </div>
          ))}
          </div>
          {!documents.length ? <p className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-600">{t.noRecords}</p> : null}
        </div>
        <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
      </Panel>
    </div>
  )
}

function SearchCombo<T extends { id: number }>({
  label,
  placeholder,
  searchPath,
  valueText,
  renderOption,
  onSelect,
}: {
  label: string
  placeholder: string
  searchPath: string
  valueText?: string
  renderOption: (item: T) => string
  onSelect: (item: T) => void
}) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<T[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const loadOptions = useCallback(async (offset: number, replace = false, search = query) => {
    setLoading(true)
    try {
      const response = await apiFetch<SearchResponse<T>>(`${searchPath}?q=${encodeURIComponent(search)}&offset=${offset}`)
      setItems((current) => replace ? response.results : [...current, ...response.results])
      setNextOffset(response.next_offset)
    } finally {
      setLoading(false)
    }
  }, [query, searchPath])

  useEffect(() => {
    setQuery(valueText ?? '')
  }, [valueText])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      setNextOffset(0)
      void loadOptions(0, true, query)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [loadOptions, open, query])

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [open])

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget
    if (nextOffset === null || loading) return
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 8) {
      void loadOptions(nextOffset)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Field label={label}>
        <input className={inputClassName} value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setOpen(true)} placeholder={placeholder} />
      </Field>
      {open ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border border-sky-100 bg-white shadow-lg shadow-sky-100" onScroll={handleScroll}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="block w-full border-b border-zinc-100 px-3 py-2 text-left text-sm hover:bg-sky-50"
              onClick={() => {
                onSelect(item)
                setQuery(renderOption(item))
                setOpen(false)
              }}
            >
              {renderOption(item)}
            </button>
          ))}
          {loading ? <div className="px-3 py-2 text-sm text-zinc-500">Loading...</div> : null}
          {!loading && !items.length ? <div className="px-3 py-2 text-sm text-zinc-500">No results</div> : null}
        </div>
      ) : null}
    </div>
  )
}
