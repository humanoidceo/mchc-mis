import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, UIEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type {
  ClinicalDocument,
  PharmacyFamilyPlanningOrder,
  PaginatedResponse,
  PharmacyDashboardStats,
  PharmacyMedicine,
  PharmacyPatientSearchOption,
  PharmacyPrescription,
  PharmacyRutfOrder,
  PharmacySale,
  PharmacySetting,
  SearchResponse,
} from '../../types/domain'
import { useAuth } from '../auth/useAuth'
import { BillReceiptNote, BillSignature, BillTitle, billBoxClassName, billCellClassName, billHeaderCellClassName, billPaperClassName, PrintDocument } from '../clinic/PrintDocument'
import { PharmacyMedicineStockSection } from './PharmacyMedicineStockSection'

type View = 'dashboard' | 'report' | 'medicines' | 'family-planning-stock' | 'family-planning-orders' | 'expired-medicines' | 'upcoming-expired-medicines' | 'rutf-stock' | 'low-stock' | 'sales' | 'rutf-orders' | 'settings'
type SaleDraftRow = {
  medicine: string
  quantity: string
  medicine_label?: string
  unit_price?: string
  stock?: number
  prescribed_name?: string
  instructions?: string
}
type FamilyPlanningDraftItem = {
  medicine: number
  medicine_name: string
  quantity: string
}
type PharmacyInventoryReportSummary = {
  from: string
  to: string
  sales_count: number
  sold_quantity: string
  sold_amount: string
  sold_cost_amount: string
  sold_profit_amount: string
  available_medicines_count: number
  stock_units: string
  stock_value_cost: string
  stock_value_sale: string
  generated_at: string
}

const emptyDashboard: PharmacyDashboardStats = {
  period: 'monthly',
  period_label: 'Monthly',
  medicines_count: 0,
  medicines_registered_count: 0,
  low_stock_count: 0,
  sales_count: 0,
  internal_patients: 0,
  internal_amount: '0.00',
  external_patients: 0,
  external_amount: '0.00',
  full_paid: 0,
  full_paid_amount: '0.00',
  discounted: 0,
  discounted_amount: '0.00',
  free: 0,
  free_amount: '0.00',
  pending_reception_payments: 0,
  pending_reception_amount: '0.00',
  approved_reception_payments: 0,
  approved_reception_amount: '0.00',
  stock_units: '0.00',
  inventory_value: '0.00',
  total_billed: '0.00',
  sold_medicines_total: '0.00',
  sold_medicines_profit: '0.00',
  sold_medicines_price: '0.00',
  family_planning_items_dispensed: 0,
  patient_trend: [],
  recent_sales_count: 0,
  recent_sales: [],
  low_stock_items: [],
}

const dashboardPeriodOptions: Array<{ value: PharmacyDashboardStats['period']; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
  { value: 'custom', label: 'Custom' },
]

const emptySetting: PharmacySetting = {
  id: 0,
  pharmacy_name: 'MCHC Pharmacy',
  phone: '',
  address: '',
  default_profit_percentage: '20.00',
}

function formatMoney(value: string | number): string {
  return Number(value || 0).toFixed(2)
}

function formatMoneyAfn(value: string | number): string {
  return `${formatMoney(value)} AFN`
}

function formatDariDate(value: string): string {
  return new Intl.DateTimeFormat('fa-AF-u-ca-gregory', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value))
}

function formatDariDateFromInput(value: string): string {
  return formatDariDate(`${value}T00:00:00`)
}

