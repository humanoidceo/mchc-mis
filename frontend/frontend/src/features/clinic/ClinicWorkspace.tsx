import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, UIEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { ClinicalDocument, DashboardStats, DocumentType, DocumentTypeDefinition, EmployeeSearchOption, Expense, ExpenseCategoryOption, LabTest, Medicine, PaginatedResponse, Patient, Payment, SalaryAdvance, SalaryPayment, SearchResponse } from '../../types/domain'
import { useAuth } from '../auth/useAuth'
import { FamilyPlanningOrderSection } from '../familyPlanning/FamilyPlanningOrderSection'
import { PharmacyMedicineStockSection } from '../pharmacy/PharmacyMedicineStockSection'
import { PrintDocument, PrintPaymentBill } from './PrintDocument'

type View = 'dashboard' | 'patients' | 'payments' | 'expenses' | 'salaries' | 'documents' | 'family-planning' | 'ultrasound-reports' | 'stock'
type PatientSearchOption = Pick<Patient, 'id' | 'registration_number' | 'first_name' | 'last_name' | 'age'>
type MedicineSearchOption = Pick<Medicine, 'id' | 'name' | 'unit' | 'current_stock'>
type LabTestSearchOption = Pick<LabTest, 'id' | 'name' | 'display_name' | 'category' | 'is_panel' | 'component_count'>
type PrescriptionItem = { medicine: number; medicine_name: string; quantity: string; instructions: string }
type LabOrderItem = { test: number; test_name: string }
type GynecologyUltrasoundFormState = {
  patient_status: 'new' | 'follow_up'
  report_type: 'obstetric' | 'pelvic'
  indication: string
  lmp: string
  gestational_age_weeks: string
  estimated_due_date: string
  fetal_count: string
  fetal_heartbeat: string
  fetal_heart_rate: string
  fetal_movement: string
  fetal_presentation: string
  placenta_position: string
  amniotic_fluid: string
  cervix_status: string
  biometry_summary: string
  uterus: string
  endometrium: string
  right_ovary: string
  left_ovary: string
  adnexa: string
  cul_de_sac: string
  impression: string
  recommendation: string
  notes: string
}

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
  patient_trend: [],
  departments: [],
  documents: 0,
  low_stock_medicines: 0,
  expenses_count: 0,
  expenses_amount: '0',
}

const documentTemplates: Record<DocumentType, Record<string, unknown>> = {
  prescription: { items: [{ medicine: 'Paracetamol', instructions: '1 tablet twice daily for 3 days' }] },
  lab_order: { items: [{ test: 'CBC', instructions: 'Routine blood test' }] },
  lab_bill: { items: [{ test: 'CBC', cost: 300 }], notes: 'Laboratory bill' },
  medicine_bill: { items: [{ medicine: 'ORS', quantity: 2, cost: 100 }] },
  ultrasound: { items: [{ name: 'Ultrasound', result: 'Normal', cost: 800 }] },
  family_planning: { items: [{ medicine: 'Condom', quantity: 10 }] },
  vaccination: { items: [{ vaccine: 'BCG', result: 'Done' }] },
  rutf: { items: [{ name: 'RUTF sachets', quantity: 14, notes: 'One week supply' }] },
}

const departmentOptions = ['Maternal care', 'Child care', 'General health', 'Gynecology', 'Laboratory', 'Ultrasound', 'Vaccination', 'Malnutrition']
const freeDepartments = new Set(['vaccination', 'malnutrition'])
const dashboardPeriodOptions: Array<{ value: DashboardStats['period']; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
]
const afghanMonthOptions = ['Hamal', 'Sawr', 'Jawza', 'Saratan', 'Asad', 'Sonbola', 'Mizan', 'Aqrab', 'Qaws', 'Jadi', 'Dalwa', 'Hut']

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

function formatAfn(value: string | number): string {
  return `${formatStatMoney(value)} AFN`
}

function calculateAfghanistanSalaryTax(monthlyTaxableSalary: number): number {
  if (monthlyTaxableSalary <= 5000) return 0
  if (monthlyTaxableSalary <= 12500) return (monthlyTaxableSalary - 5000) * 0.02
  if (monthlyTaxableSalary <= 100000) return 150 + ((monthlyTaxableSalary - 12500) * 0.1)
  return 8900 + ((monthlyTaxableSalary - 100000) * 0.2)
}

const emptyGynecologyUltrasoundForm: GynecologyUltrasoundFormState = {
  patient_status: 'new',
  report_type: 'obstetric',
  indication: '',
  lmp: '',
  gestational_age_weeks: '',
  estimated_due_date: '',
  fetal_count: 'single',
  fetal_heartbeat: 'yes',
  fetal_heart_rate: '',
  fetal_movement: 'present',
  fetal_presentation: 'cephalic',
  placenta_position: 'anterior',
  amniotic_fluid: 'normal',
  cervix_status: 'closed',
  biometry_summary: '',
  uterus: '',
  endometrium: '',
  right_ovary: '',
  left_ovary: '',
  adnexa: '',
  cul_de_sac: '',
  impression: '',
  recommendation: '',
  notes: '',
}

