import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, UIEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { ClinicalDocument, MidwifeDashboardStats, PaginatedResponse, Patient, SearchResponse } from '../../types/domain'
import { PrintDocument } from '../clinic/PrintDocument'

type View = 'dashboard' | 'records'
type PatientSearchOption = Pick<Patient, 'id' | 'registration_number' | 'first_name' | 'last_name' | 'age' | 'phone'>
type VisitType = 'anc' | 'pnc'
type PatientStatus = 'new' | 'follow_up'

type MidwifeFormState = {
  visitType: VisitType
  patientStatus: PatientStatus
  gestationalAgeWeeks: string
  estimatedDeliveryDate: string
  nextVisitDate: string
  gravida: string
  parity: string
  bloodPressure: string
  weightKg: string
  fetalHeartRate: string
  highRisk: boolean
  dangerSigns: string
  assessment: string
  notes: string
}

const emptyForm: MidwifeFormState = {
  visitType: 'anc',
  patientStatus: 'new',
  gestationalAgeWeeks: '',
  estimatedDeliveryDate: '',
  nextVisitDate: '',
  gravida: '',
  parity: '',
  bloodPressure: '',
  weightKg: '',
  fetalHeartRate: '',
  highRisk: false,
  dangerSigns: '',
  assessment: '',
  notes: '',
}

const emptyDashboard: MidwifeDashboardStats = {
  period: 'monthly',
  period_label: 'Monthly',
  patients: 0,
  anc_visits: 0,
  pnc_visits: 0,
  high_risk: 0,
  due_followups: 0,
  total_records: 0,
  patient_trend: [],
  recent_records_count: 0,
  recent_records: [],
}

