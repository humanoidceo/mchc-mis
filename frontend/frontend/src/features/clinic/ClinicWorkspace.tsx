import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, UIEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, Panel, SectionHeader } from '../../components/ui'
import type { ClinicalDocument, DashboardStats, DocumentType, DocumentTypeDefinition, LabTest, Medicine, Patient, Payment, SearchResponse } from '../../types/domain'
import { useAuth } from '../auth/useAuth'
import { PrintDocument, PrintPaymentBill } from './PrintDocument'

type View = 'dashboard' | 'patients' | 'payments' | 'documents' | 'stock'
type PatientSearchOption = Pick<Patient, 'id' | 'registration_number' | 'first_name' | 'last_name' | 'age'>
type MedicineSearchOption = Pick<Medicine, 'id' | 'name' | 'unit' | 'current_stock'>
type LabTestSearchOption = Pick<LabTest, 'id' | 'name'>
type PrescriptionItem = { medicine: number; medicine_name: string; quantity: string; instructions: string }
type LabOrderItem = { test: number; test_name: string }

const emptyStats: DashboardStats = {
  period: 'daily',
  period_label: 'Daily',
  patients: 0,
  full_paid: 0,
  free: 0,
  discounted: 0,
  pending_payments: 0,
  approved_payments: 0,
  total_payments: 0,
  pending_amount: '0',
  approved_amount: '0',
  total_amount: '0',
  departments: [],
  documents: 0,
  low_stock_medicines: 0,
}

const documentTemplates: Record<DocumentType, Record<string, unknown>> = {
  prescription: { items: [{ medicine: 'Paracetamol', instructions: '1 tablet twice daily for 3 days' }] },
  lab_order: { items: [{ test: 'CBC', instructions: 'Routine blood test' }] },
  lab_bill: { items: [{ test: 'CBC', cost: 300 }], notes: 'Laboratory bill' },
  medicine_bill: { items: [{ medicine: 'ORS', quantity: 2, cost: 100 }] },
  ultrasound: { items: [{ name: 'Ultrasound', result: 'Normal', cost: 800 }] },
  vaccination: { items: [{ vaccine: 'BCG', result: 'Done' }] },
  rutf: { items: [{ name: 'RUTF sachets', quantity: 14, notes: 'One week supply' }] },
}

const departmentOptions = ['Maternal care', 'Child care', 'General health', 'Laboratory', 'Ultrasound', 'Vaccination', 'Malnutrition']
const dashboardPeriodOptions: Array<{ value: DashboardStats['period']; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
]

function parseAmount(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function formatMoney(value: number): string {
  return value.toFixed(2)
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

function formatStatMoney(value: string | number): string {
  return Number(value || 0).toFixed(2)
}

function flattenValidationDetails(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return [`${prefix}: ${value.join(', ')}`]
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, nestedValue]) => {
      const nestedPrefix = prefix ? `${prefix}.${key}` : key
      return flattenValidationDetails(nestedValue, nestedPrefix)
    })
  }
  return prefix ? [`${prefix}: ${String(value)}`] : [String(value)]
}

function describeApiError(caught: unknown): string {
  if (caught instanceof ApiError) {
    const details = flattenValidationDetails(caught.details).join(' ')
    return details || caught.message
  }
  return 'Unable to save reception bill.'
}

