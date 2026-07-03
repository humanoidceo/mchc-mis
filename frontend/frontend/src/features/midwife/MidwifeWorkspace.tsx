import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, UIEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { ClinicalDocument, LabTest, Medicine, MidwifeDashboardStats, PaginatedResponse, Patient, SearchResponse } from '../../types/domain'
import { FamilyPlanningOrderSection } from '../familyPlanning/FamilyPlanningOrderSection'
import { PrintDocument } from '../clinic/PrintDocument'

type View = 'dashboard' | 'records' | 'deliveries' | 'documents' | 'family-planning'
type PatientSearchOption = Pick<Patient, 'id' | 'registration_number' | 'first_name' | 'last_name' | 'age' | 'phone'>
type MedicineSearchOption = Pick<Medicine, 'id' | 'name' | 'unit' | 'current_stock'>
type LabTestSearchOption = Pick<LabTest, 'id' | 'name' | 'display_name' | 'category' | 'is_panel' | 'component_count'>
type PrescriptionItem = { medicine: number; medicine_name: string; quantity: string; instructions: string }
type LabOrderItem = { test: number; test_name: string }
type VisitType = 'anc' | 'pnc'
type PatientStatus = 'new' | 'follow_up'
type DeliveryMode = 'normal_vaginal' | 'assisted_vaginal' | 'c_section' | 'referred'
type BabyStatus = 'live_birth' | 'stillbirth' | 'early_neonatal_death'
type MotherStatus = 'stable' | 'referred' | 'critical'

const common = {
  print: 'Print',
  close: 'Close',
  saving: 'Saving...',
  create: 'Create',
  reset: 'Reset',
  update: 'Update',
  save: 'Save',
  cancel: 'Cancel',
  edit: 'Edit',
  delete: 'Delete',
}

const midwifeDashboardText = {
  title: 'Midwife dashboard',
  subtitle: 'Structured maternal care records based on ANC and PNC workflows, with follow-up visibility and risk tracking.',
  recentRecords: 'Recent maternal records',
}

const midwifeDocumentsText = {
  title: 'Clinical documents',
  subtitle: 'Create prescriptions or laboratory test orders for Maternal care patients and print the same half-A4 documents used by doctor-like accounts.',
}

const midwifeRecordsText = {
  title: 'Maternal care record',
  subtitle: 'Search a patient registered by reception in the Maternal care department, record ANC or PNC findings, and plan the next follow-up.',
  recordsTitle: 'Maternal records',
}

const midwifeDeliveriesText = {
  title: 'Delivery record',
  subtitle: 'Capture intrapartum monitoring, birth outcome, mother and newborn status, and referral details.',
  recordsTitle: 'Delivery records',
}

const midwifeFamilyPlanningText = {
  title: 'Family planning',
  subtitle: 'Search a registered patient, select family planning items from pharmacy stock, and send the patient to pharmacy without billing.',
}

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