function formatDateTime(value: string): string {
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

function asPayload(document: ClinicalDocument): Record<string, unknown> {
  return document.payload as Record<string, unknown>
}

function visitTypeLabel(document: ClinicalDocument): string {
  return asPayload(document).visit_type === 'pnc' ? 'PNC' : 'ANC'
}

function patientStatusLabel(document: ClinicalDocument): string {
  const value = asPayload(document).patient_status
  return value === 'follow_up' ? 'Follow-up' : 'New'
}

function nextVisitLabel(document: ClinicalDocument): string {
  const value = asPayload(document).next_visit_date
  return typeof value === 'string' && value ? value : 'Not set'
}

function isHighRisk(document: ClinicalDocument): boolean {
  return Boolean(asPayload(document).high_risk)
}

function isDueFollowup(document: ClinicalDocument): boolean {
  const value = asPayload(document).next_visit_date
  if (typeof value !== 'string' || !value) return false
  return value <= new Date().toISOString().slice(0, 10)
}

function payloadString(document: ClinicalDocument, key: string): string {
  const value = asPayload(document)[key]
  return typeof value === 'string' ? value : ''
}

export function MidwifeWorkspace({ view }: { view: View }) {
  const [selectedDocument, setSelectedDocument] = useState<ClinicalDocument | null>(null)

  return (
    <div className="space-y-6">
      {view === 'dashboard' ? <MidwifeDashboard onPrint={setSelectedDocument} /> : null}
      {view === 'records' ? <MidwifeRecords onPrint={setSelectedDocument} /> : null}
      {selectedDocument ? (
        <div className="space-y-3">
          <div className="no-print flex gap-2">
            <button className={buttonClassName} onClick={() => window.print()}>Print maternal record</button>
            <button className={ghostButtonClassName} onClick={() => setSelectedDocument(null)}>Close preview</button>
          </div>
          <PrintDocument document={selectedDocument} />
        </div>
      ) : null}
    </div>
  )
}

function MidwifeDashboard({ onPrint }: { onPrint: (document: ClinicalDocument) => void }) {
  const [period, setPeriod] = useState<MidwifeDashboardStats['period']>('monthly')
  const [recentPage, setRecentPage] = useState(1)
  const [report, setReport] = useState<MidwifeDashboardStats>(emptyDashboard)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false

    async function loadReport() {
      try {
        const nextReport = await apiFetch<MidwifeDashboardStats>(`/midwife/dashboard/?period=${period}&recent_page=${recentPage}`)
        if (!ignore) {
          setReport(nextReport)
          setError('')
        }
      } catch {
        if (!ignore) {
          setError('Unable to load midwife dashboard.')
        }
      }
    }

    void loadReport()
    return () => {
      ignore = true
    }
  }, [period, recentPage])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title="Midwife dashboard" subtitle="Structured maternal care records based on ANC and PNC workflows, with follow-up visibility and risk tracking." />
        <Field label="Period">
          <select className={inputClassName} value={period} onChange={(event) => { setPeriod(event.target.value as MidwifeDashboardStats['period']); setRecentPage(1) }}>
            <option value="daily">Today</option>
            <option value="weekly">This week</option>
            <option value="monthly">This month</option>
            <option value="annual">This year</option>
          </select>
        </Field>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Mothers seen" value={report.patients} hint={`${report.period_label} distinct patients`} />
        <StatCard label="ANC visits" value={report.anc_visits} hint="Antenatal care visits in this period" />
        <StatCard label="PNC visits" value={report.pnc_visits} hint="Postnatal care visits in this period" />
        <StatCard label="High-risk cases" value={report.high_risk} hint="Records flagged for closer review" />
        <StatCard label="Due follow-ups" value={report.due_followups} hint="Follow-up mothers due today or overdue" />
        <StatCard label="Total records" value={report.total_records} hint="All maternal records created in this period" />
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
              Change the period to weekly, monthly, or annual to view the maternal trend graph.
            </div>
          ) : (
            <TrendChart data={report.patient_trend} />
          )}
        </Panel>

        <Panel>
          <SectionHeader title="Recent maternal records" subtitle="Review the latest ANC and PNC records and print them directly from this account." />
          <div className="mt-4 space-y-3">
            {report.recent_records.map((document) => (
              <button key={document.id} className="w-full rounded border border-sky-100 bg-white px-4 py-3 text-left text-sm hover:bg-sky-50" onClick={() => onPrint(document)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{document.patient_name}</p>
                    <p className="mt-1 text-slate-500">{visitTypeLabel(document)} | {patientStatusLabel(document)}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{formatDateTime(document.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isHighRisk(document) ? <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">High risk</span> : null}
                    {isDueFollowup(document) ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">Follow-up due</span> : null}
                  </div>
                </div>
              </button>
            ))}
            {!report.recent_records.length ? <p className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-600">No maternal records created yet.</p> : null}
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

  if (!data.length) {
    return <div className="mt-4 rounded border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">No trend data available.</div>
  }

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

function MidwifeRecords({ onPrint }: { onPrint: (document: ClinicalDocument) => void }) {
  const [documents, setDocuments] = useState<ClinicalDocument[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [filterText, setFilterText] = useState('')
  const [deferredFilterText, setDeferredFilterText] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null)
  const [selectedPatientLabel, setSelectedPatientLabel] = useState('')
  const [form, setForm] = useState<MidwifeFormState>(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const loadDocuments = useCallback(async (currentPage = page, search = deferredFilterText) => {
    const response = await apiFetch<PaginatedResponse<ClinicalDocument>>(`/documents/?document_type=ultrasound&mine=1&midwife_record=1&page=${currentPage}&q=${encodeURIComponent(search)}`)
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
    void loadDocuments(page, deferredFilterText).catch(() => setError('Unable to load midwife records.'))
  }, [deferredFilterText, loadDocuments, page])

  function resetForm() {
    setSelectedPatientId(null)
    setSelectedPatientLabel('')
    setForm(emptyForm)
    setEditingId(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPatientId) {
      setError('Select a patient first.')
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
          document_type: 'ultrasound',
          title: `${form.visitType === 'pnc' ? 'PNC' : 'ANC'} maternal care record`,
          total_amount: '0',
          payload: {
            midwife_record: true,
            visit_type: form.visitType,
            patient_status: form.patientStatus,
            gestational_age_weeks: form.gestationalAgeWeeks,
            estimated_delivery_date: form.estimatedDeliveryDate,
            next_visit_date: form.nextVisitDate,
            gravida: form.gravida,
            parity: form.parity,
            blood_pressure: form.bloodPressure,
            weight_kg: form.weightKg,
            fetal_heart_rate: form.fetalHeartRate,
            high_risk: form.highRisk,
            danger_signs: form.dangerSigns,
            assessment: form.assessment,
            notes: form.notes,
          },
        }),
      })
      resetForm()
      setNotice(editingId ? 'Maternal record updated.' : 'Maternal record saved.')
      onPrint(document)
      await loadDocuments(page, deferredFilterText)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to save maternal record.'))
    } finally {
      setSaving(false)
    }
  }

  function editDocument(document: ClinicalDocument) {
    setEditingId(document.id)
    setSelectedPatientId(document.patient)
    setSelectedPatientLabel(document.patient_name)
    setForm({
      visitType: asPayload(document).visit_type === 'pnc' ? 'pnc' : 'anc',
      patientStatus: asPayload(document).patient_status === 'follow_up' ? 'follow_up' : 'new',
      gestationalAgeWeeks: payloadString(document, 'gestational_age_weeks'),
      estimatedDeliveryDate: payloadString(document, 'estimated_delivery_date'),
      nextVisitDate: payloadString(document, 'next_visit_date'),
      gravida: payloadString(document, 'gravida'),
      parity: payloadString(document, 'parity'),
      bloodPressure: payloadString(document, 'blood_pressure'),
      weightKg: payloadString(document, 'weight_kg'),
      fetalHeartRate: payloadString(document, 'fetal_heart_rate'),
      highRisk: Boolean(asPayload(document).high_risk),
      dangerSigns: payloadString(document, 'danger_signs'),
      assessment: payloadString(document, 'assessment'),
      notes: payloadString(document, 'notes'),
    })
    setError('')
    setNotice('')
  }

  async function deleteDocument(documentId: number) {
    setError('')
    setNotice('')
    try {
      await apiFetch(`/documents/${documentId}/`, { method: 'DELETE' })
      setNotice('Maternal record deleted.')
      if (editingId === documentId) {
        resetForm()
      }
      await loadDocuments(page, deferredFilterText)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to delete maternal record.'))
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[26rem_minmax(0,1fr)]">
      <div className="xl:sticky xl:top-24 xl:self-start">
        <Panel>
          <SectionHeader title="Maternal care record" subtitle="Search a patient registered by reception in the Maternal care department, record ANC or PNC findings, and plan the next follow-up." />
          {error ? <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {notice ? <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <SearchCombo<PatientSearchOption>
              label="Patient"
              placeholder="Search Maternal care patient name or registration number"
              searchPath="/midwife/patients/"
              valueText={selectedPatientLabel}
              renderOption={(patient) => `${patient.registration_number} - ${patient.first_name} ${patient.last_name}${patient.age ? ` (${patient.age})` : ''}${patient.phone ? ` - ${patient.phone}` : ''}`}
              onSelect={(patient) => {
                setSelectedPatientId(patient.id)
                setSelectedPatientLabel(`${patient.registration_number} - ${patient.first_name} ${patient.last_name}`)
              }}
            />

            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div>
                <span className="mb-2 block text-sm font-medium text-zinc-700">Visit type</span>
                <div className="grid grid-cols-2 gap-2 rounded border border-sky-100 bg-white p-2 text-sm">
                  <button type="button" className={`rounded px-3 py-2 font-medium transition ${form.visitType === 'anc' ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-700 hover:bg-sky-50'}`} onClick={() => setForm((current) => ({ ...current, visitType: 'anc' }))}>ANC</button>
                  <button type="button" className={`rounded px-3 py-2 font-medium transition ${form.visitType === 'pnc' ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-700 hover:bg-sky-50'}`} onClick={() => setForm((current) => ({ ...current, visitType: 'pnc' }))}>PNC</button>
                </div>
              </div>

              <div>
                <span className="mb-2 block text-sm font-medium text-zinc-700">Patient status</span>
                <div className="grid grid-cols-2 gap-2 rounded border border-sky-100 bg-white p-2 text-sm">
                  <button type="button" className={`rounded px-3 py-2 font-medium transition ${form.patientStatus === 'new' ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-700 hover:bg-sky-50'}`} onClick={() => setForm((current) => ({ ...current, patientStatus: 'new' }))}>New</button>
                  <button type="button" className={`rounded px-3 py-2 font-medium transition ${form.patientStatus === 'follow_up' ? 'bg-sky-500 text-white' : 'bg-slate-50 text-slate-700 hover:bg-sky-50'}`} onClick={() => setForm((current) => ({ ...current, patientStatus: 'follow_up' }))}>Follow-up</button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Gestational age (weeks)">
                <input className={inputClassName} value={form.gestationalAgeWeeks} onChange={(event) => setForm((current) => ({ ...current, gestationalAgeWeeks: event.target.value }))} placeholder="e.g. 28" />
              </Field>
              <Field label="Estimated delivery date">
                <input className={inputClassName} type="date" value={form.estimatedDeliveryDate} onChange={(event) => setForm((current) => ({ ...current, estimatedDeliveryDate: event.target.value }))} />
              </Field>
              <Field label="Next visit date">
                <input className={inputClassName} type="date" value={form.nextVisitDate} onChange={(event) => setForm((current) => ({ ...current, nextVisitDate: event.target.value }))} />
              </Field>
              <Field label="Blood pressure">
                <input className={inputClassName} value={form.bloodPressure} onChange={(event) => setForm((current) => ({ ...current, bloodPressure: event.target.value }))} placeholder="e.g. 120/80" />
              </Field>
              <Field label="Weight (kg)">
                <input className={inputClassName} value={form.weightKg} onChange={(event) => setForm((current) => ({ ...current, weightKg: event.target.value }))} placeholder="e.g. 67" />
              </Field>
              <Field label="Fetal heart rate">
                <input className={inputClassName} value={form.fetalHeartRate} onChange={(event) => setForm((current) => ({ ...current, fetalHeartRate: event.target.value }))} placeholder="e.g. 145 bpm" />
              </Field>
              <Field label="Gravida">
                <input className={inputClassName} value={form.gravida} onChange={(event) => setForm((current) => ({ ...current, gravida: event.target.value }))} placeholder="e.g. 2" />
              </Field>
              <Field label="Parity">
                <input className={inputClassName} value={form.parity} onChange={(event) => setForm((current) => ({ ...current, parity: event.target.value }))} placeholder="e.g. 1" />
              </Field>
            </div>

            <label className="flex items-center gap-3 rounded border border-sky-100 bg-sky-50 px-3 py-3 text-sm font-medium text-slate-800">
              <input type="checkbox" checked={form.highRisk} onChange={(event) => setForm((current) => ({ ...current, highRisk: event.target.checked }))} />
              Mark this mother as high risk
            </label>

            <Field label="Danger signs">
              <textarea className={inputClassName} rows={3} value={form.dangerSigns} onChange={(event) => setForm((current) => ({ ...current, dangerSigns: event.target.value }))} placeholder="Bleeding, severe headache, fever, edema, poor feeding, postpartum danger signs..." />
            </Field>

            <Field label="Assessment and plan">
              <textarea className={inputClassName} rows={4} value={form.assessment} onChange={(event) => setForm((current) => ({ ...current, assessment: event.target.value }))} placeholder="Clinical assessment, counselling, referral decision, supplements, follow-up plan..." />
            </Field>

            <Field label="Notes">
              <textarea className={inputClassName} rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Additional notes" />
            </Field>

            <div className="flex flex-wrap gap-2 border-t border-sky-100 pt-2">
              <button className={buttonClassName} disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update maternal record' : 'Save maternal record'}</button>
              {editingId ? <button className={ghostButtonClassName} type="button" onClick={resetForm}>Cancel</button> : null}
            </div>
          </form>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sky-100 pb-4">
          <SectionHeader title="Maternal records" subtitle="Review, print, edit, or delete ANC and PNC records created from this account." />
          <label className="w-full max-w-sm">
            <span className="sr-only">Search maternal records</span>
            <input className={inputClassName} value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="Search by patient or record" />
          </label>
        </div>

        <div className="mt-5 xl:max-h-[calc(100vh-16rem)] xl:overflow-y-auto xl:pr-1">
          <div className="grid gap-3 lg:grid-cols-2">
            {documents.map((document) => (
              <div key={document.id} className="rounded border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{document.patient_name}</p>
                    <p className="text-sm text-slate-500">{visitTypeLabel(document)} | {patientStatusLabel(document)}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{formatDateTime(document.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isHighRisk(document) ? <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">High risk</span> : null}
                    {isDueFollowup(document) ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">Follow-up due</span> : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <p><strong>Next visit:</strong> {nextVisitLabel(document)}</p>
                  <p><strong>BP:</strong> {payloadString(document, 'blood_pressure') || 'Not set'}</p>
                  <p><strong>Weight:</strong> {payloadString(document, 'weight_kg') || 'Not set'}</p>
                  <p><strong>FHR:</strong> {payloadString(document, 'fetal_heart_rate') || 'Not set'}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={buttonClassName} onClick={() => onPrint(document)}>Print</button>
                  <button className={ghostButtonClassName} onClick={() => editDocument(document)}>Edit</button>
                  <button className={ghostButtonClassName} onClick={() => void deleteDocument(document.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
          {!documents.length ? <p className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-600">No maternal records found.</p> : null}
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