export function ClinicWorkspace({ view }: { view: View }) {
  const { user } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [documents, setDocuments] = useState<ClinicalDocument[]>([])
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeDefinition[]>([])
  const [stats, setStats] = useState<DashboardStats>(emptyStats)
  const [selectedDocument, setSelectedDocument] = useState<ClinicalDocument | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [error, setError] = useState('')
  const printedBy = `${user?.username ?? 'MCHC staff'}-${user?.profile?.role_label ?? 'Staff'}`

  const loadData = useCallback(async function loadData() {
    setError('')
    try {
      if (view === 'dashboard') {
        setStats(await apiFetch<DashboardStats>('/dashboard/'))
        return
      }

      if (view === 'patients') {
        setPatients(await apiFetch<Patient[]>('/patients/'))
        return
      }

      if (view === 'payments') {
        setPayments(await apiFetch<Payment[]>('/payments/'))
        return
      }

      if (view === 'documents') {
        if (user?.profile?.role === 'doctor') {
          const [documentData, documentTypeData] = await Promise.all([
            apiFetch<ClinicalDocument[]>('/documents/'),
            apiFetch<DocumentTypeDefinition[]>('/documents/types/'),
          ])
          setDocuments(documentData)
          setDocumentTypes(documentTypeData)
          return
        }

        const [patientData, documentData, documentTypeData] = await Promise.all([
          apiFetch<Patient[]>('/patients/'),
          apiFetch<ClinicalDocument[]>('/documents/'),
          apiFetch<DocumentTypeDefinition[]>('/documents/types/'),
        ])
        setPatients(patientData)
        setDocuments(documentData)
        setDocumentTypes(documentTypeData)
        return
      }

      if (view === 'stock') {
        setMedicines(await apiFetch<Medicine[]>('/medicines/'))
      }
    } catch {
      setError('Unable to load clinic data.')
    }
  }, [user?.profile?.role, view])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const content = useMemo(() => {
    if (view === 'dashboard') return <Dashboard stats={stats} />
    if (view === 'patients') return <Patients patients={patients} onSaved={loadData} />
    if (view === 'payments') {
      return (
        <Payments
          payments={payments}
          onCreated={(payment) => {
            setSelectedDocument(null)
            setSelectedPayment(payment)
            void loadData()
          }}
          onSaved={loadData}
          onPrint={(payment) => {
            setSelectedDocument(null)
            setSelectedPayment(payment)
          }}
        />
      )
    }
    if (view === 'stock') return <MedicineStock medicines={medicines} onSaved={loadData} />
    if (user?.profile?.role === 'doctor') {
      return (
        <DoctorDocuments
          documents={documents}
          documentTypes={documentTypes}
          onCreated={(document) => {
            setSelectedPayment(null)
            setSelectedDocument(document)
            void loadData()
          }}
          onPrint={(document) => {
            setSelectedPayment(null)
            setSelectedDocument(document)
          }}
        />
      )
    }
    return (
      <Documents
        patients={patients}
        documents={documents}
        documentTypes={documentTypes}
        onCreated={(document) => {
          setSelectedPayment(null)
          setSelectedDocument(document)
          void loadData()
        }}
        onPrint={(document) => {
          setSelectedPayment(null)
          setSelectedDocument(document)
        }}
      />
    )
  }, [documentTypes, documents, loadData, medicines, patients, payments, stats, user?.profile?.role, view])

  return (
    <div className="space-y-5">
      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {content}
      {selectedDocument ? (
        <div className="space-y-3">
          <div className="no-print flex gap-2">
            <button className={buttonClassName} onClick={() => window.print()}>Print selected document</button>
            <button className={ghostButtonClassName} onClick={() => setSelectedDocument(null)}>Close preview</button>
          </div>
          <PrintDocument document={selectedDocument} />
        </div>
      ) : null}
      {selectedPayment ? (
        <div className="space-y-3">
          <div className="no-print flex gap-2">
            <button className={buttonClassName} onClick={() => window.print()}>Print bill</button>
            <button className={ghostButtonClassName} onClick={() => setSelectedPayment(null)}>Close preview</button>
          </div>
          <PrintPaymentBill payment={selectedPayment} printedBy={printedBy} />
        </div>
      ) : null}
    </div>
  )
}