function isFreeDepartment(department: string): boolean {
  return freeDepartments.has(department.trim().toLowerCase())
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

function labTestOptionLabel(test: LabTestSearchOption): string {
  const label = test.display_name || test.name
  if (test.is_panel) {
    return `${label} (${test.component_count} analytes)`
  }
  return test.category ? `${label} - ${test.category}` : label
}

export function ClinicWorkspace({ view }: { view: View }) {
  const { user } = useAuth()
  const isDoctorLikeRole = user?.profile?.role === 'doctor' || user?.profile?.role === 'gynecologist'
  const usesDoctorDocumentView = isDoctorLikeRole || user?.profile?.role === 'super_admin'
  const [patients, setPatients] = useState<Patient[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [documents, setDocuments] = useState<ClinicalDocument[]>([])
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeDefinition[]>([])
  const [stats, setStats] = useState<DashboardStats>(emptyStats)
  const [selectedDocument, setSelectedDocument] = useState<ClinicalDocument | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [error, setError] = useState('')
  const [patientsPage, setPatientsPage] = useState(1)
  const [paymentsPage, setPaymentsPage] = useState(1)
  const [documentsPage, setDocumentsPage] = useState(1)
  const [documentsSearch, setDocumentsSearch] = useState('')
  const [documentsTypeFilter, setDocumentsTypeFilter] = useState<'all' | 'prescription' | 'lab_order'>('all')
  const [medicinesPage, setMedicinesPage] = useState(1)
  const [patientsCount, setPatientsCount] = useState(0)
  const [paymentsCount, setPaymentsCount] = useState(0)
  const [documentsCount, setDocumentsCount] = useState(0)
  const [medicinesCount, setMedicinesCount] = useState(0)
  const printedBy = `${user?.username ?? 'MCHC staff'}-${user?.profile?.role_label ?? 'Staff'}`
  const deferredDocumentsSearch = useDeferredValue(documentsSearch)

  useEffect(() => {
    setDocumentsPage(1)
  }, [deferredDocumentsSearch, documentsTypeFilter])

  const loadData = useCallback(async function loadData() {
    setError('')
    try {
      if (view === 'dashboard') {
        setStats(await apiFetch<DashboardStats>('/dashboard/'))
        return
      }

      if (view === 'patients') {
        const response = await apiFetch<PaginatedResponse<Patient>>(`/patients/?page=${patientsPage}`)
        setPatients(response.results)
        setPatientsCount(response.count)
        return
      }

      if (view === 'payments') {
        const response = await apiFetch<PaginatedResponse<Payment>>(`/payments/?page=${paymentsPage}`)
        setPayments(response.results)
        setPaymentsCount(response.count)
        return
      }

      if (view === 'documents') {
        const params = new URLSearchParams({ page: String(documentsPage) })
        if (usesDoctorDocumentView) {
          if (documentsTypeFilter !== 'all') {
            params.set('document_type', documentsTypeFilter)
          }
          if (deferredDocumentsSearch.trim()) {
            params.set('q', deferredDocumentsSearch.trim())
          }
        }
        if (usesDoctorDocumentView) {
          const [documentData, documentTypeData] = await Promise.all([
            apiFetch<PaginatedResponse<ClinicalDocument>>(`/documents/?${params.toString()}`),
            apiFetch<DocumentTypeDefinition[]>('/documents/types/'),
          ])
          setDocuments(documentData.results)
          setDocumentsCount(documentData.count)
          setDocumentTypes(documentTypeData)
          return
        }

        const [documentData, documentTypeData] = await Promise.all([
          apiFetch<PaginatedResponse<ClinicalDocument>>(`/documents/?${params.toString()}`),
          apiFetch<DocumentTypeDefinition[]>('/documents/types/'),
        ])
        setDocuments(documentData.results)
        setDocumentsCount(documentData.count)
        setDocumentTypes(documentTypeData)
        return
      }

      if (view === 'stock') {
        const response = await apiFetch<PaginatedResponse<Medicine>>(`/medicines/?page=${medicinesPage}`)
        setMedicines(response.results)
        setMedicinesCount(response.count)
      }
    } catch {
      setError('Unable to load clinic data.')
    }
  }, [deferredDocumentsSearch, documentsPage, documentsTypeFilter, medicinesPage, patientsPage, paymentsPage, usesDoctorDocumentView, view])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const content = useMemo(() => {
    if (view === 'dashboard') return <Dashboard stats={stats} role={user?.profile?.role} />
    if (view === 'patients') return <Patients patients={patients} totalCount={patientsCount} page={patientsPage} onPageChange={setPatientsPage} onSaved={loadData} />
    if (view === 'payments') {
      return (
        <Payments
          payments={payments}
          totalCount={paymentsCount}
          page={paymentsPage}
          onPageChange={setPaymentsPage}
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
    if (view === 'expenses') {
      return <ExpensesSection />
    }
    if (view === 'salaries') {
      return <SalariesSection />
    }
    if (view === 'stock' && user?.profile?.role === 'super_admin') {
      return <PharmacyMedicineStockSection />
    }
    if (view === 'stock') return <MedicineStock medicines={medicines} totalCount={medicinesCount} page={medicinesPage} onPageChange={setMedicinesPage} onSaved={loadData} />
    if (view === 'family-planning' && user?.profile?.role === 'gynecologist') {
      return (
        <FamilyPlanningOrderSection
          title="Family planning"
          subtitle="Search a patient, select family planning items from pharmacy stock, and send the patient directly to pharmacy without billing or prescription printing."
          listTitle="Family planning orders"
          listSubtitle="Review, edit, or delete family planning orders created from this gynecologist account until pharmacy dispenses them."
          patientSearchPath="/patients/search/"
          patientSearchPlaceholder="Search patient name or registration number"
        />
      )
    }
    if (view === 'ultrasound-reports' && user?.profile?.role === 'gynecologist') {
      return (
        <GynecologyUltrasoundReports
          onCreated={(document) => {
            setSelectedPayment(null)
            setSelectedDocument(document)
          }}
          onPrint={(document) => {
            setSelectedPayment(null)
            setSelectedDocument(document)
          }}
        />
      )
    }
    if (usesDoctorDocumentView) {
      return (
        <DoctorDocuments
          role={user?.profile?.role}
          documents={documents}
          totalCount={documentsCount}
          page={documentsPage}
          onPageChange={setDocumentsPage}
          search={documentsSearch}
          onSearchChange={setDocumentsSearch}
          typeFilter={documentsTypeFilter}
          onTypeFilterChange={setDocumentsTypeFilter}
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
        documents={documents}
        totalCount={documentsCount}
        page={documentsPage}
        onPageChange={setDocumentsPage}
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
  }, [documentTypes, documents, documentsCount, documentsPage, documentsSearch, documentsTypeFilter, loadData, medicines, medicinesCount, medicinesPage, patients, patientsCount, patientsPage, payments, paymentsCount, paymentsPage, stats, user?.profile?.role, usesDoctorDocumentView, view])

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

function Dashboard({ stats, role }: { stats: DashboardStats; role?: string }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<DashboardStats['period']>('daily')
  const [report, setReport] = useState(stats)
  const [error, setError] = useState('')
  const isDoctorDashboard = role === 'doctor' || role === 'gynecologist'
  const showExpensesCard = role === 'receptionist' || role === 'super_admin'
  const dashboardTitle = role === 'gynecologist' ? 'Gynecologist dashboard' : isDoctorDashboard ? 'Doctor dashboard' : 'Reception dashboard'
  const dashboardSubtitle = role === 'gynecologist'
    ? 'Patient and payment summary for this gynecologist in the selected period.'
    : isDoctorDashboard
      ? 'Patient and payment summary for this doctor in the selected period.'
      : 'Patient and payment report for the selected period.'
  const printTitle = role === 'gynecologist' ? 'Gynecologist Dashboard Report' : isDoctorDashboard ? 'Doctor Dashboard Report' : 'Reception Dashboard Report'

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
    { label: isDoctorDashboard ? 'Patients seen' : 'Patients came', value: report.patients, tone: 'border-sky-100 bg-sky-50 text-sky-700' },
    { label: 'Full paid', value: report.full_paid, tone: 'border-emerald-100 bg-emerald-50 text-emerald-700' },
    { label: 'Free', value: report.free, tone: 'border-rose-100 bg-rose-50 text-rose-700' },
    { label: 'Discounted', value: report.discounted, tone: 'border-violet-100 bg-violet-50 text-violet-700' },
    ...(isDoctorDashboard ? [] : [
      { label: 'Pending', value: report.pending_payments, tone: 'border-amber-100 bg-amber-50 text-amber-700' },
      { label: 'Approved', value: report.approved_payments, tone: 'border-teal-100 bg-teal-50 text-teal-700' },
      { label: 'Total payments', value: report.total_payments, tone: 'border-slate-200 bg-slate-50 text-slate-700' },
    ]),
    ...(showExpensesCard ? [
      {
        label: 'Expenses',
        value: report.expenses_count,
        detail: formatAfn(report.expenses_amount),
        tone: 'border-orange-100 bg-orange-50 text-orange-700',
        onClick: () => navigate('/expenses'),
      },
    ] : []),
  ]

  return (
    <section className="print-area a4-report space-y-5">
      <div className="no-print flex flex-wrap items-start justify-between gap-4">
        <SectionHeader title={dashboardTitle} subtitle={dashboardSubtitle} />
        <div className="flex min-w-[18rem] flex-col gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm shadow-sky-100/70 sm:min-w-[22rem] sm:flex-row sm:items-end sm:justify-end">
          <label className="flex-1 text-sm font-medium text-zinc-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Report period</span>
            <select className={`${inputClassName} w-full`} value={period} onChange={(event) => setPeriod(event.target.value as DashboardStats['period'])}>
              {dashboardPeriodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button
            className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm shadow-slate-200 transition hover:bg-slate-800"
            onClick={() => window.print()}
          >
            Print dashboard report
          </button>
        </div>
      </div>

      <div className="hidden print:block">
        <p className="text-sm font-medium text-sky-600">MCHC MIS</p>
        <h1 className="text-2xl font-semibold text-slate-950">{printTitle}</h1>
        <p className="text-sm text-zinc-600">Period: {report.period_label}</p>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${isDoctorDashboard ? 'xl:grid-cols-4' : showExpensesCard ? 'xl:grid-cols-8' : 'xl:grid-cols-7'}`}>
        {paymentCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className={`rounded-md border p-4 text-left shadow-sm transition ${card.onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : 'cursor-default'} ${card.tone}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{card.value}</p>
            {'detail' in card && card.detail ? <p className="mt-2 text-sm font-semibold text-slate-700">{card.detail}</p> : null}
          </button>
        ))}
      </div>

      <div className={`grid gap-4 ${isDoctorDashboard ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
        <Panel>
          <p className="text-sm font-semibold text-slate-950">{isDoctorDashboard ? 'Patient money summary' : 'Payment money'}</p>
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

        {!isDoctorDashboard ? (
          <Panel>
            <p className="text-sm font-semibold text-slate-950">Payment status</p>
            <div className="mt-4 space-y-3 text-sm">
              <CountBar label="Pending" value={report.pending_payments} max={report.total_payments || 1} className="bg-amber-400" />
              <CountBar label="Approved" value={report.approved_payments} max={report.total_payments || 1} className="bg-teal-500" />
            </div>
          </Panel>
        ) : null}
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-950">Patient trend</p>
          <p className="text-xs font-medium text-zinc-500">
            {report.period === 'weekly' ? 'Daily trend for this week' : report.period === 'monthly' ? 'Daily trend for this month' : report.period === 'annual' ? 'Monthly trend for this year' : 'Select weekly, monthly, or annual'}
          </p>
        </div>
        {report.period === 'daily' ? (
          <div className="mt-4 rounded border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">
            Change the period to weekly, monthly, or annual to view the patient trend graph.
          </div>
        ) : (
          <PatientTrendChart data={report.patient_trend} />
        )}
      </Panel>

      {!isDoctorDashboard ? (
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
      ) : null}
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

function PatientTrendChart({ data }: { data: Array<{ label: string; value: number }> }) {
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

function Patients({
  patients,
  totalCount,
  page,
  onPageChange,
  onSaved,
}: {
  patients: Patient[]
  totalCount: number
  page: number
  onPageChange: (page: number) => void
  onSaved: () => Promise<void>
}) {
  const [form, setForm] = useState({ first_name: '', last_name: '', gender: 'female', date_of_birth: '', phone: '', address: '', guardian_name: '' })
  const [editingId, setEditingId] = useState<number | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await apiFetch<Patient>(editingId ? `/patients/${editingId}/` : '/patients/', {
      method: editingId ? 'PATCH' : 'POST',
      body: JSON.stringify({ ...form, date_of_birth: form.date_of_birth || null }),
    })
    setForm({ first_name: '', last_name: '', gender: 'female', date_of_birth: '', phone: '', address: '', guardian_name: '' })
    setEditingId(null)
    await onSaved()
  }

  async function deletePatient(patientId: number) {
    await apiFetch(`/patients/${patientId}/`, { method: 'DELETE' })
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
          <div className="md:col-span-4 flex gap-2">
            <button className={buttonClassName}>{editingId ? 'Update patient' : 'Register patient'}</button>
            {editingId ? <button className={ghostButtonClassName} type="button" onClick={() => { setEditingId(null); setForm({ first_name: '', last_name: '', gender: 'female', date_of_birth: '', phone: '', address: '', guardian_name: '' }) }}>Cancel</button> : null}
          </div>
        </form>
      </Panel>
      <Panel>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-zinc-200"><th className="py-2 font-semibold">Reg no.</th><th className="py-2 font-semibold">Name</th><th className="py-2 font-semibold">Age</th><th className="py-2 font-semibold">Gender</th><th className="py-2 font-semibold">Phone</th><th className="py-2 font-semibold">Action</th></tr></thead>
            <tbody>
              {patients.map((patient) => (
                <tr key={patient.id} className="border-b border-zinc-100">
                  <td className="py-2">{patient.registration_number}</td>
                  <td className="py-2">{patient.first_name} {patient.last_name}</td>
                  <td className="py-2">{patient.age?.toString() ?? ''}</td>
                  <td className="py-2">{patient.gender}</td>
                  <td className="py-2">{patient.phone}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button className={ghostButtonClassName} onClick={() => { setEditingId(patient.id); setForm({ first_name: patient.first_name, last_name: patient.last_name, gender: patient.gender, date_of_birth: patient.date_of_birth ?? '', phone: patient.phone, address: patient.address, guardian_name: patient.guardian_name }) }}>Edit</button>
                      <button className={ghostButtonClassName} onClick={() => void deletePatient(patient.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls page={page} totalCount={totalCount} onPageChange={onPageChange} />
      </Panel>
    </>
  )
}

function Payments({
  payments,
  totalCount,
  page,
  onPageChange,
  onCreated,
  onSaved,
  onPrint,
}: {
  payments: Payment[]
  totalCount: number
  page: number
  onPageChange: (page: number) => void
  onCreated: (payment: Payment) => void
  onSaved: () => Promise<void>
  onPrint: (payment: Payment) => void
}) {
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

  const departmentIsFree = isFreeDepartment(form.department)
  const effectivePaymentType: Payment['payment_type'] = departmentIsFree ? 'free' : form.payment_type
  const doctorFee = departmentIsFree ? 0 : parseAmount(form.doctor_fee)
  const discountPercent = effectivePaymentType === 'discount' ? Math.min(100, Math.max(0, parseAmount(form.discount_percentage))) : effectivePaymentType === 'free' ? 100 : 0
  const discountAmount = doctorFee * (discountPercent / 100)
  const paymentAmount = Math.max(0, doctorFee - discountAmount)

  function choosePaymentType(paymentType: Payment['payment_type']) {
    if (departmentIsFree) {
      return
    }
    setForm({
      ...form,
      payment_type: paymentType,
      discount_percentage: paymentType === 'discount' ? form.discount_percentage : '',
    })
  }

  useEffect(() => {
    if (!departmentIsFree) return
    if (form.payment_type === 'free' && (form.doctor_fee === '' || form.doctor_fee === '0' || form.doctor_fee === '0.00') && form.discount_percentage === '') return
    setForm((current) => ({
      ...current,
      doctor_fee: '0',
      payment_type: 'free',
      discount_percentage: '',
    }))
  }, [departmentIsFree, form.discount_percentage, form.doctor_fee, form.payment_type])

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
            payment_type: effectivePaymentType,
            discount_percentage: effectivePaymentType === 'discount' ? form.discount_percentage || '0' : '0',
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
            <select
              className={inputClassName}
              value={form.department}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  department: e.target.value,
                  payment_type: isFreeDepartment(e.target.value) ? 'free' : (isFreeDepartment(current.department) ? 'full' : current.payment_type),
                }))
              }
            >
              {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </Field>
          <Field label="Doctor fee">
            <input className={inputClassName} type="number" min="0" step="0.01" value={departmentIsFree ? '0.00' : form.doctor_fee} onChange={(e) => setForm({ ...form, doctor_fee: e.target.value })} disabled={departmentIsFree} required={!departmentIsFree} />
          </Field>
          <div className="md:col-span-4">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Payment option</span>
            <div className="flex flex-wrap gap-3 rounded border border-sky-200 bg-white px-3 py-2 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={effectivePaymentType === 'full'} onChange={() => choosePaymentType('full')} disabled={departmentIsFree} /> Full payment</label>
              <label className="flex items-center gap-2"><input type="radio" checked={effectivePaymentType === 'free'} onChange={() => choosePaymentType('free')} /> Free</label>
              <label className="flex items-center gap-2"><input type="radio" checked={effectivePaymentType === 'discount'} onChange={() => choosePaymentType('discount')} disabled={departmentIsFree} /> Discount percentage</label>
            </div>
            {departmentIsFree ? <p className="mt-2 text-xs text-emerald-700">Vaccination and Malnutrition registrations are always free of charge.</p> : null}
          </div>
          {effectivePaymentType === 'discount' ? (
            <Field label="Discount percentage">
              <input className={inputClassName} type="number" min="0" max="100" step="0.01" value={form.discount_percentage} onChange={(e) => setForm({ ...form, discount_percentage: e.target.value })} placeholder="Type 20 for 20%" required />
            </Field>
          ) : null}
          <Field label="Notes"><input className={inputClassName} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="grid gap-2 rounded border border-pink-100 bg-pink-50 p-3 text-sm md:col-span-4 md:grid-cols-3">
            <p><strong>Doctor fee:</strong> {formatMoney(doctorFee)}</p>
            <p><strong>Payment option:</strong> {effectivePaymentType === 'free' ? 'Free' : effectivePaymentType === 'discount' ? `${formatPercent(discountPercent)}% discount (${formatMoney(discountAmount)})` : 'Full payment'}</p>
            <p><strong>Amount after discount:</strong> {effectivePaymentType === 'free' ? 'Free' : formatMoney(paymentAmount)}</p>
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
        <PaginationControls page={page} totalCount={totalCount} onPageChange={onPageChange} />
      </Panel>
    </>
  )
}

function SearchCombo<T extends { id: number }>({
  label,
  placeholder,
  searchPath,
  extraParams,
  selectedLabel,
  onInputChange,
  renderOption,
  onSelect,
}: {
  label: string
  placeholder: string
  searchPath: string
  extraParams?: string
  selectedLabel?: string
  onInputChange?: (value: string) => void
  renderOption: (item: T) => string
  onSelect: (item: T) => void
}) {
  const [query, setQuery] = useState(selectedLabel ?? '')
  const [items, setItems] = useState<T[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof selectedLabel === 'string') {
      setQuery(selectedLabel)
    }
  }, [selectedLabel])

  const loadOptions = useCallback(async (offset: number, replace = false, search = query) => {
    setLoading(true)
    try {
      const suffix = extraParams ? `&${extraParams}` : ''
      const response = await apiFetch<SearchResponse<T>>(`${searchPath}?q=${encodeURIComponent(search)}&offset=${offset}${suffix}`)
      setItems((current) => replace ? response.results : [...current, ...response.results])
      setNextOffset(response.next_offset)
    } finally {
      setLoading(false)
    }
  }, [extraParams, query, searchPath])

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
        <input
          className={inputClassName}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            onInputChange?.(event.target.value)
          }}
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

function MonthMultiSelect({
  value,
  onChange,
}: {
  value: string[]
  onChange: (months: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

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

  function toggleMonth(month: string) {
    if (value.includes(month)) {
      onChange(value.filter((item) => item !== month))
      return
    }
    onChange([...value, month])
  }

  return (
    <div ref={rootRef} className="relative">
      <Field label="Salary month(s)">
        <button type="button" className={`${inputClassName} text-left`} onClick={() => setOpen((current) => !current)}>
          {value.length ? value.join(', ') : 'Select Afghan months'}
        </button>
      </Field>
      {open ? (
        <div className="absolute z-20 mt-1 w-full rounded border border-sky-100 bg-white p-2 shadow-lg shadow-sky-100">
          <div className="grid gap-2 sm:grid-cols-2">
            {afghanMonthOptions.map((month) => (
              <label key={month} className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-sky-50">
                <input type="checkbox" checked={value.includes(month)} onChange={() => toggleMonth(month)} />
                <span>{month}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ExpensesSection() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ name: '', category: '', amount: '', description: '' })
  const [categoryInput, setCategoryInput] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [deferredSearch])

  const loadExpenses = useCallback(async (currentPage = page, currentSearch = deferredSearch) => {
    try {
      const response = await apiFetch<PaginatedResponse<Expense>>(`/expenses/?page=${currentPage}&q=${encodeURIComponent(currentSearch)}`)
      setExpenses(response.results)
      setTotalCount(response.count)
      setError('')
    } catch {
      setError('Unable to load expenses.')
    }
  }, [deferredSearch, page])

  useEffect(() => {
    void loadExpenses(page, deferredSearch)
  }, [deferredSearch, loadExpenses, page])

  function resetForm() {
    setEditingId(null)
    setForm({ name: '', category: '', amount: '', description: '' })
    setCategoryInput('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!form.category.trim()) {
      setError('Select an expense category from the list.')
      return
    }
    setSubmitting(true)
    try {
      await apiFetch<Expense>(editingId ? `/expenses/${editingId}/` : '/expenses/', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category.trim(),
          amount: form.amount,
          description: form.description.trim(),
        }),
      })
      setNotice(editingId ? 'Expense updated.' : 'Expense created.')
      resetForm()
      await loadExpenses(page, deferredSearch)
    } catch (caught) {
      setError(describeApiError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteExpense(expenseId: number) {
    setError('')
    setNotice('')
    try {
      await apiFetch(`/expenses/${expenseId}/`, { method: 'DELETE' })
      setNotice('Expense deleted.')
      await loadExpenses(page, deferredSearch)
    } catch (caught) {
      setError(describeApiError(caught))
    }
  }

  function startEdit(expense: Expense) {
    setEditingId(expense.id)
    setForm({
      name: expense.name,
      category: expense.category,
      amount: expense.amount,
      description: expense.description,
    })
    setCategoryInput(expense.category)
    setError('')
    setNotice('')
  }

  return (
    <>
      <SectionHeader title="Expenses" subtitle="Record clinic operating expenses with a searchable category list, then review, edit, or delete them." />
      <div className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
        <Panel>
          <form onSubmit={submit} className="grid gap-3">
            {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            {notice ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}
            <Field label="Name of expense">
              <input
                className={inputClassName}
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Type the expense name"
                required
              />
            </Field>
            <SearchCombo<ExpenseCategoryOption>
              label="Category of expense"
              placeholder="Search expense category"
              searchPath="/expenses/categories/"
              selectedLabel={categoryInput}
              onInputChange={(value) => {
                setCategoryInput(value)
                if (value !== form.category) {
                  setForm((current) => ({ ...current, category: '' }))
                }
              }}
              renderOption={(category) => category.name}
              onSelect={(category) => {
                setCategoryInput(category.name)
                setForm((current) => ({ ...current, category: category.name }))
              }}
            />
            <Field label="Amount of expense">
              <input
                className={inputClassName}
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                placeholder="Type amount in AFN"
                required
              />
            </Field>
            <p className="text-sm font-medium text-red-600">The amount must be written in Afghani currency.</p>
            <Field label="Description">
              <textarea
                className={`${inputClassName} min-h-28`}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Optional details about this expense"
              />
            </Field>
            <div className="rounded border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-slate-700">
              <strong>Selected category:</strong> {form.category || 'Choose one category from the searchable list.'}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={buttonClassName} disabled={submitting}>{submitting ? 'Saving...' : editingId ? 'Update expense' : 'Create expense'}</button>
              {editingId ? <button className={ghostButtonClassName} type="button" onClick={resetForm}>Cancel</button> : null}
            </div>
          </form>
        </Panel>

        <Panel>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Expense records</p>
              <p className="text-sm text-zinc-600">Search by expense name, category, or description.</p>
            </div>
            <button className={ghostButtonClassName} type="button" onClick={() => void loadExpenses(page, deferredSearch)}>Refresh</button>
          </div>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_12rem]">
            <Field label="Search expenses">
              <input
                className={inputClassName}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search expense name or category"
              />
            </Field>
            <div className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-700">
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Total records</span>
              <span className="mt-1 block text-2xl font-semibold text-slate-950">{totalCount}</span>
            </div>
          </div>
          <div className="grid gap-3">
            {expenses.map((expense) => (
              <div key={expense.id} className="rounded border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{expense.name}</p>
                    <p className="text-sm font-medium text-sky-700">{expense.category}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatAfn(expense.amount)}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{new Date(expense.created_at).toLocaleString()}</p>
                  </div>
                  <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                    {expense.salary_payment ? 'Generated from salary settlement' : expense.salary_advance ? 'Generated from salary advance' : (expense.created_by_name || 'Reception')}
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-700">{expense.description || 'No description provided.'}</p>
                {expense.salary_payment || expense.salary_advance ? (
                  <p className="mt-4 text-sm font-medium text-amber-700">This expense is controlled by the Salaries section.</p>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className={ghostButtonClassName} type="button" onClick={() => startEdit(expense)}>Edit</button>
                    <button className={ghostButtonClassName} type="button" onClick={() => void deleteExpense(expense.id)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
            {!expenses.length ? <div className="rounded border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">No expenses found.</div> : null}
          </div>
          <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
        </Panel>
      </div>
    </>
  )
}

function SalariesSection() {
  const [salaryAdvances, setSalaryAdvances] = useState<SalaryAdvance[]>([])
  const [advancesCount, setAdvancesCount] = useState(0)
  const [advancesPage, setAdvancesPage] = useState(1)
  const [advancesSearch, setAdvancesSearch] = useState('')
  const deferredAdvancesSearch = useDeferredValue(advancesSearch)
  const [advanceEditingId, setAdvanceEditingId] = useState<number | null>(null)
  const [selectedAdvanceEmployee, setSelectedAdvanceEmployee] = useState<EmployeeSearchOption | null>(null)
  const [advanceEmployeeInput, setAdvanceEmployeeInput] = useState('')
  const [advanceForm, setAdvanceForm] = useState({ employee: '', amount: '', notes: '' })
  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSearchOption | null>(null)
  const [employeeInput, setEmployeeInput] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [currentAfghanYear, setCurrentAfghanYear] = useState<number | null>(null)
  const [currentAfghanMonth, setCurrentAfghanMonth] = useState('')
  const [outstandingAdvanceTotal, setOutstandingAdvanceTotal] = useState(0)
  const [outstandingAdvanceCount, setOutstandingAdvanceCount] = useState(0)
  const [form, setForm] = useState({
    employee: '',
    months: [] as string[],
    absence_days: '0',
    notes: '',
  })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [advanceSubmitting, setAdvanceSubmitting] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [deferredSearch])

  useEffect(() => {
    setAdvancesPage(1)
  }, [deferredAdvancesSearch])

  useEffect(() => {
    let ignore = false
    async function loadMeta() {
      try {
        const response = await apiFetch<{ current_afghan_year: number; current_afghan_month: string }>('/salaries/meta/')
        if (!ignore) {
          setCurrentAfghanYear(response.current_afghan_year)
          setCurrentAfghanMonth(response.current_afghan_month)
        }
      } catch {
        if (!ignore) {
          setCurrentAfghanYear(null)
          setCurrentAfghanMonth('')
        }
      }
    }
    void loadMeta()
    return () => {
      ignore = true
    }
  }, [])

  const loadSalaryAdvances = useCallback(async (currentPage = advancesPage, currentSearch = deferredAdvancesSearch) => {
    try {
      const response = await apiFetch<PaginatedResponse<SalaryAdvance>>(`/salary-advances/?page=${currentPage}&q=${encodeURIComponent(currentSearch)}`)
      setSalaryAdvances(response.results)
      setAdvancesCount(response.count)
      setError('')
    } catch {
      setError('Unable to load salary advances.')
    }
  }, [advancesPage, deferredAdvancesSearch])

  const loadSalaryPayments = useCallback(async (currentPage = page, currentSearch = deferredSearch) => {
    try {
      const response = await apiFetch<PaginatedResponse<SalaryPayment>>(`/salaries/?page=${currentPage}&q=${encodeURIComponent(currentSearch)}`)
      setSalaryPayments(response.results)
      setTotalCount(response.count)
      setError('')
    } catch {
      setError('Unable to load salary payments.')
    }
  }, [deferredSearch, page])

  useEffect(() => {
    void loadSalaryPayments(page, deferredSearch)
  }, [deferredSearch, loadSalaryPayments, page])

  useEffect(() => {
    void loadSalaryAdvances(advancesPage, deferredAdvancesSearch)
  }, [advancesPage, deferredAdvancesSearch, loadSalaryAdvances])

  const loadAdvanceSummary = useCallback(async (employeeId: string, excludeSalaryPaymentId?: number | null) => {
    if (!employeeId) {
      setOutstandingAdvanceTotal(0)
      setOutstandingAdvanceCount(0)
      return
    }
    try {
      const params = new URLSearchParams({ employee: employeeId })
      if (excludeSalaryPaymentId) params.set('exclude_salary_payment', String(excludeSalaryPaymentId))
      const response = await apiFetch<{ total_outstanding: string; count: number }>(`/salary-advances/summary/?${params.toString()}`)
      setOutstandingAdvanceTotal(Number(response.total_outstanding || 0))
      setOutstandingAdvanceCount(response.count)
    } catch {
      setOutstandingAdvanceTotal(0)
      setOutstandingAdvanceCount(0)
    }
  }, [])

  function resetForm() {
    setSelectedEmployee(null)
    setEmployeeInput('')
    setEditingId(null)
    setForm({
      employee: '',
      months: [],
      absence_days: '0',
      notes: '',
    })
    setOutstandingAdvanceTotal(0)
    setOutstandingAdvanceCount(0)
  }

  function resetAdvanceForm() {
    setSelectedAdvanceEmployee(null)
    setAdvanceEmployeeInput('')
    setAdvanceEditingId(null)
    setAdvanceForm({ employee: '', amount: '', notes: '' })
  }

  const monthlySalary = parseAmount(selectedEmployee?.salary ?? '0')
  const monthCount = form.months.length
  const grossSalary = monthlySalary * monthCount
  const dailySalary = monthlySalary / 30
  const absenceDays = Math.max(0, parseAmount(form.absence_days))
  const absenceDeduction = Math.min(grossSalary, dailySalary * absenceDays)
  const taxableSalary = Math.max(0, grossSalary - absenceDeduction)
  const averageMonthlyTaxableSalary = monthCount > 0 ? taxableSalary / monthCount : 0
  const taxAmount = monthCount > 0 ? calculateAfghanistanSalaryTax(averageMonthlyTaxableSalary) * monthCount : 0
  const netSalary = Math.max(0, taxableSalary - taxAmount)
  const advanceDeduction = Math.min(netSalary, outstandingAdvanceTotal)
  const carriedAdvanceBalance = Math.max(0, outstandingAdvanceTotal - advanceDeduction)
  const payableAmount = Math.max(0, netSalary - advanceDeduction)

  async function submitAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!advanceForm.employee) {
      setError('Select an employee for the salary advance.')
      return
    }
    setAdvanceSubmitting(true)
    try {
      await apiFetch<SalaryAdvance>(advanceEditingId ? `/salary-advances/${advanceEditingId}/` : '/salary-advances/', {
        method: advanceEditingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          employee: Number(advanceForm.employee),
          amount: advanceForm.amount,
          notes: advanceForm.notes,
        }),
      })
      setNotice(advanceEditingId ? 'Salary advance updated.' : 'Salary advance recorded.')
      resetAdvanceForm()
      await loadSalaryAdvances(advancesPage, deferredAdvancesSearch)
      if (form.employee) {
        await loadAdvanceSummary(form.employee, editingId)
      }
    } catch (caught) {
      setError(describeApiError(caught))
    } finally {
      setAdvanceSubmitting(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!form.employee) {
      setError('Select an employee first.')
      return
    }
    if (!form.months.length) {
      setError('Select at least one Afghan month.')
      return
    }
    setSubmitting(true)
    try {
      await apiFetch<SalaryPayment>(editingId ? `/salaries/${editingId}/` : '/salaries/', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          employee: Number(form.employee),
          months: form.months,
          absence_days: Number(form.absence_days || '0'),
          notes: form.notes,
        }),
      })
      setNotice(editingId ? 'Salary payment updated.' : 'Salary payment recorded.')
      resetForm()
      await loadSalaryPayments(page, deferredSearch)
      await loadSalaryAdvances(advancesPage, deferredAdvancesSearch)
    } catch (caught) {
      setError(describeApiError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteSalaryAdvance(salaryAdvanceId: number) {
    setError('')
    setNotice('')
    try {
      await apiFetch(`/salary-advances/${salaryAdvanceId}/`, { method: 'DELETE' })
      setNotice('Salary advance deleted.')
      await loadSalaryAdvances(advancesPage, deferredAdvancesSearch)
      if (form.employee) {
        await loadAdvanceSummary(form.employee, editingId)
      }
    } catch (caught) {
      setError(describeApiError(caught))
    }
  }

  async function deleteSalaryPayment(salaryPaymentId: number) {
    setError('')
    setNotice('')
    try {
      await apiFetch(`/salaries/${salaryPaymentId}/`, { method: 'DELETE' })
      setNotice('Salary payment deleted.')
      await loadSalaryPayments(page, deferredSearch)
      await loadSalaryAdvances(advancesPage, deferredAdvancesSearch)
      if (form.employee) {
        await loadAdvanceSummary(form.employee, editingId)
      }
    } catch (caught) {
      setError(describeApiError(caught))
    }
  }

  function startEditAdvance(salaryAdvance: SalaryAdvance) {
    setAdvanceEditingId(salaryAdvance.id)
    const names = salaryAdvance.employee_name.split(' ')
    setSelectedAdvanceEmployee({
      id: salaryAdvance.employee,
      first_name: names[0] || salaryAdvance.employee_name,
      last_name: names.slice(1).join(' '),
      position: salaryAdvance.employee_position,
      salary: '0',
    })
    setAdvanceEmployeeInput(`${salaryAdvance.employee_name} - ${salaryAdvance.employee_position}`)
    setAdvanceForm({
      employee: String(salaryAdvance.employee),
      amount: salaryAdvance.amount,
      notes: salaryAdvance.notes,
    })
    setError('')
    setNotice('')
  }

  function startEdit(salaryPayment: SalaryPayment) {
    setEditingId(salaryPayment.id)
    const names = salaryPayment.employee_name.split(' ')
    setSelectedEmployee({
      id: salaryPayment.employee,
      first_name: names[0] || salaryPayment.employee_name,
      last_name: names.slice(1).join(' '),
      position: salaryPayment.employee_position,
      salary: salaryPayment.monthly_salary,
    })
    setEmployeeInput(`${salaryPayment.employee_name} - ${salaryPayment.employee_position} - ${formatAfn(salaryPayment.monthly_salary)}`)
    setForm({
      employee: String(salaryPayment.employee),
      months: salaryPayment.months,
      absence_days: String(salaryPayment.absence_days),
      notes: salaryPayment.notes,
    })
    void loadAdvanceSummary(String(salaryPayment.employee), salaryPayment.id)
    setError('')
    setNotice('')
  }

  return (
    <>
      <SectionHeader title="Salaries" subtitle="Manage salary advances separately from end-of-month salary settlement. The current Afghan year is automatic, advances become expenses immediately, and salary settlement deducts outstanding advances professionally." />
      <div className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
        <Panel>
          <form onSubmit={submitAdvance} className="grid gap-3">
            {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            {notice ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Salary advance</p>
                <p className="text-sm text-zinc-600">Use this when an employee receives money before month-end settlement.</p>
              </div>
              <div className="rounded border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-slate-700">
                <strong>Current Afghan period:</strong> {currentAfghanYear ?? '...'} {currentAfghanMonth}
              </div>
            </div>
            <SearchCombo<EmployeeSearchOption>
              label="Employee"
              placeholder="Search employee name or position"
              searchPath="/auth/employees/search/"
              selectedLabel={advanceEmployeeInput}
              onInputChange={(value) => {
                setAdvanceEmployeeInput(value)
                if (value !== `${selectedAdvanceEmployee?.first_name ?? ''} ${selectedAdvanceEmployee?.last_name ?? ''}`.trim()) {
                  setSelectedAdvanceEmployee(null)
                  setAdvanceForm((current) => ({ ...current, employee: '' }))
                }
              }}
              renderOption={(employee) => `${employee.first_name} ${employee.last_name} - ${employee.position} - ${formatAfn(employee.salary)}`}
              onSelect={(employee) => {
                setSelectedAdvanceEmployee(employee)
                setAdvanceEmployeeInput(`${employee.first_name} ${employee.last_name} - ${employee.position} - ${formatAfn(employee.salary)}`)
                setAdvanceForm((current) => ({ ...current, employee: String(employee.id) }))
              }}
            />
            <Field label="Advance amount">
              <input className={inputClassName} type="number" min="0.01" step="0.01" value={advanceForm.amount} onChange={(event) => setAdvanceForm((current) => ({ ...current, amount: event.target.value }))} required />
            </Field>
            <Field label="Advance note">
              <textarea className={`${inputClassName} min-h-24`} value={advanceForm.notes} onChange={(event) => setAdvanceForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Reason or note for this advance" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button className={buttonClassName} disabled={advanceSubmitting}>{advanceSubmitting ? 'Saving...' : advanceEditingId ? 'Update salary advance' : 'Record salary advance'}</button>
              {advanceEditingId ? <button className={ghostButtonClassName} type="button" onClick={resetAdvanceForm}>Cancel</button> : null}
            </div>
          </form>
        </Panel>

        <Panel>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Salary advance records</p>
              <p className="text-sm text-zinc-600">Outstanding balances stay open until they are deducted in salary settlement.</p>
            </div>
            <button className={ghostButtonClassName} type="button" onClick={() => void loadSalaryAdvances(advancesPage, deferredAdvancesSearch)}>Refresh</button>
          </div>
          <Field label="Search salary advances">
            <input className={inputClassName} value={advancesSearch} onChange={(event) => setAdvancesSearch(event.target.value)} placeholder="Search employee, month, or year" />
          </Field>
          <div className="mt-4 grid gap-3">
            {salaryAdvances.map((salaryAdvance) => (
              <div key={salaryAdvance.id} className="rounded border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{salaryAdvance.employee_name}</p>
                    <p className="text-sm text-slate-500">{salaryAdvance.employee_position}</p>
                    <p className="mt-2 text-sm font-medium text-sky-700">Year {salaryAdvance.afghan_year} | {salaryAdvance.afghan_month}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{new Date(salaryAdvance.created_at).toLocaleString()}</p>
                  </div>
                  <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                    Advance {formatAfn(salaryAdvance.amount)}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                  <p><strong>Settled:</strong> {formatAfn(salaryAdvance.settled_amount)}</p>
                  <p><strong>Outstanding:</strong> {formatAfn(salaryAdvance.outstanding_amount)}</p>
                </div>
                {salaryAdvance.notes ? <p className="mt-3 text-sm text-slate-700">{salaryAdvance.notes}</p> : null}
                {Number(salaryAdvance.outstanding_amount || 0) > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className={ghostButtonClassName} type="button" onClick={() => startEditAdvance(salaryAdvance)}>Edit</button>
                    <button className={ghostButtonClassName} type="button" onClick={() => void deleteSalaryAdvance(salaryAdvance.id)}>Delete</button>
                  </div>
                ) : (
                  <p className="mt-4 text-sm font-medium text-amber-700">This advance is already settled and is locked.</p>
                )}
              </div>
            ))}
            {!salaryAdvances.length ? <div className="rounded border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">No salary advances found.</div> : null}
          </div>
          <PaginationControls page={advancesPage} totalCount={advancesCount} onPageChange={setAdvancesPage} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
        <Panel>
          <form onSubmit={submit} className="grid gap-3">
            {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            {notice ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Salary settlement</p>
                <p className="text-sm text-zinc-600">Use this at month-end. Outstanding salary advances are deducted automatically.</p>
              </div>
              <div className="rounded border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-slate-700">
                <strong>Current Afghan year:</strong> {currentAfghanYear ?? '...'}
              </div>
            </div>
            <SearchCombo<EmployeeSearchOption>
              label="Employee"
              placeholder="Search employee name or position"
              searchPath="/auth/employees/search/"
              selectedLabel={employeeInput}
              onInputChange={(value) => {
                setEmployeeInput(value)
                if (value !== `${selectedEmployee?.first_name ?? ''} ${selectedEmployee?.last_name ?? ''}`.trim()) {
                  setSelectedEmployee(null)
                  setForm((current) => ({ ...current, employee: '' }))
                  setOutstandingAdvanceTotal(0)
                  setOutstandingAdvanceCount(0)
                }
              }}
              renderOption={(employee) => `${employee.first_name} ${employee.last_name} - ${employee.position} - ${formatAfn(employee.salary)}`}
              onSelect={(employee) => {
                setSelectedEmployee(employee)
                setEmployeeInput(`${employee.first_name} ${employee.last_name} - ${employee.position} - ${formatAfn(employee.salary)}`)
                setForm((current) => ({ ...current, employee: String(employee.id) }))
                void loadAdvanceSummary(String(employee.id), editingId)
              }}
            />
            <MonthMultiSelect value={form.months} onChange={(months) => setForm((current) => ({ ...current, months }))} />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Days absence">
                <input
                  className={inputClassName}
                  type="number"
                  min="0"
                  step="1"
                  value={form.absence_days}
                  onChange={(event) => setForm((current) => ({ ...current, absence_days: event.target.value }))}
                />
              </Field>
              <div className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-700">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Outstanding advances</span>
                <span className="mt-1 block text-2xl font-semibold text-slate-950">{formatAfn(outstandingAdvanceTotal)}</span>
                <span className="mt-1 block text-xs text-zinc-500">{outstandingAdvanceCount} open advance record(s)</span>
              </div>
            </div>
            <Field label="Notes">
              <textarea className={`${inputClassName} min-h-24`} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional salary note" />
            </Field>
            <div className="grid gap-2 rounded border border-sky-100 bg-sky-50 p-3 text-sm text-slate-700">
              <p><strong>Monthly salary:</strong> {formatAfn(monthlySalary)}</p>
              <p><strong>Gross salary for selected months:</strong> {formatAfn(grossSalary)}</p>
              <p><strong>Absence deduction:</strong> {formatAfn(absenceDeduction)}</p>
              <p><strong>Taxable salary:</strong> {formatAfn(taxableSalary)}</p>
              <p><strong>Salary tax:</strong> {formatAfn(taxAmount)}</p>
              <p><strong>Net salary:</strong> {formatAfn(netSalary)}</p>
              <p><strong>Advance deduction this settlement:</strong> {formatAfn(advanceDeduction)}</p>
              <p><strong>Advance balance carried forward:</strong> {formatAfn(carriedAdvanceBalance)}</p>
              <p><strong>Payable at month end:</strong> {formatAfn(payableAmount)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={buttonClassName} disabled={submitting}>{submitting ? 'Saving...' : editingId ? 'Update salary payment' : 'Record salary payment'}</button>
              {editingId ? <button className={ghostButtonClassName} type="button" onClick={resetForm}>Cancel</button> : null}
            </div>
          </form>
        </Panel>

        <Panel>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Salary payment records</p>
              <p className="text-sm text-zinc-600">Search by employee, month, year, or note.</p>
            </div>
            <button className={ghostButtonClassName} type="button" onClick={() => void loadSalaryPayments(page, deferredSearch)}>Refresh</button>
          </div>
          <Field label="Search salary payments">
            <input className={inputClassName} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee, month, or year" />
          </Field>
          <div className="mt-4 grid gap-3">
            {salaryPayments.map((salaryPayment) => (
              <div key={salaryPayment.id} className="rounded border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{salaryPayment.employee_name}</p>
                    <p className="text-sm text-slate-500">{salaryPayment.employee_position}</p>
                    <p className="mt-2 text-sm font-medium text-sky-700">Year {salaryPayment.afghan_year} | {salaryPayment.months.join(', ')}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{new Date(salaryPayment.created_at).toLocaleString()}</p>
                  </div>
                  <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                    Payable {formatAfn(salaryPayment.payable_amount)}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                  <p><strong>Gross:</strong> {formatAfn(salaryPayment.gross_salary)}</p>
                  <p><strong>Absence deduction:</strong> {formatAfn(salaryPayment.absence_deduction)}</p>
                  <p><strong>Tax:</strong> {formatAfn(salaryPayment.tax_amount)}</p>
                  <p><strong>Advance deduction:</strong> {formatAfn(salaryPayment.advance_payment)}</p>
                  <p><strong>Advance carry forward:</strong> {formatAfn(salaryPayment.advance_balance_carried)}</p>
                  <p><strong>Net salary:</strong> {formatAfn(salaryPayment.net_salary)}</p>
                  <p><strong>Days absence:</strong> {salaryPayment.absence_days}</p>
                </div>
                {salaryPayment.notes ? <p className="mt-3 text-sm text-slate-700">{salaryPayment.notes}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={ghostButtonClassName} type="button" onClick={() => startEdit(salaryPayment)}>Edit</button>
                  <button className={ghostButtonClassName} type="button" onClick={() => void deleteSalaryPayment(salaryPayment.id)}>Delete</button>
                </div>
              </div>
            ))}
            {!salaryPayments.length ? <div className="rounded border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">No salary payments found.</div> : null}
          </div>
          <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
        </Panel>
      </div>
    </>
  )
}

function DoctorDocuments({
  role,
  documents,
  totalCount,
  page,
  onPageChange,
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  documentTypes,
  onCreated,
  onPrint,
}: {
  role?: string
  documents: ClinicalDocument[]
  totalCount: number
  page: number
  onPageChange: (page: number) => void
  search: string
  onSearchChange: (value: string) => void
  typeFilter: 'all' | 'prescription' | 'lab_order'
  onTypeFilterChange: (value: 'all' | 'prescription' | 'lab_order') => void
  documentTypes: DocumentTypeDefinition[]
  onCreated: (document: ClinicalDocument) => void
  onPrint: (document: ClinicalDocument) => void
}) {
  const title = role === 'super_admin' ? 'Clinical documents' : role === 'gynecologist' ? 'Gynecologist documents' : 'Doctor documents'
  const subtitle = role === 'gynecologist'
    ? 'Search patient, create prescriptions or lab test orders, and print half-A4 documents.'
    : 'Search patient, create prescriptions or lab test orders, and print half-A4 documents.'
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
    setLabOrderItems((current) => current.some((item) => item.test === test.id) ? current : [...current, { test: test.id, test_name: test.display_name || test.name }])
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
      <SectionHeader title={title} subtitle={subtitle} />
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

          <button className={buttonClassName} disabled={submitting}>{submitting ? 'Creating...' : 'Create and preview printable document'}</button>
        </form>
      </Panel>
      <Panel>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_15rem]">
          <Field label="Search documents">
            <input className={inputClassName} value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search patient or document title" />
          </Field>
          <Field label="Filter by type">
            <select className={inputClassName} value={typeFilter} onChange={(event) => onTypeFilterChange(event.target.value as 'all' | 'prescription' | 'lab_order')}>
              <option value="all">All documents</option>
              <option value="prescription">Prescriptions</option>
              <option value="lab_order">Laboratory orders</option>
            </select>
          </Field>
        </div>
        <div className="grid gap-2">
          {documents.filter((document) => document.document_type === 'prescription' || document.document_type === 'lab_order').map((document) => (
            <button key={document.id} className="rounded border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => onPrint(document)}>
              <span className="font-medium">{document.document_type_label}</span> for {document.patient_name} - {document.title}
            </button>
          ))}
        </div>
        <PaginationControls page={page} totalCount={totalCount} onPageChange={onPageChange} />
      </Panel>
    </>
  )
}

function gynecologyPatientStatusLabel(value: string): string {
  return value === 'follow_up' ? 'Follow-up' : 'New'
}

function gynecologyReportTypeLabel(value: string): string {
  return value === 'pelvic' ? 'Pelvic gynecologic' : 'Obstetric'
}

function gynecologyUltrasoundFormFromDocument(document: ClinicalDocument): GynecologyUltrasoundFormState {
  const payload = document.payload as Record<string, unknown>
  return {
    patient_status: payload.patient_status === 'follow_up' ? 'follow_up' : 'new',
    report_type: payload.report_type === 'pelvic' ? 'pelvic' : 'obstetric',
    indication: typeof payload.indication === 'string' ? payload.indication : '',
    lmp: typeof payload.lmp === 'string' ? payload.lmp : '',
    gestational_age_weeks: typeof payload.gestational_age_weeks === 'string' ? payload.gestational_age_weeks : '',
    estimated_due_date: typeof payload.estimated_due_date === 'string' ? payload.estimated_due_date : '',
    fetal_count: typeof payload.fetal_count === 'string' ? payload.fetal_count : 'single',
    fetal_heartbeat: typeof payload.fetal_heartbeat === 'string' ? payload.fetal_heartbeat : 'yes',
    fetal_heart_rate: typeof payload.fetal_heart_rate === 'string' ? payload.fetal_heart_rate : '',
    fetal_movement: typeof payload.fetal_movement === 'string' ? payload.fetal_movement : 'present',
    fetal_presentation: typeof payload.fetal_presentation === 'string' ? payload.fetal_presentation : 'cephalic',
    placenta_position: typeof payload.placenta_position === 'string' ? payload.placenta_position : 'anterior',
    amniotic_fluid: typeof payload.amniotic_fluid === 'string' ? payload.amniotic_fluid : 'normal',
    cervix_status: typeof payload.cervix_status === 'string' ? payload.cervix_status : 'closed',
    biometry_summary: typeof payload.biometry_summary === 'string' ? payload.biometry_summary : '',
    uterus: typeof payload.uterus === 'string' ? payload.uterus : '',
    endometrium: typeof payload.endometrium === 'string' ? payload.endometrium : '',
    right_ovary: typeof payload.right_ovary === 'string' ? payload.right_ovary : '',
    left_ovary: typeof payload.left_ovary === 'string' ? payload.left_ovary : '',
    adnexa: typeof payload.adnexa === 'string' ? payload.adnexa : '',
    cul_de_sac: typeof payload.cul_de_sac === 'string' ? payload.cul_de_sac : '',
    impression: typeof payload.impression === 'string' ? payload.impression : '',
    recommendation: typeof payload.recommendation === 'string' ? payload.recommendation : '',
    notes: typeof payload.notes === 'string' ? payload.notes : '',
  }
}

function GynecologyUltrasoundReports({
  onCreated,
  onPrint,
}: {
  onCreated: (document: ClinicalDocument) => void
  onPrint: (document: ClinicalDocument) => void
}) {
  const [reports, setReports] = useState<ClinicalDocument[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchOption | null>(null)
  const [form, setForm] = useState<GynecologyUltrasoundFormState>(emptyGynecologyUltrasoundForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setPage(1)
  }, [deferredSearch])

  const loadReports = useCallback(async (currentPage = page, currentSearch = deferredSearch) => {
    try {
      const response = await apiFetch<PaginatedResponse<ClinicalDocument>>(`/documents/?document_type=ultrasound&mine=1&gynecology_ultrasound=1&page=${currentPage}&q=${encodeURIComponent(currentSearch)}`)
      setReports(response.results)
      setTotalCount(response.count)
      setError('')
    } catch {
      setError('Unable to load ultrasound reports.')
    }
  }, [deferredSearch, page])

  useEffect(() => {
    void loadReports(page, deferredSearch)
  }, [deferredSearch, loadReports, page])

  function resetForm() {
    setSelectedPatient(null)
    setForm(emptyGynecologyUltrasoundForm)
    setEditingId(null)
    setError('')
    setNotice('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!selectedPatient) {
      setError('Select a female patient first.')
      return
    }
    if (!form.impression.trim()) {
      setError('Write the ultrasound impression before saving.')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        gynecology_ultrasound: true,
        ...form,
      }
      const document = await apiFetch<ClinicalDocument>(editingId ? `/documents/${editingId}/` : '/documents/', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          patient: selectedPatient.id,
          document_type: 'ultrasound',
          title: form.report_type === 'pelvic' ? 'Pelvic gynecologic ultrasound report' : 'Obstetric ultrasound report',
          total_amount: '0',
          payload,
        }),
      })
      const successMessage = editingId ? 'Ultrasound report updated.' : 'Ultrasound report created.'
      resetForm()
      setNotice(successMessage)
      await loadReports(page, deferredSearch)
      onCreated(document)
    } catch (caught) {
      setError(describeApiError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteReport(reportId: number) {
    setError('')
    setNotice('')
    try {
      await apiFetch(`/documents/${reportId}/`, { method: 'DELETE' })
      setNotice('Ultrasound report deleted.')
      await loadReports(page, deferredSearch)
    } catch (caught) {
      setError(describeApiError(caught))
    }
  }

  function startEdit(document: ClinicalDocument) {
    setEditingId(document.id)
    setSelectedPatient({
      id: document.patient,
      registration_number: '',
      first_name: document.patient_name,
      last_name: '',
      age: null,
    })
    setForm(gynecologyUltrasoundFormFromDocument(document))
    setError('')
    setNotice('')
  }

  return (
    <>
      <SectionHeader title="Ultrasound reports" subtitle="Create practical obstetric and pelvic gynecologic ultrasound reports for routine Afghanistan clinic use, then print, edit, or delete them." />
      <Panel>
        <form onSubmit={submit} className="grid gap-4">
          {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {notice ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}
          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
            <SearchCombo<PatientSearchOption>
              label="Patient"
              placeholder="Search female patient name or registration number"
              searchPath="/patients/search/"
              extraParams="gender=female"
              renderOption={(patient) => `${patient.registration_number} - ${patient.first_name} ${patient.last_name}${patient.age ? ` (${patient.age})` : ''}`}
              onSelect={setSelectedPatient}
            />
            <Field label="Patient type">
              <select className={inputClassName} value={form.patient_status} onChange={(event) => setForm({ ...form, patient_status: event.target.value as 'new' | 'follow_up' })}>
                <option value="new">New patient</option>
                <option value="follow_up">Follow-up patient</option>
              </select>
            </Field>
            <Field label="Report type">
              <select className={inputClassName} value={form.report_type} onChange={(event) => setForm({ ...form, report_type: event.target.value as 'obstetric' | 'pelvic' })}>
                <option value="obstetric">Obstetric ultrasound</option>
                <option value="pelvic">Pelvic gynecologic ultrasound</option>
              </select>
            </Field>
          </div>

          {selectedPatient ? (
            <div className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-950">{selectedPatient.first_name} {selectedPatient.last_name}</p>
              {selectedPatient.registration_number ? <p className="mt-1">Registration {selectedPatient.registration_number}</p> : null}
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-3">
            <Field label="Indication">
              <input className={inputClassName} value={form.indication} onChange={(event) => setForm({ ...form, indication: event.target.value })} placeholder="Pain, bleeding, dating, routine follow-up" />
            </Field>
            <Field label="LMP">
              <input className={inputClassName} type="date" value={form.lmp} onChange={(event) => setForm({ ...form, lmp: event.target.value })} />
            </Field>
            {form.report_type === 'obstetric' ? (
              <Field label="Estimated due date">
                <input className={inputClassName} type="date" value={form.estimated_due_date} onChange={(event) => setForm({ ...form, estimated_due_date: event.target.value })} />
              </Field>
            ) : null}
          </div>

          {form.report_type === 'obstetric' ? (
            <div className="grid gap-4 rounded border border-sky-100 bg-slate-50 p-4">
              <h3 className="text-base font-semibold text-slate-950">Obstetric findings</h3>
              <div className="grid gap-3 lg:grid-cols-3">
                <Field label="Gestational age (weeks)">
                  <input className={inputClassName} value={form.gestational_age_weeks} onChange={(event) => setForm({ ...form, gestational_age_weeks: event.target.value })} placeholder="20+4 or 20" />
                </Field>
                <Field label="Fetal count">
                  <select className={inputClassName} value={form.fetal_count} onChange={(event) => setForm({ ...form, fetal_count: event.target.value })}>
                    <option value="single">Single</option>
                    <option value="twin">Twin</option>
                    <option value="multiple">Multiple</option>
                  </select>
                </Field>
                <Field label="Fetal heartbeat">
                  <select className={inputClassName} value={form.fetal_heartbeat} onChange={(event) => setForm({ ...form, fetal_heartbeat: event.target.value })}>
                    <option value="yes">Present</option>
                    <option value="no">Absent</option>
                  </select>
                </Field>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                <Field label="Fetal heart rate">
                  <input className={inputClassName} value={form.fetal_heart_rate} onChange={(event) => setForm({ ...form, fetal_heart_rate: event.target.value })} placeholder="150 bpm" />
                </Field>
                <Field label="Fetal movement">
                  <select className={inputClassName} value={form.fetal_movement} onChange={(event) => setForm({ ...form, fetal_movement: event.target.value })}>
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="not_checked">Not checked</option>
                  </select>
                </Field>
                <Field label="Presentation">
                  <select className={inputClassName} value={form.fetal_presentation} onChange={(event) => setForm({ ...form, fetal_presentation: event.target.value })}>
                    <option value="cephalic">Cephalic</option>
                    <option value="breech">Breech</option>
                    <option value="transverse">Transverse</option>
                    <option value="variable">Variable</option>
                    <option value="not_applicable">Not applicable</option>
                  </select>
                </Field>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                <Field label="Placenta position">
                  <select className={inputClassName} value={form.placenta_position} onChange={(event) => setForm({ ...form, placenta_position: event.target.value })}>
                    <option value="anterior">Anterior</option>
                    <option value="posterior">Posterior</option>
                    <option value="fundal">Fundal</option>
                    <option value="low_lying">Low lying</option>
                    <option value="previa">Previa</option>
                    <option value="not_seen">Not seen clearly</option>
                  </select>
                </Field>
                <Field label="Amniotic fluid">
                  <select className={inputClassName} value={form.amniotic_fluid} onChange={(event) => setForm({ ...form, amniotic_fluid: event.target.value })}>
                    <option value="normal">Normal</option>
                    <option value="reduced">Reduced</option>
                    <option value="increased">Increased</option>
                    <option value="not_checked">Not checked</option>
                  </select>
                </Field>
                <Field label="Cervix">
                  <select className={inputClassName} value={form.cervix_status} onChange={(event) => setForm({ ...form, cervix_status: event.target.value })}>
                    <option value="closed">Closed</option>
                    <option value="open">Open</option>
                    <option value="short">Short</option>
                    <option value="not_checked">Not checked</option>
                  </select>
                </Field>
              </div>
              <Field label="Biometry or growth summary">
                <textarea className={`${inputClassName} min-h-24`} value={form.biometry_summary} onChange={(event) => setForm({ ...form, biometry_summary: event.target.value })} placeholder="CRL/BPD/HC/AC/FL summary, fetal age by scan, growth note" />
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 rounded border border-sky-100 bg-slate-50 p-4">
              <h3 className="text-base font-semibold text-slate-950">Pelvic gynecologic findings</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="Uterus">
                  <textarea className={`${inputClassName} min-h-24`} value={form.uterus} onChange={(event) => setForm({ ...form, uterus: event.target.value })} placeholder="Size, position, myometrium, fibroid if any" />
                </Field>
                <Field label="Endometrium">
                  <textarea className={`${inputClassName} min-h-24`} value={form.endometrium} onChange={(event) => setForm({ ...form, endometrium: event.target.value })} placeholder="Thickness, appearance" />
                </Field>
                <Field label="Right ovary">
                  <textarea className={`${inputClassName} min-h-24`} value={form.right_ovary} onChange={(event) => setForm({ ...form, right_ovary: event.target.value })} placeholder="Size, follicles, cyst, mass" />
                </Field>
                <Field label="Left ovary">
                  <textarea className={`${inputClassName} min-h-24`} value={form.left_ovary} onChange={(event) => setForm({ ...form, left_ovary: event.target.value })} placeholder="Size, follicles, cyst, mass" />
                </Field>
                <Field label="Adnexa">
                  <textarea className={`${inputClassName} min-h-24`} value={form.adnexa} onChange={(event) => setForm({ ...form, adnexa: event.target.value })} placeholder="Adnexal mass or tenderness findings" />
                </Field>
                <Field label="Pouch of Douglas">
                  <textarea className={`${inputClassName} min-h-24`} value={form.cul_de_sac} onChange={(event) => setForm({ ...form, cul_de_sac: event.target.value })} placeholder="Free fluid or no free fluid" />
                </Field>
              </div>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-3">
            <Field label="Impression">
              <textarea className={`${inputClassName} min-h-24`} value={form.impression} onChange={(event) => setForm({ ...form, impression: event.target.value })} placeholder="Single live intrauterine pregnancy..., normal pelvic scan..., placenta previa..." />
            </Field>
            <Field label="Recommendation">
              <textarea className={`${inputClassName} min-h-24`} value={form.recommendation} onChange={(event) => setForm({ ...form, recommendation: event.target.value })} placeholder="Routine ANC follow-up, repeat scan, urgent referral, consult gynecology..." />
            </Field>
            <Field label="Notes">
              <textarea className={`${inputClassName} min-h-24`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Any additional note" />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className={buttonClassName} disabled={submitting} type="submit">{submitting ? 'Saving...' : editingId ? 'Update ultrasound report' : 'Create and preview ultrasound report'}</button>
            <button className={ghostButtonClassName} type="button" onClick={resetForm}>Reset</button>
          </div>
        </form>
      </Panel>

      <Panel>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <SectionHeader title="Recent ultrasound reports" subtitle="Review, print, edit, or delete reports created from this account." />
          <Field label="Search ultrasound reports">
            <input className={inputClassName} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by patient or report" />
          </Field>
        </div>
        <div className="grid gap-3">
          {reports.map((document) => {
            const payload = document.payload as Record<string, unknown>
            return (
              <div key={document.id} className="rounded border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{document.patient_name}</p>
                    <p className="text-sm text-slate-500">{gynecologyReportTypeLabel(String(payload.report_type || 'obstetric'))} | {gynecologyPatientStatusLabel(String(payload.patient_status || 'new'))}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{new Date(document.created_at).toLocaleString()}</p>
                  </div>
                  <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                    {document.title}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                  {payload.report_type === 'obstetric' ? <p><strong>Gestational age:</strong> {String(payload.gestational_age_weeks || 'Not recorded')}</p> : <p><strong>Indication:</strong> {String(payload.indication || 'Not recorded')}</p>}
                  <p><strong>Impression:</strong> {String(payload.impression || 'Not recorded')}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={buttonClassName} onClick={() => onPrint(document)}>Print</button>
                  <button className={ghostButtonClassName} onClick={() => startEdit(document)}>Edit</button>
                  <button className={ghostButtonClassName} onClick={() => void deleteReport(document.id)}>Delete</button>
                </div>
              </div>
            )
          })}
          {!reports.length ? <div className="rounded border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">No ultrasound reports found.</div> : null}
        </div>
        <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
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

function Documents({
  documents,
  totalCount,
  page,
  onPageChange,
  documentTypes,
  onCreated,
  onPrint,
}: {
  documents: ClinicalDocument[]
  totalCount: number
  page: number
  onPageChange: (page: number) => void
  documentTypes: DocumentTypeDefinition[]
  onCreated: (document: ClinicalDocument) => void
  onPrint: (document: ClinicalDocument) => void
}) {
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
            <SearchCombo<PatientSearchOption>
              label="Patient"
              placeholder="Search patient name or registration number"
              searchPath="/patients/search/"
              renderOption={(patient) => `${patient.registration_number} - ${patient.first_name} ${patient.last_name}${patient.age ? ` (${patient.age})` : ''}`}
              onSelect={(patient) => setForm((current) => ({ ...current, patient: String(patient.id) }))}
            />
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
        <PaginationControls page={page} totalCount={totalCount} onPageChange={onPageChange} />
      </Panel>
    </>
  )
}

function MedicineStock({
  medicines,
  totalCount,
  page,
  onPageChange,
  onSaved,
}: {
  medicines: Medicine[]
  totalCount: number
  page: number
  onPageChange: (page: number) => void
  onSaved: () => Promise<void>
}) {
  const [medicine, setMedicine] = useState({ name: '', unit: 'tablet', sale_price: '0', low_stock_threshold: '10' })
  const [editingMedicineId, setEditingMedicineId] = useState<number | null>(null)
  const [movement, setMovement] = useState({ medicine: '', movement_type: 'in', quantity: '0', note: '' })

  async function addMedicine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await apiFetch<Medicine>(editingMedicineId ? `/medicines/${editingMedicineId}/` : '/medicines/', {
      method: editingMedicineId ? 'PATCH' : 'POST',
      body: JSON.stringify(medicine),
    })
    setMedicine({ name: '', unit: 'tablet', sale_price: '0', low_stock_threshold: '10' })
    setEditingMedicineId(null)
    await onSaved()
  }

  async function addMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await apiFetch('/stock-movements/', { method: 'POST', body: JSON.stringify({ ...movement, medicine: Number(movement.medicine), quantity: Number(movement.quantity) }) })
    setMovement({ medicine: '', movement_type: 'in', quantity: '0', note: '' })
    await onSaved()
  }

  async function deleteMedicine(medicineId: number) {
    await apiFetch(`/medicines/${medicineId}/`, { method: 'DELETE' })
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
            <div className="flex gap-2 md:col-span-2">
              <button className={buttonClassName}>{editingMedicineId ? 'Update medicine' : 'Add medicine'}</button>
              {editingMedicineId ? <button className={ghostButtonClassName} type="button" onClick={() => { setEditingMedicineId(null); setMedicine({ name: '', unit: 'tablet', sale_price: '0', low_stock_threshold: '10' }) }}>Cancel</button> : null}
            </div>
          </form>
        </Panel>
        <Panel>
          <form onSubmit={addMovement} className="grid gap-3 md:grid-cols-2">
            <SearchCombo<MedicineSearchOption>
              label="Medicine"
              placeholder="Search medicine"
              searchPath="/medicines/search/"
              renderOption={(item) => `${item.name} (${item.unit}) - stock ${item.current_stock}`}
              onSelect={(item) => setMovement((current) => ({ ...current, medicine: String(item.id) }))}
            />
            <Field label="Movement"><select className={inputClassName} value={movement.movement_type} onChange={(e) => setMovement({ ...movement, movement_type: e.target.value })}><option value="in">Stock in</option><option value="out">Stock out</option><option value="adjustment">Adjustment</option></select></Field>
            <Field label="Quantity"><input className={inputClassName} value={movement.quantity} onChange={(e) => setMovement({ ...movement, quantity: e.target.value })} /></Field>
            <Field label="Note"><input className={inputClassName} value={movement.note} onChange={(e) => setMovement({ ...movement, note: e.target.value })} /></Field>
            <button className={buttonClassName}>Record movement</button>
          </form>
        </Panel>
      </div>
      <Panel>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-zinc-200"><th className="py-2 font-semibold">Medicine</th><th className="py-2 font-semibold">Unit</th><th className="py-2 font-semibold">Price</th><th className="py-2 font-semibold">Stock</th><th className="py-2 font-semibold">Action</th></tr></thead>
            <tbody>
              {medicines.map((item) => (
                <tr key={item.id} className="border-b border-zinc-100">
                  <td className="py-2">{item.name}</td>
                  <td className="py-2">{item.unit}</td>
                  <td className="py-2">{item.sale_price}</td>
                  <td className="py-2">{item.current_stock}{item.is_low_stock ? ' low' : ''}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button className={ghostButtonClassName} onClick={() => { setEditingMedicineId(item.id); setMedicine({ name: item.name, unit: item.unit, sale_price: item.sale_price, low_stock_threshold: String(item.low_stock_threshold) }) }}>Edit</button>
                      <button className={ghostButtonClassName} onClick={() => void deleteMedicine(item.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls page={page} totalCount={totalCount} onPageChange={onPageChange} />
      </Panel>
    </>
  )
}