function formatDariDateTime(value: string): string {
  return new Intl.DateTimeFormat('fa-AF-u-ca-gregory', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDariNumber(value: number): string {
  return new Intl.NumberFormat('fa-AF').format(value)
}

function formatDariMoney(value: string | number): string {
  return `${new Intl.NumberFormat('fa-AF', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0))} افغانی`
}

function formatDariQuantity(value: string | number): string {
  const numericValue = Number(value || 0)
  const hasFraction = Math.abs(numericValue % 1) > 0.0001
  return new Intl.NumberFormat('fa-AF', {
    minimumFractionDigits: hasFraction ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(numericValue)
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function saleCustomerLabel(sale: PharmacySale): string {
  if (sale.customer_type === 'internal') {
    return sale.patient_name || sale.customer_name || 'Internal patient'
  }
  return sale.customer_name || sale.patient_name || 'Walk-in customer'
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

function todayDateInputValue(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildPharmacyDashboardQuery(period: PharmacyDashboardStats['period'], recentPage: number, fromDate: string, toDate: string): string {
  const params = new URLSearchParams({
    period,
    recent_page: String(recentPage),
  })
  if (period === 'custom') {
    params.set('from', fromDate)
    params.set('to', toDate)
  }
  return params.toString()
}

function normalizeSaleQuantityInput(value: string): string {
  const sanitized = value.replace(/[^\d.]/g, '')
  const [wholePart, ...decimalParts] = sanitized.split('.')
  if (!decimalParts.length) {
    return wholePart
  }
  return `${wholePart}.${decimalParts.join('').slice(0, 1)}`
}

function normalizeFamilyPlanningQuantityInput(value: string): string {
  return value.replace(/[^\d]/g, '')
}

export function PharmacyWorkspace({ view }: { view: View }) {
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState<PharmacyDashboardStats>(emptyDashboard)
  const [setting, setSetting] = useState<PharmacySetting>(emptySetting)
  const [selectedSale, setSelectedSale] = useState<PharmacySale | null>(null)
  const [selectedFamilyPlanningOrder, setSelectedFamilyPlanningOrder] = useState<PharmacyFamilyPlanningOrder | null>(null)
  const [selectedRutfOrder, setSelectedRutfOrder] = useState<PharmacyRutfOrder | null>(null)
  const [error, setError] = useState('')

  async function loadData(currentView = view, period: PharmacyDashboardStats['period'] = 'monthly', recentPage = 1, fromDate = todayDateInputValue(), toDate = todayDateInputValue()) {
    setError('')
    try {
      if (currentView === 'dashboard') {
        const [dashboardData, settingData] = await Promise.all([
          apiFetch<PharmacyDashboardStats>(`/pharmacy/dashboard/?${buildPharmacyDashboardQuery(period, recentPage, fromDate, toDate)}`),
          apiFetch<PharmacySetting>('/pharmacy/settings/'),
        ])
        setDashboard(dashboardData)
        setSetting(settingData)
        return
      }

      if (currentView === 'medicines' || currentView === 'family-planning-stock' || currentView === 'family-planning-orders' || currentView === 'expired-medicines' || currentView === 'upcoming-expired-medicines' || currentView === 'rutf-stock' || currentView === 'low-stock' || currentView === 'sales' || currentView === 'rutf-orders') {
        setSetting(await apiFetch<PharmacySetting>('/pharmacy/settings/'))
        return
      }

      setSetting(await apiFetch<PharmacySetting>('/pharmacy/settings/'))
    } catch {
      setError('Unable to load pharmacy data.')
    }
  }

  useEffect(() => {
    void loadData()
  }, [view])

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {view === 'dashboard' ? <PharmacyDashboard dashboard={dashboard} onRefresh={(period, recentPage, fromDate, toDate) => void loadData('dashboard', period, recentPage, fromDate, toDate)} /> : null}
      {view === 'report' ? <PharmacyInventoryReport /> : null}
      {view === 'medicines' ? <PharmacyMedicineStockSection key="medicines" /> : null}
      {view === 'family-planning-stock' ? <PharmacyMedicineStockSection key="family-planning-stock" familyPlanningOnly /> : null}
      {view === 'family-planning-orders' ? <FamilyPlanningOrdersWorkspace onSelectOrder={setSelectedFamilyPlanningOrder} /> : null}
      {view === 'expired-medicines' ? <PharmacyMedicineStockSection key="expired-medicines" expiredOnly /> : null}
      {view === 'upcoming-expired-medicines' ? <PharmacyMedicineStockSection key="upcoming-expired-medicines" upcomingExpiredOnly /> : null}
      {view === 'rutf-stock' ? <PharmacyMedicineStockSection key="rutf-stock" rutfOnly /> : null}
      {view === 'low-stock' ? <LowStockReport /> : null}
      {view === 'sales' ? (
        <SalesWorkspace
          setting={setting}
          onCreated={setSelectedSale}
          onUpdated={(sale) => setSelectedSale((current) => current?.id === sale.id ? sale : current)}
          onSelectSale={setSelectedSale}
        />
      ) : null}
      {view === 'rutf-orders' ? <RutfOrdersWorkspace onSelectOrder={setSelectedRutfOrder} /> : null}
      {view === 'settings' ? <PharmacySettingsPage setting={setting} onSaved={() => void loadData('settings')} /> : null}
      {selectedSale ? (
        <div className="space-y-3">
          <div className="no-print flex gap-2">
            <button className={buttonClassName} onClick={() => window.print()}>Print bill</button>
            <button className={ghostButtonClassName} onClick={() => setSelectedSale(null)}>Close preview</button>
          </div>
          <PrintPharmacyBill sale={selectedSale} setting={setting} printedBy={user?.first_name || user?.username || 'MCHC staff'} />
        </div>
      ) : null}
      {selectedFamilyPlanningOrder ? (
        <div className="space-y-3">
          <div className="no-print flex gap-2">
            <button className={buttonClassName} onClick={() => window.print()}>Print family planning note</button>
            <button className={ghostButtonClassName} onClick={() => setSelectedFamilyPlanningOrder(null)}>Close preview</button>
          </div>
          <PrintDocument
            document={{
              id: selectedFamilyPlanningOrder.id,
              patient: selectedFamilyPlanningOrder.patient,
              patient_name: selectedFamilyPlanningOrder.patient_name,
              document_type: 'family_planning',
              document_type_label: 'Family planning',
              title: selectedFamilyPlanningOrder.title,
              payload: selectedFamilyPlanningOrder.payload,
              total_amount: '0',
              created_at: selectedFamilyPlanningOrder.created_at,
              created_by_name: selectedFamilyPlanningOrder.created_by_name,
            } as ClinicalDocument}
          />
        </div>
      ) : null}
      {selectedRutfOrder ? (
        <div className="space-y-3">
          <div className="no-print flex gap-2">
            <button className={buttonClassName} onClick={() => window.print()}>Print malnutrition order</button>
            <button className={ghostButtonClassName} onClick={() => setSelectedRutfOrder(null)}>Close preview</button>
          </div>
          <PrintDocument
            document={{
              id: selectedRutfOrder.id,
              patient: selectedRutfOrder.patient,
              patient_name: selectedRutfOrder.patient_name,
              document_type: 'rutf',
              document_type_label: 'Malnutrition order',
              title: selectedRutfOrder.title,
              payload: selectedRutfOrder.payload,
              total_amount: '0',
              created_at: selectedRutfOrder.created_at,
              created_by_name: selectedRutfOrder.created_by_name,
            } as ClinicalDocument}
          />
        </div>
      ) : null}
    </div>
  )
}

function PharmacyInventoryReport() {
  const [fromDate, setFromDate] = useState(todayDateInputValue())
  const [toDate, setToDate] = useState(todayDateInputValue())
  const [report, setReport] = useState<PharmacyInventoryReportSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadReport = useCallback(async (currentFrom = fromDate, currentTo = toDate) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        from: currentFrom,
        to: currentTo,
      })
      const response = await apiFetch<PharmacyInventoryReportSummary>(`/pharmacy/dashboard/report/?${params.toString()}`)
      setReport(response)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to load pharmacy report.'))
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate])

  useEffect(() => {
    void loadReport(fromDate, toDate)
  }, [fromDate, loadReport, toDate])

  return (
    <div className="space-y-5">
      <section className="no-print flex flex-wrap items-end justify-between gap-4">
        <SectionHeader title="Pharmacy report" subtitle="Choose a date range and print a formal Dari A4 pharmacy report." />
        <form
          className="flex w-full max-w-3xl flex-wrap items-end justify-end gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm shadow-sky-100/70"
          onSubmit={(event) => {
            event.preventDefault()
            void loadReport()
          }}
        >
          <label className="block w-full sm:w-52">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">From</span>
            <input className={inputClassName} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="block w-full sm:w-52">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">To</span>
            <input className={inputClassName} type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <button className={ghostButtonClassName} type="submit" disabled={loading}>{loading ? 'Loading...' : 'Generate report'}</button>
          <button className={buttonClassName} type="button" onClick={() => window.print()} disabled={!report}>Print report</button>
        </form>
      </section>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="print-area">
        <article dir="rtl" lang="fa-AF" className="a4-report mx-auto max-w-3xl rounded-md border border-zinc-200 bg-white p-8 text-right text-zinc-950">
          <header className="border-b border-zinc-200 pb-5">
            <div className="flex items-center justify-center gap-4 text-center">
              <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-20 w-20 rounded-2xl border border-sky-100 object-cover shadow-sm shadow-sky-100/70" />
              <div>
                <p className="text-sm font-semibold text-sky-700">Mother and Child Health Support Center</p>
                <p className="mt-1 text-base font-semibold text-slate-800">مرکز حمایه صحت طفل و مادر</p>
                <h1 className="mt-2 text-3xl font-bold text-slate-950">گزارش دواخانه</h1>
              </div>
            </div>
          </header>

          <div className="mt-6 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
            <p><strong>بخش مربوطه:</strong> دواخانه کلینیک</p>
            <p><strong>تاریخ ترتیب گزارش:</strong> {report ? formatDariDateTime(report.generated_at) : formatDariDateTime(new Date().toISOString())}</p>
            <p><strong>از تاریخ:</strong> {formatDariDateFromInput(fromDate)}</p>
            <p><strong>الی تاریخ:</strong> {formatDariDateFromInput(toDate)}</p>
          </div>

          <section className="mt-8 rounded-2xl border border-sky-100 bg-sky-50/70 p-6">
            <p className="text-lg leading-9 text-slate-900">
              این گزارش رسمی دواخانه نشان می‌دهد که در فاصله زمانی از تاریخ{' '}
              <strong>{formatDariDateFromInput(fromDate)}</strong>{' '}
              الی{' '}
              <strong>{formatDariDateFromInput(toDate)}</strong>
              ، به تعداد{' '}
              <strong className="text-sky-800">{formatDariNumber(report?.sales_count ?? 0)}</strong>{' '}
              بل فروش ثبت گردیده، به مقدار{' '}
              <strong className="text-sky-800">{formatDariQuantity(report?.sold_quantity ?? 0)}</strong>{' '}
              واحد دوا فروخته شده و مبلغ مجموعی فروشات به{' '}
              <strong className="text-sky-800">{formatDariMoney(report?.sold_amount ?? 0)}</strong>{' '}
              رسیده است.
            </p>
          </section>

          <section className="mt-8 grid gap-4 sm:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="text-sm font-semibold text-zinc-700">خلاصه گزارش</p>
              <p className="mt-4 text-4xl font-bold text-slate-950">{formatDariMoney(report?.sold_amount ?? 0)}</p>
              <p className="mt-2 text-sm text-zinc-500">فروش مجموعی دوا در محدوده فوق الذکر</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-7 text-slate-700">
              <p><strong>تعداد اقلام موجود دوا:</strong> {formatDariNumber(report?.available_medicines_count ?? 0)}</p>
              <p className="mt-2"><strong>تعداد مجموعی واحدهای موجود:</strong> {formatDariQuantity(report?.stock_units ?? 0)}</p>
              <p className="mt-2"><strong>ارزش فعلی استاک به قیمت خرید:</strong> {formatDariMoney(report?.stock_value_cost ?? 0)}</p>
              <p className="mt-2"><strong>ارزش فعلی استاک به قیمت فروش:</strong> {formatDariMoney(report?.stock_value_sale ?? 0)}</p>
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-3">
              <h2 className="text-lg font-semibold text-slate-950">تفصیل فروش و وضعیت فعلی استاک دواخانه</h2>
              <span className="text-sm text-zinc-500">واحد پول: افغانی</span>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
              <table className="min-w-full text-sm">
                <thead className="bg-sky-50 text-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-right font-semibold">شاخص</th>
                    <th className="px-4 py-3 text-right font-semibold">مقدار پول</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-zinc-100">
                    <td className="px-4 py-3 font-medium text-slate-900">فروش دوا در بازه فوق الذکر</td>
                    <td className="px-4 py-3 text-slate-700">{formatDariMoney(report?.sold_amount ?? 0)}</td>
                  </tr>
                  <tr className="border-t border-zinc-100">
                    <td className="px-4 py-3 font-medium text-slate-900">قیمت خرید دواهای فروخته‌شده</td>
                    <td className="px-4 py-3 text-slate-700">{formatDariMoney(report?.sold_cost_amount ?? 0)}</td>
                  </tr>
                  <tr className="border-t border-zinc-100">
                    <td className="px-4 py-3 font-medium text-slate-900">مفاد حاصل‌شده از فروش دوا</td>
                    <td className="px-4 py-3 text-slate-700">{formatDariMoney(report?.sold_profit_amount ?? 0)}</td>
                  </tr>
                  <tr className="border-t border-zinc-100">
                    <td className="px-4 py-3 font-medium text-slate-900">اقلام فعلی موجود در استاک</td>
                    <td className="px-4 py-3 text-slate-700">{formatDariMoney(report?.stock_value_cost ?? 0)}</td>
                  </tr>
                  <tr className="border-t border-zinc-100">
                    <td className="px-4 py-3 font-medium text-slate-900">ارزش فعلی استاک به قیمت فروش</td>
                    <td className="px-4 py-3 text-slate-700">{formatDariMoney(report?.stock_value_sale ?? 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-12 grid gap-10 text-sm text-slate-800 sm:grid-cols-2">
            <div className="text-right">
              <p className="font-semibold">مسؤول دواخانه</p>
              <p className="mt-8">نام: __________________</p>
              <p className="mt-6">امضاء: __________________</p>
            </div>
            <div className="text-right sm:text-left">
              <p className="font-semibold">مدیریت</p>
              <p className="mt-8">نام: __________________</p>
              <p className="mt-6">امضاء: __________________</p>
            </div>
          </section>
        </article>
      </section>
    </div>
  )
}

function PharmacyDashboard({ dashboard, onRefresh }: { dashboard: PharmacyDashboardStats; onRefresh: (period: PharmacyDashboardStats['period'], recentPage: number, fromDate: string, toDate: string) => void }) {
  const [period, setPeriod] = useState<PharmacyDashboardStats['period']>(dashboard.period || 'monthly')
  const [fromDate, setFromDate] = useState(todayDateInputValue())
  const [toDate, setToDate] = useState(todayDateInputValue())
  const [report, setReport] = useState(dashboard)
  const [recentSalesPage, setRecentSalesPage] = useState(1)
  const [error, setError] = useState('')

  useEffect(() => {
    setReport(dashboard)
    setPeriod(dashboard.period || 'monthly')
  }, [dashboard])

  useEffect(() => {
    setRecentSalesPage(1)
  }, [period, fromDate, toDate])

  useEffect(() => {
    let ignore = false

    async function loadReport() {
      if (period === 'custom' && (!fromDate || !toDate)) {
        return
      }
      setError('')
      try {
        const nextReport = await apiFetch<PharmacyDashboardStats>(`/pharmacy/dashboard/?${buildPharmacyDashboardQuery(period, recentSalesPage, fromDate, toDate)}`)
        if (!ignore) setReport(nextReport)
      } catch (caught) {
        if (!ignore) setError(describeApiError(caught, 'Unable to load pharmacy dashboard.'))
      }
    }

    void loadReport()
    return () => {
      ignore = true
    }
  }, [period, recentSalesPage, fromDate, toDate])

  const statCards = [
    { label: 'Medicines registered', value: report.medicines_registered_count ?? 0, detail: report.period_label, tone: 'border-lime-100 bg-lime-50 text-lime-700' },
    { label: 'Internal patients', value: report.internal_patients, amount: report.internal_amount, tone: 'border-sky-100 bg-sky-50 text-sky-700' },
    { label: 'External patients', value: report.external_patients, amount: report.external_amount, tone: 'border-cyan-100 bg-cyan-50 text-cyan-700' },
    { label: 'Full paid', value: report.full_paid, amount: report.full_paid_amount, tone: 'border-emerald-100 bg-emerald-50 text-emerald-700' },
    { label: 'Discounted', value: report.discounted, amount: report.discounted_amount, tone: 'border-violet-100 bg-violet-50 text-violet-700' },
    { label: 'Free', value: report.free, amount: report.free_amount, tone: 'border-rose-100 bg-rose-50 text-rose-700' },
    { label: 'Reception pending', value: report.pending_reception_payments, amount: report.pending_reception_amount, tone: 'border-amber-100 bg-amber-50 text-amber-700' },
    { label: 'Reception approved', value: report.approved_reception_payments, amount: report.approved_reception_amount, tone: 'border-teal-100 bg-teal-50 text-teal-700' },
    { label: 'Medicine stock value', value: report.period_label, amount: report.inventory_value, tone: 'border-fuchsia-100 bg-fuchsia-50 text-fuchsia-700' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader title="Pharmacy dashboard" subtitle="Track internal and external billing activity, payment mix, and patient trends from one place." />
        <div className="flex min-w-[18rem] flex-col gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm shadow-sky-100/70 sm:min-w-[22rem] sm:flex-row sm:items-end sm:justify-end">
          <label className="flex-1 text-sm font-medium text-zinc-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Report period</span>
            <select className={`${inputClassName} w-full`} value={period} onChange={(event) => setPeriod(event.target.value as PharmacyDashboardStats['period'])}>
              {dashboardPeriodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {period === 'custom' ? (
            <>
              <label className="flex-1 text-sm font-medium text-zinc-700">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">From</span>
                <input className={`${inputClassName} w-full`} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              </label>
              <label className="flex-1 text-sm font-medium text-zinc-700">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">To</span>
                <input className={`${inputClassName} w-full`} type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} />
              </label>
            </>
          ) : null}
          <button className={ghostButtonClassName} onClick={() => onRefresh(period, recentSalesPage, fromDate, toDate)}>Refresh data</button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {statCards.map((card) => (
          <div key={card.label} className={`rounded-md border p-4 shadow-sm ${card.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{card.value}</p>
            {card.amount !== undefined ? <p className="mt-2 text-sm font-medium text-slate-700">{formatMoneyAfn(card.amount)}</p> : null}
            {card.detail !== undefined ? <p className="mt-2 text-sm font-medium text-slate-700">{card.detail}</p> : null}
          </div>
        ))}
        <div className="rounded-md border border-pink-100 bg-pink-50 p-4 shadow-sm text-pink-700">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Family planning items donated</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{report.family_planning_items_dispensed}</p>
          <p className="mt-2 text-sm font-medium text-slate-700">{report.period_label}</p>
        </div>
        <div className="rounded-md border border-indigo-100 bg-indigo-50 p-4 shadow-sm text-indigo-700 sm:col-span-2 lg:col-span-2 xl:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Medicines sold</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{report.period_label}</p>
          <div className="mt-3 space-y-1 text-sm font-medium text-slate-700">
            <p>Total: {formatMoneyAfn(report.sold_medicines_total)}</p>
            <p>Profit: {formatMoneyAfn(report.sold_medicines_profit)}</p>
            <p>Medicines price: {formatMoneyAfn(report.sold_medicines_price)}</p>
          </div>
        </div>
      </section>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">{report.period_label} pharmacy summary</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Billing performance</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-700">Total billed</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-950">{formatMoneyAfn(report.total_billed)}</p>
            </div>
            <div className="rounded-md border border-sky-100 bg-sky-50 p-4">
              <p className="text-sm text-sky-700">Sales created</p>
              <p className="mt-2 text-2xl font-semibold text-sky-950">{report.sales_count}</p>
            </div>
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 sm:col-span-2">
              <p className="text-sm text-zinc-600">Inventory cost value</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{formatMoneyAfn(report.inventory_value)}</p>
            </div>
          </div>
        </Panel>

        <Panel>
          <div>
            <p className="text-sm font-medium text-slate-500">Attention needed</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Low stock items</h2>
          </div>
          <div className="mt-5 space-y-3">
            {report.low_stock_items.length ? report.low_stock_items.map((medicine) => (
              <div key={medicine.id} className="flex items-center justify-between rounded border border-amber-100 bg-amber-50 px-4 py-3">
                <div>
                  <p className="font-medium text-slate-900">{medicine.name}</p>
                  <p className="text-sm text-slate-500">{medicine.generic_name || 'No generic name'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-700">Balance</p>
                  <p className="text-lg font-semibold text-amber-950">{medicine.quantity}</p>
                </div>
              </div>
            )) : <p className="rounded border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">No low stock items right now.</p>}
          </div>
        </Panel>
      </section>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-950">Patient trend</p>
          <p className="text-xs font-medium text-zinc-500">
            {report.period === 'weekly' ? 'Daily trend for this week' : report.period === 'monthly' ? 'Daily trend for this month' : report.period === 'annual' ? 'Monthly trend for this year' : report.period === 'custom' ? 'Patient trend is not shown for custom periods' : 'Select weekly, monthly, annual, or custom'}
          </p>
        </div>
        {report.period === 'daily' || report.period === 'custom' ? (
          <div className="mt-4 rounded border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">
            {report.period === 'custom' ? 'Choose daily, weekly, monthly, or annual to view the patient trend graph.' : 'Change the period to weekly, monthly, or annual to view the patient trend graph.'}
          </div>
        ) : (
          <PharmacyTrendChart data={report.patient_trend} />
        )}
      </Panel>

      <Panel>
        <div>
          <p className="text-sm font-medium text-slate-500">Latest activity</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Recent bills</h2>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-3 pr-4 font-medium">Bill</th>
                <th className="pb-3 pr-4 font-medium">Customer</th>
                <th className="pb-3 pr-4 font-medium">Items</th>
                <th className="pb-3 pr-4 font-medium">Created</th>
                <th className="pb-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-100">
              {report.recent_sales.map((sale) => (
                <tr key={sale.id}>
                  <td className="py-3 pr-4 font-medium text-slate-900">{sale.bill_no}</td>
                  <td className="py-3 pr-4 text-slate-600">{saleCustomerLabel(sale)}</td>
                  <td className="py-3 pr-4 text-slate-600">{sale.item_count}</td>
                  <td className="py-3 pr-4 text-slate-600">{formatDate(sale.created_at)}</td>
                  <td className="py-3 text-right font-medium text-slate-950">{formatMoney(sale.total_amount)}</td>
                </tr>
              ))}
              {!report.recent_sales.length ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">No bills have been created yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <PaginationControls page={recentSalesPage} totalCount={report.recent_sales_count} onPageChange={setRecentSalesPage} />
      </Panel>
    </div>
  )
}

function PharmacyTrendChart({ data }: { data: Array<{ label: string; value: number }> }) {
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

function LowStockReport() {
  const [medicines, setMedicines] = useState<PharmacyMedicine[]>([])
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  async function loadLowStock(currentPage = page) {
    const response = await apiFetch<PaginatedResponse<PharmacyMedicine>>(`/pharmacy/medicines/?page=${currentPage}&low_stock=1`)
    setMedicines(response.results)
    setTotalCount(response.count)
  }

  useEffect(() => {
    void loadLowStock(page)
  }, [page])

  const totalPages = Math.max(1, Math.ceil(totalCount / 10))

  function onRefresh() {
    void loadLowStock(page)
  }

  return (
    <section className="space-y-5">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title="Low stock report" subtitle="Medicines with quantity less than 10. Print this page as an A4 portrait report." />
        <div className="flex flex-wrap gap-2">
          <button className={ghostButtonClassName} onClick={onRefresh}>Refresh</button>
          <button className={buttonClassName} onClick={() => window.print()}>Print A4 report</button>
        </div>
      </div>

      <div className="print-area a4-report space-y-5">
        <div className="hidden print:block">
          <p className="text-sm font-medium text-sky-600">MCHC MIS</p>
          <h1 className="text-2xl font-semibold text-slate-950">Pharmacy Low Stock Report</h1>
          <p className="text-sm text-zinc-600">Generated {formatDate(new Date().toISOString())}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-amber-100 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Low stock medicines</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{totalCount}</p>
          </div>
          <div className="rounded-md border border-sky-100 bg-sky-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Current page</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{page}</p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Total pages</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{totalPages}</p>
          </div>
        </div>

        <Panel>
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="py-2 font-semibold">Medicine</th>
                  <th className="py-2 font-semibold">Generic</th>
                  <th className="py-2 font-semibold">Buy price</th>
                  <th className="py-2 font-semibold">Sell price</th>
                  <th className="py-2 font-semibold">Quantity</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {medicines.map((medicine) => (
                  <tr key={medicine.id} className="border-b border-zinc-100">
                    <td className="py-2">{medicine.name}</td>
                    <td className="py-2">{medicine.generic_name || '-'}</td>
                    <td className="py-2">{formatMoney(medicine.buy_price)}</td>
                    <td className="py-2">{formatMoney(medicine.sell_price)}</td>
                    <td className="py-2">{medicine.quantity}</td>
                    <td className="py-2">{medicine.stock_status}</td>
                  </tr>
                ))}
                {!medicines.length ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500">No medicines are below quantity 10.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="no-print">
          <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
        </div>
      </div>
    </section>
  )
}

function SalesWorkspace({
  setting,
  onCreated,
  onUpdated,
  onSelectSale,
}: {
  setting: PharmacySetting
  onCreated: (sale: PharmacySale) => void
  onUpdated: (sale: PharmacySale) => void
  onSelectSale: (sale: PharmacySale) => void
}) {
  const [sales, setSales] = useState<PharmacySale[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [customerType, setCustomerType] = useState<'internal' | 'external'>('internal')
  const [customerName, setCustomerName] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<PharmacyPatientSearchOption | null>(null)
  const [prescription, setPrescription] = useState<PharmacyPrescription | null>(null)
  const [rows, setRows] = useState<SaleDraftRow[]>([{ medicine: '', quantity: '1' }])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadingPrescription, setLoadingPrescription] = useState(false)
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null)
  const [editingPrescriptionDocumentId, setEditingPrescriptionDocumentId] = useState<number | null>(null)
  const [filterText, setFilterText] = useState('')
  const [deferredFilterText, setDeferredFilterText] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  async function loadSales(page = currentPage, search = deferredFilterText) {
    const response = await apiFetch<PaginatedResponse<PharmacySale>>(`/pharmacy/sales/?page=${page}&q=${encodeURIComponent(search)}`)
    setSales(response.results)
    setTotalCount(response.count)
  }

  useEffect(() => {
    startTransition(() => {
      setDeferredFilterText(filterText)
    })
  }, [filterText])

  useEffect(() => {
    setCurrentPage(1)
  }, [deferredFilterText])

  useEffect(() => {
    void loadSales(currentPage, deferredFilterText)
  }, [currentPage, deferredFilterText])

  const totalAmount = rows.reduce((sum, row) => {
    return sum + (Number(row.unit_price || 0) * Number(row.quantity || 0))
  }, 0)

  function resetBillingForm() {
    setEditingSaleId(null)
    setEditingPrescriptionDocumentId(null)
    setCustomerType('internal')
    setCustomerName('')
    setSelectedPatient(null)
    setPrescription(null)
    setRows([{ medicine: '', quantity: '1' }])
  }

  async function loadPrescription(patient: PharmacyPatientSearchOption) {
    setSelectedPatient(patient)
    setLoadingPrescription(true)
    setError('')
    setNotice('')
    try {
      const latestPrescription = await apiFetch<PharmacyPrescription>(`/pharmacy/patients/${patient.id}/latest-prescription/`)
      setPrescription(latestPrescription)
      setRows(
        latestPrescription.items.map((item) => ({
          medicine: item.pharmacy_medicine ? String(item.pharmacy_medicine) : '',
          quantity: item.quantity || '1',
          medicine_label: item.pharmacy_medicine_name || item.medicine_name,
          unit_price: item.pharmacy_sell_price,
          stock: item.pharmacy_stock,
          prescribed_name: item.medicine_name,
          instructions: item.instructions,
        })),
      )
    } catch (caught) {
      setPrescription(null)
      setRows([{ medicine: '', quantity: '1' }])
      setError(describeApiError(caught, 'Unable to load the latest prescription for this patient.'))
    } finally {
      setLoadingPrescription(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const normalizedItems = rows
        .filter((row) => row.medicine && Number(row.quantity) > 0)
        .map((row) => ({ medicine: Number(row.medicine), quantity: Number(row.quantity) }))
      if (!normalizedItems.length) {
        throw new Error('Select at least one medicine.')
      }
      const sale = await apiFetch<PharmacySale>(editingSaleId === null ? '/pharmacy/sales/' : `/pharmacy/sales/${editingSaleId}/`, {
        method: editingSaleId === null ? 'POST' : 'PATCH',
        body: JSON.stringify({
          customer_type: customerType,
          patient: customerType === 'internal' ? selectedPatient?.id : undefined,
          prescription_document: customerType === 'internal' ? prescription?.id ?? editingPrescriptionDocumentId ?? undefined : undefined,
          customer_name: customerType === 'external' ? customerName : '',
          items: normalizedItems,
        }),
      })
      resetBillingForm()
      setNotice(editingSaleId === null ? `Bill ${sale.bill_no} created. Reception must approve payment ${sale.payment_status ?? 'pending'}.` : 'Bill updated.')
      if (editingSaleId === null) {
        onCreated(sale)
      } else {
        onUpdated(sale)
      }
      await loadSales(currentPage, deferredFilterText)
    } catch (caught) {
      setError(caught instanceof Error && !(caught instanceof ApiError) ? caught.message : describeApiError(caught, editingSaleId === null ? 'Unable to create bill.' : 'Unable to update bill.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function editSale(sale: PharmacySale) {
    setError('')
    setNotice('')
    setEditingSaleId(sale.id)
    setEditingPrescriptionDocumentId(sale.prescription_document_id)
    setCustomerType(sale.customer_type)
    setRows(sale.items.map((item) => ({
      medicine: item.medicine ? String(item.medicine) : '',
      quantity: String(item.quantity),
      medicine_label: item.medicine_name,
      unit_price: item.unit_price,
    })))

    if (sale.customer_type === 'external') {
      setCustomerName(sale.customer_name || saleCustomerLabel(sale))
      setSelectedPatient(null)
      setPrescription(null)
      return
    }

    try {
      const patient = await apiFetch<PharmacyPatientSearchOption>(`/patients/${sale.patient}/`)
      setSelectedPatient(patient)
      setCustomerName('')
      setPrescription(null)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to load the internal patient for editing this bill.'))
    }
  }

  async function deleteSale(saleId: number) {
    setError('')
    setNotice('')
    try {
      await apiFetch(`/pharmacy/sales/${saleId}/`, { method: 'DELETE' })
      setNotice('Bill deleted and stock restored.')
      await loadSales(currentPage, deferredFilterText)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to delete bill.'))
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Panel>
        <SectionHeader title="Create pharmacy bill" subtitle="Internal patients load medicines from the doctor prescription. External customers are billed manually and then sent to reception for approval." />
        <div className="mt-4 rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <p className="font-medium">{setting.pharmacy_name}</p>
          <p className="mt-1 text-sky-700">{setting.address || 'Address not configured yet'}</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className={`rounded border px-4 py-3 text-left text-sm ${customerType === 'internal' ? 'border-pink-200 bg-pink-50 text-pink-700' : 'border-sky-100 bg-white text-slate-700 hover:bg-sky-50'} ${editingSaleId !== null ? 'cursor-not-allowed opacity-70' : ''}`}
            onClick={() => {
              if (editingSaleId !== null) return
              setCustomerType('internal')
              setCustomerName('')
              setNotice('')
            }}
          >
            <p className="font-semibold">Internal customer</p>
            <p className={`mt-1 ${customerType === 'internal' ? 'text-pink-600' : 'text-slate-500'}`}>Search a registered patient and load the latest prescription.</p>
          </button>
          <button
            type="button"
            className={`rounded border px-4 py-3 text-left text-sm ${customerType === 'external' ? 'border-pink-200 bg-pink-50 text-pink-700' : 'border-sky-100 bg-white text-slate-700 hover:bg-sky-50'} ${editingSaleId !== null ? 'cursor-not-allowed opacity-70' : ''}`}
            onClick={() => {
              if (editingSaleId !== null) return
              setCustomerType('external')
              setSelectedPatient(null)
              setPrescription(null)
              setRows([{ medicine: '', quantity: '1' }])
              setNotice('')
            }}
          >
            <p className="font-semibold">External customer</p>
            <p className={`mt-1 ${customerType === 'external' ? 'text-pink-600' : 'text-slate-500'}`}>Type the name, select medicines, print the bill, then send to reception.</p>
          </button>
        </div>
        {error ? <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {notice ? <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {customerType === 'internal' ? (
            <div className="space-y-4">
              <SearchCombo<PharmacyPatientSearchOption>
                label="Internal patient"
                placeholder="Search registration number or patient name"
                searchPath="/pharmacy/patients/"
                renderOption={(patient) => `${patient.registration_number} - ${patient.first_name} ${patient.last_name}${patient.age ? ` (${patient.age})` : ''}`}
                onSelect={(patient) => void loadPrescription(patient)}
              />
              {selectedPatient ? (
                <div className="rounded border border-sky-100 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-950">{selectedPatient.first_name} {selectedPatient.last_name}</p>
                  <p className="mt-1">Registration {selectedPatient.registration_number}</p>
                  {prescription ? <p className="mt-2 text-sky-700">Loaded prescription {prescription.title} from {formatDate(prescription.created_at)}.</p> : null}
                  {loadingPrescription ? <p className="mt-2 text-sky-700">Loading prescription...</p> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <Field label="External customer name">
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className={inputClassName} placeholder="Type customer name" required />
            </Field>
          )}
          <div className="space-y-3">
            {rows.map((row, index) => {
              return (
                <div key={index} className="grid gap-3 rounded border border-sky-100 bg-slate-50 p-4 md:grid-cols-[1fr_120px_auto]">
                  <SearchCombo<PharmacyMedicine>
                    label={`Medicine ${index + 1}`}
                    placeholder="Search medicine stock"
                    searchPath="/pharmacy/medicines/search/"
                    extraParams="available=1"
                    valueText={row.medicine_label || ''}
                    renderOption={(medicine) => `${medicine.name} - stock ${medicine.quantity}`}
                    onSelect={(medicine) => {
                      const nextRows = [...rows]
                      nextRows[index] = {
                        ...row,
                        medicine: String(medicine.id),
                        medicine_label: medicine.name,
                        unit_price: medicine.sell_price,
                        stock: medicine.quantity,
                      }
                      setRows(nextRows)
                    }}
                  />
                  <Field label="Quantity">
                    <input value={row.quantity} onChange={(event) => {
                      const nextRows = [...rows]
                      nextRows[index] = { ...row, quantity: normalizeSaleQuantityInput(event.target.value) }
                      setRows(nextRows)
                    }} className={inputClassName} min="0.1" step="0.1" inputMode="decimal" type="number" required />
                  </Field>
                  <div className="flex items-end">
                    <button className={ghostButtonClassName} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))} type="button">Remove</button>
                  </div>
                  {row.prescribed_name ? (
                    <div className="md:col-span-3 rounded border border-dashed border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                      <p><strong>Doctor wrote:</strong> {row.prescribed_name}</p>
                      <p><strong>Instruction:</strong> {row.instructions || 'No instruction'}</p>
                    </div>
                  ) : null}
                  {row.stock !== undefined ? (
                    <div className="md:col-span-3">
                      <p className="text-sm text-slate-500">
                        Stock {row.stock}. Sell price {formatMoney(row.unit_price || 0)} each. Subtotal {formatMoney(Number(row.unit_price || 0) * Number(row.quantity || 0))}
                      </p>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {customerType === 'external' ? <button className={ghostButtonClassName} onClick={() => setRows([...rows, { medicine: '', quantity: '1' }])} type="button">Add line</button> : null}
            <div className="rounded border border-zinc-200 bg-white px-4 py-2 text-sm text-slate-700">
              Total {formatMoney(totalAmount)}
            </div>
            <button className={buttonClassName} disabled={submitting || (customerType === 'internal' && loadingPrescription)} type="submit">{submitting ? 'Saving...' : editingSaleId === null ? 'Create bill and send to reception' : 'Save bill changes'}</button>
            {editingSaleId !== null ? <button className={ghostButtonClassName} type="button" onClick={resetBillingForm}>Cancel edit</button> : null}
          </div>
        </form>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeader title="Recent bills" subtitle="Search and reopen any bill for review or printing." />
          <div className="flex gap-2">
            <input value={filterText} onChange={(event) => setFilterText(event.target.value)} className={inputClassName} placeholder="Search by bill or customer" />
            <button className={ghostButtonClassName} onClick={() => void loadSales(currentPage, deferredFilterText)}>Refresh</button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {sales.map((sale) => (
            <div key={sale.id} className="rounded border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-950">{sale.bill_no}</p>
                  <p className="text-sm text-slate-500">{saleCustomerLabel(sale)}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{formatDate(sale.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{sale.customer_type_label}</p>
                  <p className="text-sm text-slate-500">Total</p>
                  <p className="text-xl font-semibold text-slate-950">{formatMoneyAfn(sale.total_amount)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {sale.items.slice(0, 3).map((item) => (
                  <span key={item.id} className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
                    {item.medicine_name} x {item.quantity}
                  </span>
                ))}
                {sale.items.length > 3 ? <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">+{sale.items.length - 3} more</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${sale.payment_status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  Reception payment {sale.payment_status ?? 'pending'}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <button className={buttonClassName} onClick={() => onSelectSale(sale)}>Print bill</button>
                <button className={ghostButtonClassName} onClick={() => void editSale(sale)}>Edit</button>
                <button className={ghostButtonClassName} onClick={() => void deleteSale(sale.id)}>Delete</button>
              </div>
            </div>
          ))}
          {!sales.length ? <p className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-600">No bills found.</p> : null}
          <PaginationControls page={currentPage} totalCount={totalCount} onPageChange={setCurrentPage} />
        </div>
      </Panel>
    </div>
  )
}

function RutfOrdersWorkspace({ onSelectOrder }: { onSelectOrder: (order: PharmacyRutfOrder) => void }) {
  const [orders, setOrders] = useState<PharmacyRutfOrder[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [filterText, setFilterText] = useState('')
  const [deferredFilterText, setDeferredFilterText] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('pending')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  const loadOrders = useCallback(async (currentPage = page, search = deferredFilterText, status = statusFilter) => {
    setLoading(true)
    try {
      const response = await apiFetch<PaginatedResponse<PharmacyRutfOrder>>(`/pharmacy/rutf-orders/?page=${currentPage}&q=${encodeURIComponent(search)}${status === 'all' ? '' : `&status=${status}`}`)
      setOrders(response.results)
      setTotalCount(response.count)
      setError('')
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to load malnutrition orders.'))
    } finally {
      setLoading(false)
    }
  }, [deferredFilterText, page, statusFilter])

  useEffect(() => {
    startTransition(() => setDeferredFilterText(filterText))
  }, [filterText])

  useEffect(() => {
    setPage(1)
  }, [deferredFilterText, statusFilter])

  useEffect(() => {
    void loadOrders(page, deferredFilterText, statusFilter)
  }, [deferredFilterText, loadOrders, page, statusFilter])

  async function approveOrder(orderId: number) {
    setError('')
    setNotice('')
    try {
      const approved = await apiFetch<PharmacyRutfOrder>(`/pharmacy/rutf-orders/${orderId}/approve/`, { method: 'POST' })
      setNotice(`Malnutrition order approved for ${approved.patient_name}.`)
      await loadOrders(page, deferredFilterText, statusFilter)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to approve malnutrition order.'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title="Malnutrition orders" subtitle="Dispense free malnutrition orders created by the malnutrition account. Approval automatically deducts from malnutrition stock." />
        <div className="flex flex-wrap gap-2">
          <input value={filterText} onChange={(event) => setFilterText(event.target.value)} className={inputClassName} placeholder="Search by patient or order" />
          <select className={inputClassName} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'pending' | 'approved')}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <Panel>
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="rounded border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-950">{order.patient_name}</p>
                  <p className="text-sm text-slate-500">{String(order.payload.nutrition_status || '').replace('_', ' ') || 'Malnutrition order'}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{formatDate(order.created_at)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${order.pharmacy_status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {order.pharmacy_status === 'approved' ? 'Approved' : 'Pending'}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <p><strong>Quantity:</strong> {order.rutf_quantity}</p>
                <p><strong>MUAC:</strong> {String(order.payload.muac_mm || 'Not set')}</p>
                <p><strong>Edema:</strong> {String(order.payload.bilateral_edema || 'Not set')}</p>
                <p><strong>Appetite:</strong> {String(order.payload.appetite_test || 'Not set')}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className={buttonClassName} onClick={() => onSelectOrder(order)}>Print</button>
                {order.pharmacy_status !== 'approved' ? <button className={ghostButtonClassName} onClick={() => void approveOrder(order.id)}>Approve</button> : null}
              </div>
            </div>
          ))}
          {!orders.length && !loading ? <p className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-600">No malnutrition orders found.</p> : null}
          <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
        </div>
      </Panel>
    </div>
  )
}

function FamilyPlanningOrdersWorkspace({ onSelectOrder }: { onSelectOrder: (order: PharmacyFamilyPlanningOrder) => void }) {
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null)
  const [selectedPatientLabel, setSelectedPatientLabel] = useState('')
  const [selectedItem, setSelectedItem] = useState<PharmacyMedicine | null>(null)
  const [selectedItemLabel, setSelectedItemLabel] = useState('')
  const [itemQuantity, setItemQuantity] = useState('')
  const [items, setItems] = useState<FamilyPlanningDraftItem[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [orders, setOrders] = useState<PharmacyFamilyPlanningOrder[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [filterText, setFilterText] = useState('')
  const [deferredFilterText, setDeferredFilterText] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'dispensed'>('all')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  const loadOrders = useCallback(async (currentPage = page, search = deferredFilterText, status = statusFilter) => {
    setLoading(true)
    try {
      const response = await apiFetch<PaginatedResponse<PharmacyFamilyPlanningOrder>>(`/pharmacy/family-planning-orders/?page=${currentPage}&q=${encodeURIComponent(search)}${status === 'all' ? '' : `&status=${status}`}`)
      setOrders(response.results)
      setTotalCount(response.count)
      setError('')
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to load family planning orders.'))
    } finally {
      setLoading(false)
    }
  }, [deferredFilterText, page, statusFilter])

  useEffect(() => {
    startTransition(() => setDeferredFilterText(filterText))
  }, [filterText])

  useEffect(() => {
    setPage(1)
  }, [deferredFilterText, statusFilter])

  useEffect(() => {
    void loadOrders(page, deferredFilterText, statusFilter)
  }, [deferredFilterText, loadOrders, page, statusFilter])

  function resetCreateForm() {
    setSelectedPatientId(null)
    setSelectedPatientLabel('')
    setSelectedItem(null)
    setSelectedItemLabel('')
    setItemQuantity('')
    setItems([])
    setEditingId(null)
  }

  function addItem(medicine: PharmacyMedicine | null) {
    if (!medicine) {
      setError('Select a family planning item first.')
      return
    }
    const quantity = Number(itemQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Enter a valid quantity.')
      return
    }
    if (items.some((item) => item.medicine === medicine.id)) {
      setError('This family planning item is already added.')
      return
    }
    setItems((current) => [
      ...current,
      {
        medicine: medicine.id,
        medicine_name: medicine.name,
        quantity: String(quantity),
      },
    ])
    setSelectedItem(null)
    setSelectedItemLabel('')
    setItemQuantity('')
    setError('')
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPatientId) {
      setError('Select a patient first.')
      return
    }
    if (!items.length) {
      setError('Add at least one family planning item.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      await apiFetch<PharmacyFamilyPlanningOrder>(editingId ? `/pharmacy/family-planning-orders/${editingId}/` : '/pharmacy/family-planning-orders/', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          patient: selectedPatientId,
          title: 'Family planning order',
          payload: {
            family_planning_record: true,
            items: items.map((item) => ({
              medicine: item.medicine,
              medicine_name: item.medicine_name,
              quantity: Number(item.quantity),
            })),
          },
        }),
      })
      setNotice(editingId ? 'Family planning order updated.' : 'Family planning order saved and added to pharmacy queue.')
      resetCreateForm()
      await loadOrders(page, deferredFilterText, statusFilter)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to save family planning order.'))
    } finally {
      setSaving(false)
    }
  }

  function editOrder(order: PharmacyFamilyPlanningOrder) {
    setEditingId(order.id)
    setSelectedPatientId(order.patient)
    setSelectedPatientLabel(order.patient_name)
    setSelectedItem(null)
    setSelectedItemLabel('')
    setItemQuantity('')
    setItems(order.items.map((item) => ({
      medicine: item.medicine,
      medicine_name: item.medicine_name,
      quantity: String(item.quantity),
    })))
    setError('')
    setNotice('')
  }

  async function deleteOrder(order: PharmacyFamilyPlanningOrder) {
    const confirmed = window.confirm(`Delete family planning order for "${order.patient_name}"?`)
    if (!confirmed) return
    setError('')
    setNotice('')
    try {
      await apiFetch(`/pharmacy/family-planning-orders/${order.id}/`, { method: 'DELETE' })
      if (editingId === order.id) {
        resetCreateForm()
      }
      setNotice(`Family planning order deleted for ${order.patient_name}.`)
      await loadOrders(page, deferredFilterText, statusFilter)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to delete family planning order.'))
    }
  }

  async function dispenseOrder(orderId: number) {
    setError('')
    setNotice('')
    try {
      const dispensed = await apiFetch<PharmacyFamilyPlanningOrder>(`/pharmacy/family-planning-orders/${orderId}/dispense/`, { method: 'POST' })
      setNotice(`Family planning order dispensed for ${dispensed.patient_name}.`)
      await loadOrders(page, deferredFilterText, statusFilter)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to dispense family planning order.'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[26rem_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-24 xl:self-start">
          <Panel>
            <SectionHeader title="Family planning orders" subtitle="Create family planning orders from the pharmacy account when the gynecologist is busy, then send them to the pharmacy queue." />
            {error ? <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            {notice ? <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

            <form onSubmit={submitOrder} className="mt-5 space-y-4">
              <SearchCombo<PharmacyPatientSearchOption>
                label="Patient"
                placeholder="Search patient by registration number or name"
                searchPath="/patients/search/"
                valueText={selectedPatientLabel}
                renderOption={(patient) => `${patient.registration_number} - ${patient.first_name} ${patient.last_name}${patient.age ? ` (${patient.age})` : ''}${patient.phone ? ` - ${patient.phone}` : ''}`}
                onSelect={(patient) => {
                  setSelectedPatientId(patient.id)
                  setSelectedPatientLabel(`${patient.registration_number} - ${patient.first_name} ${patient.last_name}`)
                  setError('')
                }}
              />
              <div className="rounded border border-sky-100 bg-sky-50/60 p-4">
                <SearchCombo<PharmacyMedicine>
                  label="Family planning item"
                  placeholder="Search family planning stock"
                  searchPath="/pharmacy/medicines/search/"
                  extraParams="family_planning_only=1"
                  valueText={selectedItemLabel}
                  renderOption={(medicine) => `${medicine.name} - stock ${medicine.quantity}`}
                  onSelect={(medicine) => {
                    setSelectedItem(medicine)
                    setSelectedItemLabel(medicine.name)
                    setError('')
                  }}
                />
                <Field label="Quantity">
                  <input
                    className={inputClassName}
                    min="1"
                    step="1"
                    type="number"
                    value={itemQuantity}
                    onChange={(event) => setItemQuantity(normalizeFamilyPlanningQuantityInput(event.target.value))}
                    placeholder="Type quantity before adding"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button className={ghostButtonClassName} type="button" onClick={() => addItem(selectedItem)}>Add item</button>
                  <button className={ghostButtonClassName} type="button" onClick={() => { setSelectedItem(null); setSelectedItemLabel(''); setItemQuantity('') }}>Clear selected item</button>
                </div>
              </div>

              <div className="rounded border border-sky-100 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Requested items</p>
                  {items.length ? <button className={ghostButtonClassName} type="button" onClick={() => setItems([])}>Clear all</button> : null}
                </div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.medicine} className="flex items-center justify-between rounded border border-zinc-100 bg-slate-50 px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-slate-900">{item.medicine_name}</p>
                        <p className="text-slate-500">Quantity: {item.quantity}</p>
                      </div>
                      <button className={ghostButtonClassName} type="button" onClick={() => setItems((current) => current.filter((row) => row.medicine !== item.medicine))}>Remove</button>
                    </div>
                  ))}
                  {!items.length ? <p className="text-sm text-slate-500">No family planning items added.</p> : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button className={buttonClassName} disabled={saving} type="submit">{saving ? 'Saving...' : editingId ? 'Update family planning order' : 'Save family planning order'}</button>
                <button className={ghostButtonClassName} type="button" onClick={resetCreateForm}>{editingId ? 'Cancel edit' : 'Reset'}</button>
              </div>
            </form>
          </Panel>
        </div>

        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeader title="Pharmacy queue" subtitle="Review all family planning orders from doctors and pharmacists, print the issued items, and dispense them from Family Planning Stock." />
            <div className="flex flex-wrap gap-2">
              <input value={filterText} onChange={(event) => setFilterText(event.target.value)} className={inputClassName} placeholder="Search by patient or order" />
              <select className={inputClassName} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'pending' | 'dispensed')}>
                <option value="pending">Pending</option>
                <option value="dispensed">Dispensed</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>

          <Panel>
            <div className="space-y-3">
              {orders.map((order) => (
                <div key={order.id} className="rounded border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-950">{order.patient_name}</p>
                      <p className="text-sm text-slate-500">Requested by {order.created_by_name}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{formatDate(order.created_at)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${order.pharmacy_status === 'dispensed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {order.pharmacy_status === 'dispensed' ? 'Dispensed' : 'Pending'}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-700">
                    {order.items.map((item) => (
                      <p key={`${item.medicine}-${item.medicine_name}`}><strong>{item.medicine_name}</strong> x {item.quantity}</p>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className={buttonClassName} onClick={() => onSelectOrder(order)}>Print</button>
                    <button className={ghostButtonClassName} onClick={() => editOrder(order)}>Edit</button>
                    <button className={ghostButtonClassName} onClick={() => void deleteOrder(order)}>Delete</button>
                    {order.pharmacy_status !== 'dispensed' ? <button className={ghostButtonClassName} onClick={() => void dispenseOrder(order.id)}>Dispense</button> : null}
                  </div>
                </div>
              ))}
              {!orders.length && !loading ? <p className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-600">No family planning orders found.</p> : null}
              <PaginationControls page={page} totalCount={totalCount} pageSize={5} onPageChange={setPage} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function SearchCombo<T extends { id: number }>({
  label,
  placeholder,
  searchPath,
  extraParams,
  valueText,
  renderOption,
  onSelect,
}: {
  label: string
  placeholder: string
  searchPath: string
  extraParams?: string
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
      const response = await apiFetch<SearchResponse<T>>(
        `${searchPath}?q=${encodeURIComponent(search)}&offset=${offset}${extraParams ? `&${extraParams}` : ''}`,
      )
      setItems((current) => replace ? response.results : [...current, ...response.results])
      setNextOffset(response.next_offset)
    } finally {
      setLoading(false)
    }
  }, [extraParams, query, searchPath])

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

function PharmacySettingsPage({ setting, onSaved }: { setting: PharmacySetting; onSaved: () => void }) {
  const [form, setForm] = useState(setting)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setForm(setting)
  }, [setting])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setNotice('')
    setError('')
    try {
      await apiFetch<PharmacySetting>('/pharmacy/settings/', {
        method: 'PUT',
        body: JSON.stringify({
          pharmacy_name: form.pharmacy_name,
          phone: form.phone,
          address: form.address,
          default_profit_percentage: form.default_profit_percentage,
        }),
      })
      setNotice('Pharmacy settings updated.')
      onSaved()
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to save pharmacy settings.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel>
        <SectionHeader title="Pharmacy settings" subtitle="These details appear in the billing workspace and printed bill layout." />
        <div className="mt-5 space-y-4 rounded-md border border-sky-100 bg-sky-50 p-5 text-slate-900">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-sky-600">Current identity</p>
            <h2 className="mt-2 text-2xl font-semibold">{setting.pharmacy_name}</h2>
          </div>
          <p className="text-sm text-slate-600">{setting.address || 'Add a pharmacy address for printed bills.'}</p>
          <p className="text-sm text-slate-600">{setting.phone || 'Add a phone number for bill contact details.'}</p>
        </div>
      </Panel>

      <Panel>
        {notice ? <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
        {error ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Pharmacy name">
            <input value={form.pharmacy_name} onChange={(event) => setForm({ ...form, pharmacy_name: event.target.value })} className={inputClassName} required />
          </Field>
          <Field label="Phone">
            <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className={inputClassName} />
          </Field>
          <Field label="Address">
            <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className={inputClassName} />
          </Field>
          <Field label="Default profit percentage">
            <input value={form.default_profit_percentage} onChange={(event) => setForm({ ...form, default_profit_percentage: event.target.value })} className={inputClassName} min="0" step="0.01" type="number" required />
          </Field>
          <button className={buttonClassName} disabled={submitting} type="submit">{submitting ? 'Saving...' : 'Save settings'}</button>
        </form>
      </Panel>
    </div>
  )
}

function PrintPharmacyBill({
  sale,
  setting,
  printedBy,
}: {
  sale: PharmacySale
  setting: PharmacySetting
  printedBy: string
}) {
  return (
    <section className={billPaperClassName}>
      <BillTitle title={setting.pharmacy_name} subtitle="Pharmacy bill" />

      <div className={billBoxClassName}>
        <div className="grid grid-cols-[7rem_1fr_6rem_1fr] border-b border-black">
          <div className={billHeaderCellClassName}>Bill no:</div>
          <div className={billCellClassName}>{sale.bill_no}</div>
          <div className={billHeaderCellClassName}>Issued at:</div>
          <div className={billCellClassName}>{formatDate(sale.created_at)}</div>
        </div>
        <div className="grid grid-cols-[7rem_1fr_6rem_1fr] border-b border-black">
          <div className={billHeaderCellClassName}>Patient ID:</div>
          <div className={billCellClassName}>{sale.patient ?? 'N/A'}</div>
          <div className={billHeaderCellClassName}>Patient name:</div>
          <div className={billCellClassName}>{saleCustomerLabel(sale)}</div>
        </div>
        <div className="grid grid-cols-[7rem_1fr_6rem_1fr] border-b border-black">
          <div className={billHeaderCellClassName}>Type:</div>
          <div className={billCellClassName}>{sale.customer_type_label} customer</div>
          <div className={billHeaderCellClassName}>Account:</div>
          <div className={billCellClassName}>{printedBy}</div>
        </div>
        <div className="grid grid-cols-[7rem_1fr_6rem_1fr] border-b border-black">
          <div className={billHeaderCellClassName}>Status:</div>
          <div className={billCellClassName}>{sale.payment_status ?? 'pending'}</div>
          <div className={billHeaderCellClassName}>Phone:</div>
          <div className={billCellClassName}>{setting.phone || 'Phone not set'}</div>
        </div>
        <div className="grid grid-cols-[7rem_1fr_6rem_1fr]">
          <div className={billHeaderCellClassName}>Address:</div>
          <div className={billCellClassName}>{setting.address || 'Address not set'}</div>
          <div className={billHeaderCellClassName}>Payment:</div>
          <div className={billCellClassName}>CASH</div>
        </div>
      </div>

      <table className="mt-3 w-full border-collapse border border-black text-left text-[11px]">
        <thead>
          <tr className="bg-zinc-200">
            <th className="border border-black px-2 py-1 font-bold">Medicine</th>
            <th className="border border-black px-2 py-1 font-bold">Generic</th>
            <th className="border border-black px-2 py-1 text-right font-bold">Qty</th>
            <th className="border border-black px-2 py-1 text-right font-bold">Unit</th>
            <th className="border border-black px-2 py-1 text-right font-bold">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id}>
              <td className="border border-black px-2 py-1 font-medium">{item.medicine_name}</td>
              <td className="border border-black px-2 py-1">{item.generic_name || '-'}</td>
              <td className="border border-black px-2 py-1 text-right">{item.quantity}</td>
              <td className="border border-black px-2 py-1 text-right">{formatMoneyAfn(item.unit_price)}</td>
              <td className="border border-black px-2 py-1 text-right font-medium">{formatMoneyAfn(item.total_price)}</td>
            </tr>
          ))}
          <tr className="bg-zinc-100 font-bold">
            <td className="border border-black px-2 py-1" colSpan={4}>Grand total</td>
            <td className="border border-black px-2 py-1 text-right">{formatMoneyAfn(sale.total_amount)}</td>
          </tr>
        </tbody>
      </table>

      <BillReceiptNote receivedFrom={printedBy} amount={formatMoney(sale.total_amount)} />

      <footer className="mt-4 flex items-end justify-between gap-6 text-sm">
        <p>Thank you for visiting {setting.pharmacy_name}.</p>
        <BillSignature />
      </footer>
    </section>
  )
}