type DeliveryFormState = {
  deliveryDateTime: string
  gestationalAgeWeeks: string
  gravida: string
  parity: string
  laborOnset: string
  deliveryMode: DeliveryMode
  cervicalDilationCm: string
  fetalHeartRate: string
  contractionPattern: string
  membraneStatus: string
  liquorStatus: string
  maternalBloodPressure: string
  maternalPulse: string
  maternalTemperature: string
  babyStatus: BabyStatus
  babySex: string
  birthWeightKg: string
  apgar1: string
  apgar5: string
  motherStatus: MotherStatus
  complications: string
  interventions: string
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

const emptyDeliveryForm: DeliveryFormState = {
  deliveryDateTime: '',
  gestationalAgeWeeks: '',
  gravida: '',
  parity: '',
  laborOnset: '',
  deliveryMode: 'normal_vaginal',
  cervicalDilationCm: '',
  fetalHeartRate: '',
  contractionPattern: '',
  membraneStatus: '',
  liquorStatus: '',
  maternalBloodPressure: '',
  maternalPulse: '',
  maternalTemperature: '',
  babyStatus: 'live_birth',
  babySex: '',
  birthWeightKg: '',
  apgar1: '',
  apgar5: '',
  motherStatus: 'stable',
  complications: '',
  interventions: '',
  notes: '',
}

const emptyDashboard: MidwifeDashboardStats = {
  period: 'monthly',
  period_label: 'Monthly',
  patients: 0,
  anc_visits: 0,
  pnc_visits: 0,
  deliveries: 0,
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

function labTestOptionLabel(test: LabTestSearchOption): string {
  const label = test.display_name || test.name
  if (test.is_panel) {
    return `${label} (${test.component_count} analytes)`
  }
  return test.category ? `${label} - ${test.category}` : label
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

function deliveryModeLabel(document: ClinicalDocument): string {
  const value = payloadString(document, 'delivery_mode')
  if (value === 'assisted_vaginal') return 'Assisted vaginal'
  if (value === 'c_section') return 'C-section'
  if (value === 'referred') return 'Referred'
  return 'Normal vaginal'
}

function babyStatusLabel(document: ClinicalDocument): string {
  const value = payloadString(document, 'baby_status')
  if (value === 'stillbirth') return 'Stillbirth'
  if (value === 'early_neonatal_death') return 'Early neonatal death'
  return 'Live birth'
}

function motherStatusLabel(document: ClinicalDocument): string {
  const value = payloadString(document, 'mother_status')
  if (value === 'referred') return 'Referred'
  if (value === 'critical') return 'Critical'
  return 'Stable'
}

export function MidwifeWorkspace({ view }: { view: View }) {
  const [selectedDocument, setSelectedDocument] = useState<ClinicalDocument | null>(null)

  return (
    <div className="space-y-6">
      {view === 'dashboard' ? <MidwifeDashboard onPrint={setSelectedDocument} /> : null}
      {view === 'records' ? <MidwifeRecords onPrint={setSelectedDocument} /> : null}
      {view === 'deliveries' ? <MidwifeDeliveries onPrint={setSelectedDocument} /> : null}
      {view === 'documents' ? <MidwifeClinicalDocuments onPrint={setSelectedDocument} /> : null}
      {view === 'family-planning' ? (
        <FamilyPlanningOrderSection
          title={midwifeFamilyPlanningText.title}
          subtitle={midwifeFamilyPlanningText.subtitle}
          listTitle={midwifeFamilyPlanningText.title}
          listSubtitle={midwifeFamilyPlanningText.subtitle}
          patientSearchPath="/patients/search/"
          patientSearchPlaceholder="Search patient name or registration number"
        />
      ) : null}
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

function MidwifeDashboard({ onPrint }: { onPrint: (document: ClinicalDocument) => void }) {
  const t = midwifeDashboardText
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
        <SectionHeader title={t.title} subtitle={t.subtitle} />
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
        <StatCard label="Deliveries" value={report.deliveries} hint="Delivery records captured in this period" />
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
          <SectionHeader title={t.recentRecords} subtitle="Review the latest ANC and PNC records and print them directly from this account." />
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

function MidwifeClinicalDocuments({ onPrint }: { onPrint: (document: ClinicalDocument) => void }) {
  const t = midwifeDocumentsText
  const [documents, setDocuments] = useState<ClinicalDocument[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'prescription' | 'lab_order'>('all')
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchOption | null>(null)
  const [selectedMedicine, setSelectedMedicine] = useState<MedicineSearchOption | null>(null)
  const [selectedMedicineLabel, setSelectedMedicineLabel] = useState('')
  const [medicineForm, setMedicineForm] = useState({ quantity: '', instructions: '' })
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([])
  const [labOrderItems, setLabOrderItems] = useState<LabOrderItem[]>([])
  const [documentType, setDocumentType] = useState<'prescription' | 'lab_order'>('prescription')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadDocuments = useCallback(async (currentPage = page, currentSearch = search, currentType = typeFilter) => {
    const params = new URLSearchParams({
      page: String(currentPage),
      mine: '1',
      doctor_documents: '1',
    })
    if (currentType !== 'all') params.set('document_type', currentType)
    if (currentSearch.trim()) params.set('q', currentSearch.trim())

    const response = await apiFetch<PaginatedResponse<ClinicalDocument>>(`/documents/?${params.toString()}`)
    setDocuments(response.results)
    setTotalCount(response.count)
  }, [page, search, typeFilter])

  useEffect(() => {
    setPage(1)
  }, [search, typeFilter])

  useEffect(() => {
    void loadDocuments(page, search, typeFilter).catch(() => setError('Unable to load midwife clinical documents.'))
  }, [loadDocuments, page, search, typeFilter])

  function resetForm() {
    setSelectedPatient(null)
    setSelectedMedicine(null)
    setSelectedMedicineLabel('')
    setMedicineForm({ quantity: '', instructions: '' })
    setPrescriptionItems([])
    setLabOrderItems([])
    setDocumentType('prescription')
    setError('')
  }

  function addMedicine() {
    if (!selectedMedicine || !medicineForm.quantity || !medicineForm.instructions) {
      setError('Select a medicine, quantity, and usage instruction.')
      return
    }
    setPrescriptionItems((current) => [
      ...current,
      {
        medicine: selectedMedicine.id,
        medicine_name: selectedMedicine.name,
        quantity: medicineForm.quantity,
        instructions: medicineForm.instructions,
      },
    ])
    setSelectedMedicine(null)
    setSelectedMedicineLabel('')
    setMedicineForm({ quantity: '', instructions: '' })
    setError('')
  }

  function addLabTest(test: LabTestSearchOption) {
    setLabOrderItems((current) => current.some((item) => item.test === test.id) ? current : [...current, { test: test.id, test_name: test.display_name || test.name }])
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!selectedPatient) {
      setError('Select a patient first.')
      return
    }
    if (documentType === 'prescription' && !prescriptionItems.length) {
      setError('Add at least one medicine.')
      return
    }
    if (documentType === 'lab_order' && !labOrderItems.length) {
      setError('Add at least one lab test.')
      return
    }

    setSubmitting(true)
    try {
      const document = await apiFetch<ClinicalDocument>('/documents/', {
        method: 'POST',
        body: JSON.stringify({
          patient: selectedPatient.id,
          document_type: documentType,
          title: documentType === 'prescription' ? 'Prescription' : 'Laboratory order',
          total_amount: '0',
          payload: documentType === 'prescription' ? { items: prescriptionItems } : { items: labOrderItems },
        }),
      })
      resetForm()
      onPrint(document)
      await loadDocuments(page, search, typeFilter)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to save clinical document.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <SectionHeader title={t.title} subtitle={t.subtitle} />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <SearchCombo<PatientSearchOption>
                label="Patient"
                placeholder="Search Maternal care patient name or registration number"
                searchPath="/midwife/patients/"
                valueText={selectedPatient ? `${selectedPatient.registration_number} - ${selectedPatient.first_name} ${selectedPatient.last_name}` : ''}
                renderOption={(patient) => `${patient.registration_number} - ${patient.first_name} ${patient.last_name}${patient.age ? ` (${patient.age})` : ''}${patient.phone ? ` - ${patient.phone}` : ''}`}
                onSelect={setSelectedPatient}
              />
              <Field label="Document type">
                <select className={inputClassName} value={documentType} onChange={(event) => setDocumentType(event.target.value as 'prescription' | 'lab_order')}>
                  <option value="prescription">Prescription</option>
                  <option value="lab_order">Laboratory test order</option>
                </select>
              </Field>
            </div>

            {documentType === 'prescription' ? (
              <div className="grid gap-3">
                <div className="grid gap-3 lg:grid-cols-[1.2fr_0.45fr_1fr_auto] lg:items-end">
                  <SearchCombo<MedicineSearchOption>
                    label="Medicine"
                    placeholder="Search medicine stock"
                    searchPath="/medicines/search/"
                    valueText={selectedMedicineLabel}
                    renderOption={(medicine) => `${medicine.name} (${medicine.unit}) - stock ${medicine.current_stock}`}
                    onSelect={(medicine) => {
                      setSelectedMedicine(medicine)
                      setSelectedMedicineLabel(medicine.name)
                    }}
                  />
                  <Field label="Quantity">
                    <input className={inputClassName} value={medicineForm.quantity} onChange={(event) => setMedicineForm({ ...medicineForm, quantity: event.target.value })} />
                  </Field>
                  <Field label="Usage instruction">
                    <input className={inputClassName} value={medicineForm.instructions} onChange={(event) => setMedicineForm({ ...medicineForm, instructions: event.target.value })} placeholder="1 tablet twice daily" />
                  </Field>
                  <button type="button" className={buttonClassName} onClick={addMedicine}>Add</button>
                </div>
                <DocumentItemList
                  empty="No medicines added."
                  rows={prescriptionItems.map((item, index) => ({
                    key: `${item.medicine}-${index}`,
                    title: item.medicine_name,
                    details: `Qty: ${item.quantity} | ${item.instructions}`,
                    onRemove: () => setPrescriptionItems((current) => current.filter((_, itemIndex) => itemIndex !== index)),
                  }))}
                />
              </div>
            ) : (
              <div className="grid gap-3">
                <SearchCombo<LabTestSearchOption>
                  label="Lab test"
                  placeholder="Search lab test"
                  searchPath="/lab-tests/search/"
                  renderOption={labTestOptionLabel}
                  onSelect={addLabTest}
                />
                <DocumentItemList
                  empty="No lab tests added."
                  rows={labOrderItems.map((item, index) => ({
                    key: `${item.test}-${index}`,
                    title: item.test_name,
                    details: 'Lab order',
                    onRemove: () => setLabOrderItems((current) => current.filter((_, itemIndex) => itemIndex !== index)),
                  }))}
                />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button className={buttonClassName} disabled={submitting}>{submitting ? common.saving : common.create}</button>
              <button className={ghostButtonClassName} type="button" onClick={resetForm}>{common.reset}</button>
            </div>
          </form>
        </Panel>

        <Panel>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_15rem]">
            <Field label="Search documents">
              <input className={inputClassName} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient or document title" />
            </Field>
            <Field label="Filter by type">
              <select className={inputClassName} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | 'prescription' | 'lab_order')}>
                <option value="all">All documents</option>
                <option value="prescription">Prescriptions</option>
                <option value="lab_order">Laboratory orders</option>
              </select>
            </Field>
          </div>
          <div className="grid gap-2">
            {documents.map((document) => (
              <button key={document.id} className="rounded border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => onPrint(document)}>
                <span className="font-medium">{document.document_type_label}</span> for {document.patient_name} - {document.title}
              </button>
            ))}
          </div>
          {!documents.length ? <div className="rounded border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">No clinical documents found.</div> : null}
          <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
        </Panel>
      </div>
    </>
  )
}

function MidwifeRecords({ onPrint }: { onPrint: (document: ClinicalDocument) => void }) {
  const t = midwifeRecordsText
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
          <SectionHeader title={t.title} subtitle={t.subtitle} />
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
              <button className={buttonClassName} disabled={saving}>{saving ? common.saving : editingId ? common.update : common.save}</button>
              {editingId ? <button className={ghostButtonClassName} type="button" onClick={resetForm}>{common.cancel}</button> : null}
            </div>
          </form>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sky-100 pb-4">
          <SectionHeader title={t.recordsTitle} subtitle="Review, print, edit, or delete ANC and PNC records created from this account." />
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
                  <button className={buttonClassName} onClick={() => onPrint(document)}>{common.print}</button>
                  <button className={ghostButtonClassName} onClick={() => editDocument(document)}>{common.edit}</button>
                  <button className={ghostButtonClassName} onClick={() => void deleteDocument(document.id)}>{common.delete}</button>
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

function MidwifeDeliveries({ onPrint }: { onPrint: (document: ClinicalDocument) => void }) {
  const t = midwifeDeliveriesText
  const [documents, setDocuments] = useState<ClinicalDocument[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [filterText, setFilterText] = useState('')
  const [deferredFilterText, setDeferredFilterText] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null)
  const [selectedPatientLabel, setSelectedPatientLabel] = useState('')
  const [form, setForm] = useState<DeliveryFormState>(emptyDeliveryForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const loadDocuments = useCallback(async (currentPage = page, search = deferredFilterText) => {
    const response = await apiFetch<PaginatedResponse<ClinicalDocument>>(`/documents/?document_type=ultrasound&mine=1&delivery_record=1&page=${currentPage}&q=${encodeURIComponent(search)}`)
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
    void loadDocuments(page, deferredFilterText).catch(() => setError('Unable to load delivery records.'))
  }, [deferredFilterText, loadDocuments, page])

  function resetForm() {
    setSelectedPatientId(null)
    setSelectedPatientLabel('')
    setForm(emptyDeliveryForm)
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
          title: 'Delivery record',
          total_amount: '0',
          payload: {
            delivery_record: true,
            delivery_datetime: form.deliveryDateTime,
            gestational_age_weeks: form.gestationalAgeWeeks,
            gravida: form.gravida,
            parity: form.parity,
            labor_onset: form.laborOnset,
            delivery_mode: form.deliveryMode,
            cervical_dilation_cm: form.cervicalDilationCm,
            fetal_heart_rate: form.fetalHeartRate,
            contraction_pattern: form.contractionPattern,
            membrane_status: form.membraneStatus,
            liquor_status: form.liquorStatus,
            maternal_blood_pressure: form.maternalBloodPressure,
            maternal_pulse: form.maternalPulse,
            maternal_temperature: form.maternalTemperature,
            baby_status: form.babyStatus,
            baby_sex: form.babySex,
            birth_weight_kg: form.birthWeightKg,
            apgar_1: form.apgar1,
            apgar_5: form.apgar5,
            mother_status: form.motherStatus,
            complications: form.complications,
            interventions: form.interventions,
            notes: form.notes,
          },
        }),
      })
      resetForm()
      setNotice(editingId ? 'Delivery record updated.' : 'Delivery record saved.')
      onPrint(document)
      await loadDocuments(page, deferredFilterText)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to save delivery record.'))
    } finally {
      setSaving(false)
    }
  }

  function editDocument(document: ClinicalDocument) {
    setEditingId(document.id)
    setSelectedPatientId(document.patient)
    setSelectedPatientLabel(document.patient_name)
    setForm({
      deliveryDateTime: payloadString(document, 'delivery_datetime'),
      gestationalAgeWeeks: payloadString(document, 'gestational_age_weeks'),
      gravida: payloadString(document, 'gravida'),
      parity: payloadString(document, 'parity'),
      laborOnset: payloadString(document, 'labor_onset'),
      deliveryMode: (payloadString(document, 'delivery_mode') || 'normal_vaginal') as DeliveryMode,
      cervicalDilationCm: payloadString(document, 'cervical_dilation_cm'),
      fetalHeartRate: payloadString(document, 'fetal_heart_rate'),
      contractionPattern: payloadString(document, 'contraction_pattern'),
      membraneStatus: payloadString(document, 'membrane_status'),
      liquorStatus: payloadString(document, 'liquor_status'),
      maternalBloodPressure: payloadString(document, 'maternal_blood_pressure'),
      maternalPulse: payloadString(document, 'maternal_pulse'),
      maternalTemperature: payloadString(document, 'maternal_temperature'),
      babyStatus: (payloadString(document, 'baby_status') || 'live_birth') as BabyStatus,
      babySex: payloadString(document, 'baby_sex'),
      birthWeightKg: payloadString(document, 'birth_weight_kg'),
      apgar1: payloadString(document, 'apgar_1'),
      apgar5: payloadString(document, 'apgar_5'),
      motherStatus: (payloadString(document, 'mother_status') || 'stable') as MotherStatus,
      complications: payloadString(document, 'complications'),
      interventions: payloadString(document, 'interventions'),
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
      setNotice('Delivery record deleted.')
      if (editingId === documentId) {
        resetForm()
      }
      await loadDocuments(page, deferredFilterText)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to delete delivery record.'))
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[27rem_minmax(0,1fr)]">
      <div className="xl:sticky xl:top-24 xl:self-start">
        <Panel>
          <SectionHeader title={t.title} subtitle={t.subtitle} />
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

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Delivery date and time">
                <input className={inputClassName} type="datetime-local" value={form.deliveryDateTime} onChange={(event) => setForm((current) => ({ ...current, deliveryDateTime: event.target.value }))} required />
              </Field>
              <Field label="Gestational age (weeks)">
                <input className={inputClassName} value={form.gestationalAgeWeeks} onChange={(event) => setForm((current) => ({ ...current, gestationalAgeWeeks: event.target.value }))} placeholder="e.g. 39" />
              </Field>
              <Field label="Gravida">
                <input className={inputClassName} value={form.gravida} onChange={(event) => setForm((current) => ({ ...current, gravida: event.target.value }))} placeholder="e.g. 3" />
              </Field>
              <Field label="Parity">
                <input className={inputClassName} value={form.parity} onChange={(event) => setForm((current) => ({ ...current, parity: event.target.value }))} placeholder="e.g. 2" />
              </Field>
              <Field label="Labour onset">
                <input className={inputClassName} value={form.laborOnset} onChange={(event) => setForm((current) => ({ ...current, laborOnset: event.target.value }))} placeholder="Spontaneous, induced, referred in labour" />
              </Field>
              <Field label="Delivery mode">
                <select className={inputClassName} value={form.deliveryMode} onChange={(event) => setForm((current) => ({ ...current, deliveryMode: event.target.value as DeliveryMode }))}>
                  <option value="normal_vaginal">Normal vaginal</option>
                  <option value="assisted_vaginal">Assisted vaginal</option>
                  <option value="c_section">C-section</option>
                  <option value="referred">Referred</option>
                </select>
              </Field>
              <Field label="Cervical dilation (cm)">
                <input className={inputClassName} value={form.cervicalDilationCm} onChange={(event) => setForm((current) => ({ ...current, cervicalDilationCm: event.target.value }))} placeholder="e.g. 10" />
              </Field>
              <Field label="Fetal heart rate">
                <input className={inputClassName} value={form.fetalHeartRate} onChange={(event) => setForm((current) => ({ ...current, fetalHeartRate: event.target.value }))} placeholder="e.g. 140 bpm" />
              </Field>
              <Field label="Contraction pattern">
                <input className={inputClassName} value={form.contractionPattern} onChange={(event) => setForm((current) => ({ ...current, contractionPattern: event.target.value }))} placeholder="e.g. 3 in 10 min, 45 sec" />
              </Field>
              <Field label="Membrane status">
                <input className={inputClassName} value={form.membraneStatus} onChange={(event) => setForm((current) => ({ ...current, membraneStatus: event.target.value }))} placeholder="Intact or ruptured" />
              </Field>
              <Field label="Liquor status">
                <input className={inputClassName} value={form.liquorStatus} onChange={(event) => setForm((current) => ({ ...current, liquorStatus: event.target.value }))} placeholder="Clear, meconium, blood-stained" />
              </Field>
              <Field label="Maternal blood pressure">
                <input className={inputClassName} value={form.maternalBloodPressure} onChange={(event) => setForm((current) => ({ ...current, maternalBloodPressure: event.target.value }))} placeholder="e.g. 110/70" />
              </Field>
              <Field label="Maternal pulse">
                <input className={inputClassName} value={form.maternalPulse} onChange={(event) => setForm((current) => ({ ...current, maternalPulse: event.target.value }))} placeholder="e.g. 84" />
              </Field>
              <Field label="Maternal temperature">
                <input className={inputClassName} value={form.maternalTemperature} onChange={(event) => setForm((current) => ({ ...current, maternalTemperature: event.target.value }))} placeholder="e.g. 37.1 C" />
              </Field>
              <Field label="Baby outcome">
                <select className={inputClassName} value={form.babyStatus} onChange={(event) => setForm((current) => ({ ...current, babyStatus: event.target.value as BabyStatus }))}>
                  <option value="live_birth">Live birth</option>
                  <option value="stillbirth">Stillbirth</option>
                  <option value="early_neonatal_death">Early neonatal death</option>
                </select>
              </Field>
              <Field label="Baby sex">
                <input className={inputClassName} value={form.babySex} onChange={(event) => setForm((current) => ({ ...current, babySex: event.target.value }))} placeholder="Male or female" />
              </Field>
              <Field label="Birth weight (kg)">
                <input className={inputClassName} value={form.birthWeightKg} onChange={(event) => setForm((current) => ({ ...current, birthWeightKg: event.target.value }))} placeholder="e.g. 3.1" />
              </Field>
              <Field label="APGAR at 1 minute">
                <input className={inputClassName} value={form.apgar1} onChange={(event) => setForm((current) => ({ ...current, apgar1: event.target.value }))} placeholder="0 - 10" />
              </Field>
              <Field label="APGAR at 5 minutes">
                <input className={inputClassName} value={form.apgar5} onChange={(event) => setForm((current) => ({ ...current, apgar5: event.target.value }))} placeholder="0 - 10" />
              </Field>
              <Field label="Mother status after delivery">
                <select className={inputClassName} value={form.motherStatus} onChange={(event) => setForm((current) => ({ ...current, motherStatus: event.target.value as MotherStatus }))}>
                  <option value="stable">Stable</option>
                  <option value="referred">Referred</option>
                  <option value="critical">Critical</option>
                </select>
              </Field>
            </div>

            <Field label="Complications">
              <textarea className={inputClassName} rows={3} value={form.complications} onChange={(event) => setForm((current) => ({ ...current, complications: event.target.value }))} placeholder="PPH, prolonged labour, eclampsia, fetal distress, shoulder dystocia..." />
            </Field>

            <Field label="Interventions and referral">
              <textarea className={inputClassName} rows={3} value={form.interventions} onChange={(event) => setForm((current) => ({ ...current, interventions: event.target.value }))} placeholder="Uterotonics, resuscitation, assisted delivery, referral notes..." />
            </Field>

            <Field label="Notes">
              <textarea className={inputClassName} rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Additional delivery notes" />
            </Field>

            <div className="flex flex-wrap gap-2 border-t border-sky-100 pt-2">
              <button className={buttonClassName} disabled={saving}>{saving ? common.saving : editingId ? common.update : common.save}</button>
              {editingId ? <button className={ghostButtonClassName} type="button" onClick={resetForm}>{common.cancel}</button> : null}
            </div>
          </form>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sky-100 pb-4">
          <SectionHeader title={t.recordsTitle} subtitle="Review, print, edit, or delete delivery outcomes recorded from this account." />
          <label className="w-full max-w-sm">
            <span className="sr-only">Search delivery records</span>
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
                    <p className="text-sm text-slate-500">{deliveryModeLabel(document)} | {babyStatusLabel(document)}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{formatDateTime(document.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${motherStatusLabel(document) === 'Stable' ? 'bg-emerald-50 text-emerald-700' : motherStatusLabel(document) === 'Referred' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                      {motherStatusLabel(document)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <p><strong>Birth weight:</strong> {payloadString(document, 'birth_weight_kg') || 'Not set'}</p>
                  <p><strong>Baby sex:</strong> {payloadString(document, 'baby_sex') || 'Not set'}</p>
                  <p><strong>APGAR:</strong> {payloadString(document, 'apgar_1') || '-'} / {payloadString(document, 'apgar_5') || '-'}</p>
                  <p><strong>Complications:</strong> {payloadString(document, 'complications') || 'None noted'}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={buttonClassName} onClick={() => onPrint(document)}>{common.print}</button>
                  <button className={ghostButtonClassName} onClick={() => editDocument(document)}>{common.edit}</button>
                  <button className={ghostButtonClassName} onClick={() => void deleteDocument(document.id)}>{common.delete}</button>
                </div>
              </div>
            ))}
          </div>
          {!documents.length ? <p className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-600">No delivery records found.</p> : null}
        </div>

        <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
      </Panel>
    </div>
  )
}

function DocumentItemList({ empty, rows }: { empty: string; rows: Array<{ key: string; title: string; details: string; onRemove: () => void }> }) {
  if (!rows.length) {
    return <div className="rounded border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">{empty}</div>
  }

  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 rounded border border-sky-100 bg-sky-50 px-3 py-2 text-sm">
          <div>
            <p className="font-semibold text-slate-950">{row.title}</p>
            <p className="text-zinc-600">{row.details}</p>
          </div>
          <button type="button" className={ghostButtonClassName} onClick={row.onRemove}>Remove</button>
        </div>
      ))}
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
