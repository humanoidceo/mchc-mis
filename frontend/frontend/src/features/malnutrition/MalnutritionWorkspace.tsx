import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, UIEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { ClinicalDocument, MalnutritionDashboardStats, PaginatedResponse, Patient, SearchResponse } from '../../types/domain'
import { PrintDocument } from '../clinic/PrintDocument'

type View = 'dashboard' | 'assessments'
type PatientSearchOption = Pick<Patient, 'id' | 'registration_number' | 'first_name' | 'last_name' | 'age' | 'phone'>
type AppetiteTest = 'pass' | 'fail'
type BilateralEdema = 'yes' | 'no'

const common = {
  print: 'Print',
  close: 'Close',
  saving: 'Saving...',
  cancel: 'Cancel',
  edit: 'Edit',
  delete: 'Delete',
}

const malnutritionDashboardText = {
  title: 'Malnutrition dashboard',
  subtitle: 'CMAM-style screening and RUTF orders for children registered by reception in the Malnutrition department.',
  recentOrders: 'Recent malnutrition orders',
}

const malnutritionAssessmentsText = {
  title: 'Malnutrition assessment',
  subtitle: 'The four core checks here are MUAC, weight, height or length, and bilateral edema. Appetite test is included before outpatient RUTF.',
  recordsTitle: 'Malnutrition records',
  recordsSubtitle: 'Review, print, edit, or delete RUTF orders and monitor pharmacy approval.',
  patient: 'Patient',
  patientSearch: 'Search Malnutrition patient name or registration number',
  notes: 'Notes',
  saveOrder: 'Save and print RUTF order',
  updateOrder: 'Update malnutrition order',
  searchRecords: 'Search by patient or record',
  noRecords: 'No malnutrition records found.',
}

type AssessmentFormState = {
  muacMm: string
  weightKg: string
  heightCm: string
  bilateralEdema: BilateralEdema
  appetiteTest: AppetiteTest
  rutfQuantity: string
  notes: string
}

const emptyForm: AssessmentFormState = {
  muacMm: '',
  weightKg: '',
  heightCm: '',
  bilateralEdema: 'no',
  appetiteTest: 'pass',
  rutfQuantity: '',
  notes: '',
}