function Dashboard({ stats }: { stats: DashboardStats }) {
  const [period, setPeriod] = useState<DashboardStats['period']>('daily')
  const [report, setReport] = useState(stats)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false

    async function loadReport() {
      setError('')
      try {
        const data = await apiFetch<DashboardStats>(`/dashboard/?period=${period}`)
        if (!ignore) setReport(data)
      } catch {
        if (!ignore) setError('Unable to load dashboard report.')
      }
    }

    void loadReport()
    return () => {
      ignore = true
    }
  }, [period])

  const maxDepartmentAmount = Math.max(1, ...report.departments.map((department) => Number(department.amount || 0)))
  const maxDepartmentPatients = Math.max(1, ...report.departments.map((department) => department.patients))
  const paymentCards = [
    { label: 'Patients came', value: report.patients, tone: 'border-sky-100 bg-sky-50 text-sky-700' },
    { label: 'Full paid', value: report.full_paid, tone: 'border-emerald-100 bg-emerald-50 text-emerald-700' },
    { label: 'Free', value: report.free, tone: 'border-rose-100 bg-rose-50 text-rose-700' },
    { label: 'Discounted', value: report.discounted, tone: 'border-violet-100 bg-violet-50 text-violet-700' },
    { label: 'Pending', value: report.pending_payments, tone: 'border-amber-100 bg-amber-50 text-amber-700' },
    { label: 'Approved', value: report.approved_payments, tone: 'border-teal-100 bg-teal-50 text-teal-700' },
    { label: 'Total payments', value: report.total_payments, tone: 'border-slate-200 bg-slate-50 text-slate-700' },
  ]

  return (
    <section className="print-area a4-report space-y-5">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title="Reception dashboard" subtitle="Patient and payment report for the selected period." />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-zinc-700">
            Period
            <select className={`${inputClassName} ml-2 w-36`} value={period} onChange={(event) => setPeriod(event.target.value as DashboardStats['period'])}>
              {dashboardPeriodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button className={buttonClassName} onClick={() => window.print()}>Print A4 report</button>
        </div>
      </div>

      <div className="hidden print:block">
        <p className="text-sm font-medium text-sky-600">MCHC MIS</p>
        <h1 className="text-2xl font-semibold text-slate-950">Reception Dashboard Report</h1>
        <p className="text-sm text-zinc-600">Period: {report.period_label}</p>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {paymentCards.map((card) => (
          <div key={card.label} className={`rounded-md border p-4 shadow-sm ${card.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <p className="text-sm font-semibold text-slate-950">Payment money</p>
          <div className="mt-4 space-y-3 text-sm">
            <MoneyBar label="Pending amount" value={Number(report.pending_amount || 0)} max={Number(report.total_amount || 0) || 1} className="bg-amber-400" />
            <MoneyBar label="Approved amount" value={Number(report.approved_amount || 0)} max={Number(report.total_amount || 0) || 1} className="bg-emerald-500" />
          </div>
          <p className="mt-5 rounded bg-slate-950 px-3 py-2 text-sm font-semibold text-white">Total money: {formatStatMoney(report.total_amount)}</p>
        </Panel>

        <Panel>
          <p className="text-sm font-semibold text-slate-950">Payment type mix</p>
          <div className="mt-4 space-y-3 text-sm">
            <CountBar label="Full paid" value={report.full_paid} max={report.total_payments || 1} className="bg-emerald-500" />
            <CountBar label="Free" value={report.free} max={report.total_payments || 1} className="bg-rose-500" />
            <CountBar label="Discounted" value={report.discounted} max={report.total_payments || 1} className="bg-violet-500" />
          </div>
        </Panel>

        <Panel>
          <p className="text-sm font-semibold text-slate-950">Payment status</p>
          <div className="mt-4 space-y-3 text-sm">
            <CountBar label="Pending" value={report.pending_payments} max={report.total_payments || 1} className="bg-amber-400" />
            <CountBar label="Approved" value={report.approved_payments} max={report.total_payments || 1} className="bg-teal-500" />
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-950">Patients and money by department</p>
          <p className="text-xs font-medium text-zinc-500">{report.period_label} report</p>
        </div>
        <div className="mt-4 grid gap-3">
          {report.departments.length ? report.departments.map((department) => {
            const amount = Number(department.amount || 0)
            return (
              <div key={department.department} className="grid gap-2 rounded border border-sky-100 bg-white p-3 md:grid-cols-[11rem_1fr_1fr] md:items-center">
                <div>
                  <p className="font-semibold text-slate-950">{department.department}</p>
                  <p className="text-xs text-zinc-500">{department.payments} payment(s)</p>
                </div>
                <DepartmentBar label={`${department.patients} patient(s)`} percent={(department.patients / maxDepartmentPatients) * 100} className="bg-sky-500" />
                <DepartmentBar label={`${formatStatMoney(amount)} money`} percent={(amount / maxDepartmentAmount) * 100} className="bg-pink-500" />
              </div>
            )
          }) : (
            <div className="rounded border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">No department payments for this period.</div>
          )}
        </div>
      </Panel>
    </section>
  )
}

function CountBar({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3">
        <span className="font-medium text-zinc-700">{label}</span>
        <span className="font-semibold text-slate-950">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  )
}

function MoneyBar({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3">
        <span className="font-medium text-zinc-700">{label}</span>
        <span className="font-semibold text-slate-950">{formatStatMoney(value)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  )
}

function DepartmentBar({ label, percent, className }: { label: string; percent: number; className: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-zinc-600">{label}</p>
      <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  )
}

function Patients({ patients, onSaved }: { patients: Patient[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', gender: 'female', date_of_birth: '', phone: '', address: '', guardian_name: '' })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await apiFetch<Patient>('/patients/', { method: 'POST', body: JSON.stringify({ ...form, date_of_birth: form.date_of_birth || null }) })
    setForm({ first_name: '', last_name: '', gender: 'female', date_of_birth: '', phone: '', address: '', guardian_name: '' })
    await onSaved()
  }

  return (
    <>
      <SectionHeader title="Patients" subtitle="Register and review patient records. Registration numbers are generated automatically." />
      <Panel>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
          <Field label="First name"><input className={inputClassName} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></Field>
          <Field label="Last name"><input className={inputClassName} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></Field>
          <Field label="Gender"><select className={inputClassName} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></Field>
          <Field label="Date of birth"><input className={inputClassName} type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></Field>
          <Field label="Phone"><input className={inputClassName} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Guardian"><input className={inputClassName} value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} /></Field>
          <Field label="Address"><input className={inputClassName} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <div className="md:col-span-4"><button className={buttonClassName}>Register patient</button></div>
        </form>
      </Panel>
      <DataTable headers={['Reg no.', 'Name', 'Age', 'Gender', 'Phone']} rows={patients.map((patient) => [patient.registration_number, `${patient.first_name} ${patient.last_name}`, patient.age?.toString() ?? '', patient.gender, patient.phone])} />
    </>
  )
}

function Payments({ payments, onCreated, onSaved, onPrint }: { payments: Payment[]; onCreated: (payment: Payment) => void; onSaved: () => Promise<void>; onPrint: (payment: Payment) => void }) {
  const [form, setForm] = useState({
    patient_name: '',
    age: '',
    department: departmentOptions[0],
    doctor_fee: '',
    payment_type: 'full' as Payment['payment_type'],
    discount_percentage: '',
    notes: '',
  })
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const doctorFee = parseAmount(form.doctor_fee)
  const discountPercent = form.payment_type === 'discount' ? Math.min(100, Math.max(0, parseAmount(form.discount_percentage))) : form.payment_type === 'free' ? 100 : 0
  const discountAmount = doctorFee * (discountPercent / 100)
  const paymentAmount = Math.max(0, doctorFee - discountAmount)

  function choosePaymentType(paymentType: Payment['payment_type']) {
    setForm({
      ...form,
      payment_type: paymentType,
      discount_percentage: paymentType === 'discount' ? form.discount_percentage : '',
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      const payment = await apiFetch<Payment>('/payments/reception-bill/', {
        method: 'POST',
        body: JSON.stringify({
          patient: {
            first_name: form.patient_name,
            last_name: '',
            age: Number(form.age),
            gender: 'other',
            date_of_birth: null,
            phone: '',
            address: '',
            guardian_name: '',
          },
          payment: {
            service: `${form.department} consultation`,
            department: form.department,
            doctor_name: '',
            patient_age: Number(form.age),
            doctor_fee: formatMoney(doctorFee),
            payment_type: form.payment_type,
            discount_percentage: form.payment_type === 'discount' ? form.discount_percentage || '0' : '0',
            notes: form.notes,
          },
        }),
      })
      setForm({ patient_name: '', age: '', department: departmentOptions[0], doctor_fee: '', payment_type: 'full', discount_percentage: '', notes: '' })
      onCreated(payment)
    } catch (caught) {
      setFormError(describeApiError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  async function approve(paymentId: number) {
    await apiFetch<Payment>(`/payments/${paymentId}/approve/`, { method: 'POST' })
    await onSaved()
  }

  return (
    <>
      <SectionHeader title="Patient registration and payment" subtitle="Register walk-in patients, calculate doctor fees, discounts, and print the reception bill." />
      <Panel>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
          {formError ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-4">{formError}</div> : null}
          <Field label="Patient name"><input className={inputClassName} value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} required /></Field>
          <Field label="Age"><input className={inputClassName} type="number" min="0" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} required /></Field>
          <Field label="Department">
            <select className={inputClassName} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
              {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </Field>
          <Field label="Doctor fee"><input className={inputClassName} type="number" min="0" step="0.01" value={form.doctor_fee} onChange={(e) => setForm({ ...form, doctor_fee: e.target.value })} required /></Field>
          <div className="md:col-span-4">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Payment option</span>
            <div className="flex flex-wrap gap-3 rounded border border-sky-200 bg-white px-3 py-2 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={form.payment_type === 'full'} onChange={() => choosePaymentType('full')} /> Full payment</label>
              <label className="flex items-center gap-2"><input type="radio" checked={form.payment_type === 'free'} onChange={() => choosePaymentType('free')} /> Free</label>
              <label className="flex items-center gap-2"><input type="radio" checked={form.payment_type === 'discount'} onChange={() => choosePaymentType('discount')} /> Discount percentage</label>
            </div>
          </div>
          {form.payment_type === 'discount' ? (
            <Field label="Discount percentage">
              <input className={inputClassName} type="number" min="0" max="100" step="0.01" value={form.discount_percentage} onChange={(e) => setForm({ ...form, discount_percentage: e.target.value })} placeholder="Type 20 for 20%" required />
            </Field>
          ) : null}
          <Field label="Notes"><input className={inputClassName} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="grid gap-2 rounded border border-pink-100 bg-pink-50 p-3 text-sm md:col-span-4 md:grid-cols-3">
            <p><strong>Doctor fee:</strong> {formatMoney(doctorFee)}</p>
            <p><strong>Payment option:</strong> {form.payment_type === 'free' ? 'Free' : form.payment_type === 'discount' ? `${formatPercent(discountPercent)}% discount (${formatMoney(discountAmount)})` : 'Full payment'}</p>
            <p><strong>Amount after discount:</strong> {form.payment_type === 'free' ? 'Free' : formatMoney(paymentAmount)}</p>
          </div>
          <div className="md:col-span-4"><button className={buttonClassName} disabled={submitting}>{submitting ? 'Creating bill...' : 'Create and preview bill'}</button></div>
        </form>
      </Panel>
      <Panel>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-zinc-200"><th className="py-2">Patient</th><th>Age</th><th>Department</th><th>Fee</th><th>Payment</th><th>Amount after discount</th><th>Status</th><th></th></tr></thead>
            <tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-zinc-100"><td className="py-2">{payment.patient_full_name || payment.patient_name}</td><td>{payment.patient_age ?? ''}</td><td>{payment.department || payment.service}</td><td>{payment.doctor_fee}</td><td>{payment.payment_type === 'free' ? 'Free' : payment.payment_type === 'discount' ? `${payment.discount_percentage}% discount` : 'Full payment'}</td><td>{payment.payment_type === 'free' ? 'Free' : payment.amount}</td><td>{payment.status}</td><td className="flex gap-2 py-2"><button className={ghostButtonClassName} onClick={() => onPrint(payment)}>Print</button>{payment.status === 'pending' ? <button className={ghostButtonClassName} onClick={() => void approve(payment.id)}>Approve</button> : null}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}

function SearchCombo<T extends { id: number }>({ label, placeholder, searchPath, renderOption, onSelect }: { label: string; placeholder: string; searchPath: string; renderOption: (item: T) => string; onSelect: (item: T) => void }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<T[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

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
    if (!open) return
    const timer = window.setTimeout(() => {
      setNextOffset(0)
      void loadOptions(0, true, query)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [loadOptions, open, query])

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget
    if (nextOffset === null || loading) return
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 8) {
      void loadOptions(nextOffset)
    }
  }

  return (
    <div className="relative">
      <Field label={label}>
        <input
          className={inputClassName}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
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

function DoctorDocuments({ documents, documentTypes, onCreated, onPrint }: { documents: ClinicalDocument[]; documentTypes: DocumentTypeDefinition[]; onCreated: (document: ClinicalDocument) => void; onPrint: (document: ClinicalDocument) => void }) {
  const canCreatePrescription = documentTypes.some((type) => type.code === 'prescription')
  const canCreateLabOrder = documentTypes.some((type) => type.code === 'lab_order')
  const [documentType, setDocumentType] = useState<DocumentType>(canCreatePrescription ? 'prescription' : 'lab_order')
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchOption | null>(null)
  const [selectedMedicine, setSelectedMedicine] = useState<MedicineSearchOption | null>(null)
  const [medicineForm, setMedicineForm] = useState({ quantity: '', instructions: '' })
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([])
  const [labOrderItems, setLabOrderItems] = useState<LabOrderItem[]>([])
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (documentType === 'prescription' && !canCreatePrescription && canCreateLabOrder) setDocumentType('lab_order')
    if (documentType === 'lab_order' && !canCreateLabOrder && canCreatePrescription) setDocumentType('prescription')
  }, [canCreateLabOrder, canCreatePrescription, documentType])

  function addMedicine() {
    if (!selectedMedicine || !medicineForm.quantity || !medicineForm.instructions) return
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
    setMedicineForm({ quantity: '', instructions: '' })
  }

  function addLabTest(test: LabTestSearchOption) {
    setLabOrderItems((current) => current.some((item) => item.test === test.id) ? current : [...current, { test: test.id, test_name: test.name }])
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    if (!selectedPatient) {
      setFormError('Select a patient first.')
      return
    }
    if (documentType === 'prescription' && !prescriptionItems.length) {
      setFormError('Add at least one medicine.')
      return
    }
    if (documentType === 'lab_order' && !labOrderItems.length) {
      setFormError('Add at least one lab test.')
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
          payload: documentType === 'prescription'
            ? { items: prescriptionItems }
            : { items: labOrderItems },
        }),
      })
      setPrescriptionItems([])
      setLabOrderItems([])
      onCreated(document)
    } catch (caught) {
      setFormError(describeApiError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <SectionHeader title="Doctor documents" subtitle="Search patient, create prescriptions or lab test orders, and print half-A4 documents." />
      <Panel>
        <form onSubmit={submit} className="grid gap-4">
          {formError ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div> : null}
          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <SearchCombo<PatientSearchOption>
              label="Patient"
              placeholder="Search patient name or registration number"
              searchPath="/patients/search/"
              renderOption={(patient) => `${patient.registration_number} - ${patient.first_name} ${patient.last_name}${patient.age ? ` (${patient.age})` : ''}`}
              onSelect={setSelectedPatient}
            />
            <Field label="Document type">
              <select className={inputClassName} value={documentType} onChange={(event) => setDocumentType(event.target.value as DocumentType)}>
                {canCreatePrescription ? <option value="prescription">Prescription</option> : null}
                {canCreateLabOrder ? <option value="lab_order">Laboratory test order</option> : null}
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
                  renderOption={(medicine) => `${medicine.name} (${medicine.unit}) - stock ${medicine.current_stock}`}
                  onSelect={setSelectedMedicine}
                />
                <Field label="Quantity"><input className={inputClassName} value={medicineForm.quantity} onChange={(event) => setMedicineForm({ ...medicineForm, quantity: event.target.value })} /></Field>
                <Field label="Usage instruction"><input className={inputClassName} value={medicineForm.instructions} onChange={(event) => setMedicineForm({ ...medicineForm, instructions: event.target.value })} placeholder="1 tablet twice daily" /></Field>
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
                renderOption={(test) => test.name}
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

          <button className={buttonClassName} disabled={submitting}>{submitting ? 'Creating...' : 'Create and preview printable document'}</button>
        </form>
      </Panel>
      <Panel>
        <div className="grid gap-2">
          {documents.filter((document) => document.document_type === 'prescription' || document.document_type === 'lab_order').map((document) => (
            <button key={document.id} className="rounded border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => onPrint(document)}>
              <span className="font-medium">{document.document_type_label}</span> for {document.patient_name} - {document.title}
            </button>
          ))}
        </div>
      </Panel>
    </>
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

function Documents({ patients, documents, documentTypes, onCreated, onPrint }: { patients: Patient[]; documents: ClinicalDocument[]; documentTypes: DocumentTypeDefinition[]; onCreated: (document: ClinicalDocument) => void; onPrint: (document: ClinicalDocument) => void }) {
  const firstType = documentTypes[0]?.code ?? 'prescription'
  const [form, setForm] = useState({ patient: '', document_type: firstType, title: '', total_amount: '0', payload: JSON.stringify(documentTemplates[firstType], null, 2) })

  useEffect(() => {
    if (documentTypes.length && !documentTypes.some((type) => type.code === form.document_type)) {
      const nextType = documentTypes[0].code
      setForm((current) => ({ ...current, document_type: nextType, payload: JSON.stringify(documentTemplates[nextType], null, 2) }))
    }
  }, [documentTypes, form.document_type])

  function changeDocumentType(documentType: DocumentType) {
    setForm({ ...form, document_type: documentType, payload: JSON.stringify(documentTemplates[documentType], null, 2) })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const document = await apiFetch<ClinicalDocument>('/documents/', {
      method: 'POST',
      body: JSON.stringify({
        patient: Number(form.patient),
        document_type: form.document_type,
        title: form.title || documentTypes.find((type) => type.code === form.document_type)?.label,
        total_amount: form.total_amount,
        payload: JSON.parse(form.payload),
      }),
    })
    onCreated(document)
  }

  return (
    <>
      <SectionHeader title="Clinical documents" subtitle="Create prescriptions, lab orders, bills, ultrasound, vaccination, and RUTF papers." />
      <Panel>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Patient"><PatientSelect patients={patients} value={form.patient} onChange={(patient) => setForm({ ...form, patient })} /></Field>
            <Field label="Document type"><select className={inputClassName} value={form.document_type} onChange={(e) => changeDocumentType(e.target.value as DocumentType)}>{documentTypes.map((type) => <option key={type.code} value={type.code}>{type.label}</option>)}</select></Field>
            <Field label="Title"><input className={inputClassName} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Total cost"><input className={inputClassName} value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} /></Field>
          </div>
          <Field label="Payload JSON"><textarea className={`${inputClassName} min-h-44 font-mono`} value={form.payload} onChange={(e) => setForm({ ...form, payload: e.target.value })} /></Field>
          <button className={buttonClassName}>Create printable document</button>
        </form>
      </Panel>
      <Panel>
        <div className="grid gap-2">
          {documents.map((document) => (
            <button key={document.id} className="rounded border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => onPrint(document)}>
              <span className="font-medium">{document.document_type_label}</span> for {document.patient_name} - {document.title}
            </button>
          ))}
        </div>
      </Panel>
    </>
  )
}

function MedicineStock({ medicines, onSaved }: { medicines: Medicine[]; onSaved: () => Promise<void> }) {
  const [medicine, setMedicine] = useState({ name: '', unit: 'tablet', sale_price: '0', low_stock_threshold: '10' })
  const [movement, setMovement] = useState({ medicine: '', movement_type: 'in', quantity: '0', note: '' })

  async function addMedicine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await apiFetch<Medicine>('/medicines/', { method: 'POST', body: JSON.stringify(medicine) })
    setMedicine({ name: '', unit: 'tablet', sale_price: '0', low_stock_threshold: '10' })
    await onSaved()
  }

  async function addMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await apiFetch('/stock-movements/', { method: 'POST', body: JSON.stringify({ ...movement, medicine: Number(movement.medicine), quantity: Number(movement.quantity) }) })
    setMovement({ medicine: '', movement_type: 'in', quantity: '0', note: '' })
    await onSaved()
  }

  return (
    <>
      <SectionHeader title="Medicine stock" subtitle="Manage pharmacy items and stock movements." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <form onSubmit={addMedicine} className="grid gap-3 md:grid-cols-2">
            <Field label="Name"><input className={inputClassName} value={medicine.name} onChange={(e) => setMedicine({ ...medicine, name: e.target.value })} required /></Field>
            <Field label="Unit"><input className={inputClassName} value={medicine.unit} onChange={(e) => setMedicine({ ...medicine, unit: e.target.value })} /></Field>
            <Field label="Sale price"><input className={inputClassName} value={medicine.sale_price} onChange={(e) => setMedicine({ ...medicine, sale_price: e.target.value })} /></Field>
            <Field label="Low stock threshold"><input className={inputClassName} value={medicine.low_stock_threshold} onChange={(e) => setMedicine({ ...medicine, low_stock_threshold: e.target.value })} /></Field>
            <button className={buttonClassName}>Add medicine</button>
          </form>
        </Panel>
        <Panel>
          <form onSubmit={addMovement} className="grid gap-3 md:grid-cols-2">
            <Field label="Medicine"><select className={inputClassName} value={movement.medicine} onChange={(e) => setMovement({ ...movement, medicine: e.target.value })} required><option value="">Select</option>{medicines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Movement"><select className={inputClassName} value={movement.movement_type} onChange={(e) => setMovement({ ...movement, movement_type: e.target.value })}><option value="in">Stock in</option><option value="out">Stock out</option><option value="adjustment">Adjustment</option></select></Field>
            <Field label="Quantity"><input className={inputClassName} value={movement.quantity} onChange={(e) => setMovement({ ...movement, quantity: e.target.value })} /></Field>
            <Field label="Note"><input className={inputClassName} value={movement.note} onChange={(e) => setMovement({ ...movement, note: e.target.value })} /></Field>
            <button className={buttonClassName}>Record movement</button>
          </form>
        </Panel>
      </div>
      <DataTable headers={['Medicine', 'Unit', 'Price', 'Stock']} rows={medicines.map((item) => [item.name, item.unit, item.sale_price, `${item.current_stock}${item.is_low_stock ? ' low' : ''}`])} />
    </>
  )
}

function PatientSelect({ patients, value, onChange }: { patients: Patient[]; value: string; onChange: (value: string) => void }) {
  return (
    <select className={inputClassName} value={value} onChange={(event) => onChange(event.target.value)} required>
      <option value="">Select patient</option>
      {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.registration_number} - {patient.first_name} {patient.last_name}</option>)}
    </select>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <Panel>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200">{headers.map((header) => <th key={header} className="py-2 font-semibold">{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-zinc-100">{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} className="py-2">{cell}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