const emptyDashboard: MalnutritionDashboardStats = {
  period: 'monthly',
  period_label: 'Monthly',
  patients: 0,
  severe_cases: 0,
  moderate_cases: 0,
  edema_cases: 0,
  appetite_failures: 0,
  pending_pharmacy: 0,
  approved_pharmacy: 0,
  total_records: 0,
  patient_trend: [],
  recent_records_count: 0,
  recent_records: [],
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function asPayload(document: ClinicalDocument): Record<string, unknown> {
  return document.payload as Record<string, unknown>
}

function payloadString(document: ClinicalDocument, key: string): string {
  const value = asPayload(document)[key]
  return typeof value === 'string' ? value : ''
}

function nutritionStatus(form: Pick<AssessmentFormState, 'muacMm' | 'bilateralEdema' | 'appetiteTest'>): 'severe' | 'moderate' | 'at_risk' {
  const muac = Number(form.muacMm || 0)
  if (form.bilateralEdema === 'yes' || form.appetiteTest === 'fail' || (muac > 0 && muac < 115)) {
    return 'severe'
  }
  if (muac > 0 && muac < 125) {
    return 'moderate'
  }
  return 'at_risk'
}

function nutritionStatusLabel(document: ClinicalDocument): string {
  const value = payloadString(document, 'nutrition_status')
  if (value === 'severe') return 'Severe acute malnutrition'
  if (value === 'moderate') return 'Moderate acute malnutrition'
  return 'At risk'
}

function pharmacyStatusLabel(document: ClinicalDocument): string {
  return payloadString(document, 'pharmacy_status') === 'approved' ? 'Pharmacy approved' : 'Pending pharmacy'
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

export function MalnutritionWorkspace({ view }: { view: View }) {
  const [selectedDocument, setSelectedDocument] = useState<ClinicalDocument | null>(null)

  return (
    <div className="space-y-6">
      {view === 'dashboard' ? <MalnutritionDashboard onPrint={setSelectedDocument} /> : null}
      {view === 'assessments' ? <MalnutritionAssessments onPrint={setSelectedDocument} /> : null}
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

function MalnutritionDashboard({ onPrint }: { onPrint: (document: ClinicalDocument) => void }) {
  const t = malnutritionDashboardText
  const [period, setPeriod] = useState<MalnutritionDashboardStats['period']>('monthly')
  const [recentPage, setRecentPage] = useState(1)
  const [report, setReport] = useState<MalnutritionDashboardStats>(emptyDashboard)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    async function loadReport() {
      try {
        const nextReport = await apiFetch<MalnutritionDashboardStats>(`/malnutrition/dashboard/?period=${period}&recent_page=${recentPage}`)
        if (!ignore) {
          setReport(nextReport)
          setError('')
        }
      } catch {
        if (!ignore) setError('Unable to load malnutrition dashboard.')
      }
    }
    void loadReport()
    return () => { ignore = true }
  }, [period, recentPage])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title={t.title} subtitle={t.subtitle} />
        <Field label="Period">
          <select className={inputClassName} value={period} onChange={(event) => { setPeriod(event.target.value as MalnutritionDashboardStats['period']); setRecentPage(1) }}>
            <option value="daily">Today</option>
            <option value="weekly">This week</option>
            <option value="monthly">This month</option>
            <option value="annual">This year</option>
          </select>
        </Field>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Children seen" value={report.patients} hint={`${report.period_label} distinct patients`} />
        <StatCard label="Severe cases" value={report.severe_cases} hint="MUAC below threshold, edema, or appetite test failed" />
        <StatCard label="Moderate cases" value={report.moderate_cases} hint="MUAC below moderate threshold without severe signs" />
        <StatCard label="Edema cases" value={report.edema_cases} hint="Bilateral pitting edema documented" />
        <StatCard label="Appetite failures" value={report.appetite_failures} hint="Children failing the appetite test" />
        <StatCard label="Pending pharmacy" value={report.pending_pharmacy} hint="RUTF orders still waiting for pharmacy dispensing" />
        <StatCard label="Pharmacy approved" value={report.approved_pharmacy} hint="RUTF orders already dispensed by pharmacy" />
        <StatCard label="Total records" value={report.total_records} hint="All malnutrition records created in this period" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-950">Patient trend</p>
            <p className="text-xs font-medium text-zinc-500">
              {report.period === 'weekly' ? 'Daily trend for this week' : report.period === 'monthly' ? 'Daily trend for this month' : report.period === 'annual' ? 'Monthly trend for this year' : 'Select weekly, monthly, or annual'}
            </p>
          </div>
          {report.period === 'daily' ? (
            <div className="mt-4 rounded border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">
              Change the period to weekly, monthly, or annual to view the assessment trend graph.
            </div>
          ) : (
            <TrendChart data={report.patient_trend} />
          )}
        </Panel>

        <Panel>
          <SectionHeader title={t.recentOrders} subtitle="Review and print recent RUTF orders and monitor pharmacy fulfillment." />
          <div className="mt-4 space-y-3">
            {report.recent_records.map((document) => (
              <button key={document.id} className="w-full rounded border border-sky-100 bg-white px-4 py-3 text-left text-sm hover:bg-sky-50" onClick={() => onPrint(document)}>
                <p className="font-semibold text-slate-950">{document.patient_name}</p>
                <p className="mt-1 text-slate-500">{nutritionStatusLabel(document)} | {pharmacyStatusLabel(document)}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{formatDateTime(document.created_at)}</p>
              </button>
            ))}
            {!report.recent_records.length ? <p className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-600">No malnutrition orders created yet.</p> : null}
          </div>
          <PaginationControls page={recentPage} totalCount={report.recent_records_count} onPageChange={setRecentPage} />
        </Panel>
      </div>
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-md border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{label}</p>
      <p className="mt-3 text-4xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-600">{hint}</p>
    </div>
  )
}

function TrendChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const maxValue = Math.max(1, ...data.map((item) => item.value))
  if (!data.length) return <div className="mt-4 rounded border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">No trend data available.</div>
  return (
    <div className="mt-5">
      <div className="flex h-64 items-end gap-2 rounded-xl border border-sky-100 bg-sky-50/60 p-4">
        {data.map((item) => {
          const height = item.value > 0 ? `${Math.max(6, (item.value / maxValue) * 100)}%` : '0%'
          return (
            <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <span className="text-xs font-semibold text-slate-700">{item.value}</span>
              <div className="flex h-full w-full items-end">
                <div className="w-full rounded-t-lg bg-gradient-to-t from-sky-500 to-pink-400" style={{ height }} title={`${item.label}: ${item.value}`} />
              </div>
              <span className="text-[11px] font-medium text-zinc-500">{item.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MalnutritionAssessments({ onPrint }: { onPrint: (document: ClinicalDocument) => void }) {
  const t = malnutritionAssessmentsText
  const [documents, setDocuments] = useState<ClinicalDocument[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [filterText, setFilterText] = useState('')
  const [deferredFilterText, setDeferredFilterText] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null)
  const [selectedPatientLabel, setSelectedPatientLabel] = useState('')
  const [form, setForm] = useState<AssessmentFormState>(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pharmacyStatus, setPharmacyStatus] = useState('pending')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const loadDocuments = useCallback(async (currentPage = page, search = deferredFilterText) => {
    const response = await apiFetch<PaginatedResponse<ClinicalDocument>>(`/documents/?document_type=rutf&mine=1&malnutrition_record=1&page=${currentPage}&q=${encodeURIComponent(search)}`)
    setDocuments(response.results)
    setTotalCount(response.count)
  }, [deferredFilterText, page])

  useEffect(() => {
    startTransition(() => setDeferredFilterText(filterText))
  }, [filterText])

  useEffect(() => { setPage(1) }, [deferredFilterText])

  useEffect(() => {
    void loadDocuments(page, deferredFilterText).catch(() => setError('Unable to load malnutrition records.'))
  }, [deferredFilterText, loadDocuments, page])

  function resetForm() {
    setSelectedPatientId(null)
    setSelectedPatientLabel('')
    setForm(emptyForm)
    setEditingId(null)
    setPharmacyStatus('pending')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPatientId) {
      setError('Select a patient first.')
      return
    }
    const status = nutritionStatus(form)
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const document = await apiFetch<ClinicalDocument>(editingId ? `/documents/${editingId}/` : '/documents/', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          patient: selectedPatientId,
          document_type: 'rutf',
          title: 'Malnutrition RUTF order',
          total_amount: '0',
          payload: {
            malnutrition_record: true,
            muac_mm: form.muacMm,
            weight_kg: form.weightKg,
            height_cm: form.heightCm,
            bilateral_edema: form.bilateralEdema,
            appetite_test: form.appetiteTest,
            nutrition_status: status,
            rutf_quantity: Number(form.rutfQuantity || 0),
            pharmacy_status: pharmacyStatus || 'pending',
            notes: form.notes,
            items: [
              {
                name: 'RUTF sachets',
                quantity: Number(form.rutfQuantity || 0),
                notes: 'Dispense through pharmacy',
              },
            ],
          },
        }),
      })
      resetForm()
      setNotice(editingId ? 'Malnutrition order updated.' : 'Malnutrition order saved.')
      onPrint(document)
      await loadDocuments(page, deferredFilterText)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to save malnutrition order.'))
    } finally {
      setSaving(false)
    }
  }

  function editDocument(document: ClinicalDocument) {
    setEditingId(document.id)
    setSelectedPatientId(document.patient)
    setSelectedPatientLabel(document.patient_name)
    setForm({
      muacMm: payloadString(document, 'muac_mm'),
      weightKg: payloadString(document, 'weight_kg'),
      heightCm: payloadString(document, 'height_cm'),
      bilateralEdema: (payloadString(document, 'bilateral_edema') || 'no') as BilateralEdema,
      appetiteTest: (payloadString(document, 'appetite_test') || 'pass') as AppetiteTest,
      rutfQuantity: String(asPayload(document).rutf_quantity ?? ''),
      notes: payloadString(document, 'notes'),
    })
    setPharmacyStatus(payloadString(document, 'pharmacy_status') || 'pending')
    setError('')
    setNotice('')
  }

  async function deleteDocument(documentId: number) {
    setError('')
    setNotice('')
    try {
      await apiFetch(`/documents/${documentId}/`, { method: 'DELETE' })
      setNotice('Malnutrition order deleted.')
      if (editingId === documentId) resetForm()
      await loadDocuments(page, deferredFilterText)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to delete malnutrition order.'))
    }
  }

  const statusPreview = nutritionStatus(form)

  return (
    <div className="grid gap-6 xl:grid-cols-[25rem_minmax(0,1fr)]">
      <div className="xl:sticky xl:top-24 xl:self-start">
        <Panel>
          <SectionHeader title={t.title} subtitle={t.subtitle} />
          {error ? <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {notice ? <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <SearchCombo<PatientSearchOption>
              label={t.patient}
              placeholder={t.patientSearch}
              searchPath="/malnutrition/patients/"
              valueText={selectedPatientLabel}
              renderOption={(patient) => `${patient.registration_number} - ${patient.first_name} ${patient.last_name}${patient.age ? ` (${patient.age})` : ''}${patient.phone ? ` - ${patient.phone}` : ''}`}
              onSelect={(patient) => {
                setSelectedPatientId(patient.id)
                setSelectedPatientLabel(`${patient.registration_number} - ${patient.first_name} ${patient.last_name}`)
              }}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="MUAC (mm)">
                <input className={inputClassName} value={form.muacMm} onChange={(event) => setForm((current) => ({ ...current, muacMm: event.target.value }))} placeholder="e.g. 112" required />
              </Field>
              <Field label="Weight (kg)">
                <input className={inputClassName} value={form.weightKg} onChange={(event) => setForm((current) => ({ ...current, weightKg: event.target.value }))} placeholder="e.g. 8.4" required />
              </Field>
              <Field label="Height or length (cm)">
                <input className={inputClassName} value={form.heightCm} onChange={(event) => setForm((current) => ({ ...current, heightCm: event.target.value }))} placeholder="e.g. 74" required />
              </Field>
              <Field label="RUTF quantity">
                <input className={inputClassName} value={form.rutfQuantity} onChange={(event) => setForm((current) => ({ ...current, rutfQuantity: event.target.value }))} placeholder="Number of sachets" min="1" type="number" required />
              </Field>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <span className="mb-2 block text-sm font-medium text-zinc-700">Bilateral pitting edema</span>
                <div className="grid grid-cols-2 gap-2 rounded border border-sky-100 bg-white p-2 text-sm">
                  <button type="button" className={`rounded px-3 py-2 font-medium transition ${form.bilateralEdema === 'no' ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-700 hover:bg-sky-50'}`} onClick={() => setForm((current) => ({ ...current, bilateralEdema: 'no' }))}>No</button>
                  <button type="button" className={`rounded px-3 py-2 font-medium transition ${form.bilateralEdema === 'yes' ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-700 hover:bg-sky-50'}`} onClick={() => setForm((current) => ({ ...current, bilateralEdema: 'yes' }))}>Yes</button>
                </div>
              </div>
              <div>
                <span className="mb-2 block text-sm font-medium text-zinc-700">Appetite test</span>
                <div className="grid grid-cols-2 gap-2 rounded border border-sky-100 bg-white p-2 text-sm">
                  <button type="button" className={`rounded px-3 py-2 font-medium transition ${form.appetiteTest === 'pass' ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-700 hover:bg-sky-50'}`} onClick={() => setForm((current) => ({ ...current, appetiteTest: 'pass' }))}>Pass</button>
                  <button type="button" className={`rounded px-3 py-2 font-medium transition ${form.appetiteTest === 'fail' ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-700 hover:bg-sky-50'}`} onClick={() => setForm((current) => ({ ...current, appetiteTest: 'fail' }))}>Fail</button>
                </div>
              </div>
            </div>

            <div className={`rounded border px-4 py-3 text-sm ${statusPreview === 'severe' ? 'border-rose-200 bg-rose-50 text-rose-800' : statusPreview === 'moderate' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-sky-100 bg-sky-50 text-sky-800'}`}>
              Assessment status: {statusPreview === 'severe' ? 'Severe acute malnutrition' : statusPreview === 'moderate' ? 'Moderate acute malnutrition' : 'At risk'}
            </div>

            <Field label={t.notes}>
              <textarea className={inputClassName} rows={4} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Clinical notes, counselling, follow-up advice, danger signs..." />
            </Field>

            <div className="flex flex-wrap gap-2 border-t border-sky-100 pt-2">
              <button className={buttonClassName} disabled={saving}>{saving ? common.saving : editingId ? t.updateOrder : t.saveOrder}</button>
              {editingId ? <button className={ghostButtonClassName} type="button" onClick={resetForm}>{common.cancel}</button> : null}
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
                    <p className="text-sm text-slate-500">{nutritionStatusLabel(document)}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{formatDateTime(document.created_at)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${pharmacyStatusLabel(document) === 'Pharmacy approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {pharmacyStatusLabel(document)}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <p><strong>MUAC:</strong> {payloadString(document, 'muac_mm')} mm</p>
                  <p><strong>Weight:</strong> {payloadString(document, 'weight_kg')} kg</p>
                  <p><strong>Height:</strong> {payloadString(document, 'height_cm')} cm</p>
                  <p><strong>RUTF:</strong> {String(asPayload(document).rutf_quantity ?? 0)}</p>
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
