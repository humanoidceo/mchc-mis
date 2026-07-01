import { startTransition, useCallback, useEffect, useState } from 'react'
import type { FormEvent, UIEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type {
  PaginatedResponse,
  PharmacyDashboardStats,
  PharmacyMedicine,
  PharmacyPatientSearchOption,
  PharmacyPrescription,
  PharmacySale,
  PharmacySetting,
  SearchResponse,
} from '../../types/domain'
import { useAuth } from '../auth/useAuth'

type View = 'dashboard' | 'medicines' | 'low-stock' | 'sales' | 'settings'
type MedicineFormState = {
  name: string
  generic_name: string
  quantity: string
  buy_price: string
  profit_percentage: string
}
type SaleDraftRow = {
  medicine: string
  quantity: string
  medicine_label?: string
  unit_price?: string
  stock?: number
  prescribed_name?: string
  instructions?: string
}

const emptyDashboard: PharmacyDashboardStats = {
  medicines_count: 0,
  low_stock_count: 0,
  sales_count: 0,
  stock_units: 0,
  inventory_value: '0.00',
  today_revenue: '0.00',
  monthly_revenue: '0.00',
  recent_sales: [],
  low_stock_items: [],
}

const emptyMedicineForm: MedicineFormState = {
  name: '',
  generic_name: '',
  quantity: '',
  buy_price: '',
  profit_percentage: '20',
}

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

export function PharmacyWorkspace({ view }: { view: View }) {
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState<PharmacyDashboardStats>(emptyDashboard)
  const [setting, setSetting] = useState<PharmacySetting>(emptySetting)
  const [selectedSale, setSelectedSale] = useState<PharmacySale | null>(null)
  const [error, setError] = useState('')

  async function loadData(currentView = view) {
    setError('')
    try {
      if (currentView === 'dashboard') {
        const [dashboardData, settingData] = await Promise.all([
          apiFetch<PharmacyDashboardStats>('/pharmacy/dashboard/'),
          apiFetch<PharmacySetting>('/pharmacy/settings/'),
        ])
        setDashboard(dashboardData)
        setSetting(settingData)
        return
      }

      if (currentView === 'medicines' || currentView === 'low-stock' || currentView === 'sales') {
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
      {view === 'dashboard' ? <PharmacyDashboard dashboard={dashboard} onRefresh={() => void loadData('dashboard')} /> : null}
      {view === 'medicines' ? <MedicineManager setting={setting} /> : null}
      {view === 'low-stock' ? <LowStockReport /> : null}
      {view === 'sales' ? (
        <SalesWorkspace
          setting={setting}
          onCreated={setSelectedSale}
          onSelectSale={setSelectedSale}
        />
      ) : null}
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
    </div>
  )
}

function PharmacyDashboard({ dashboard, onRefresh }: { dashboard: PharmacyDashboardStats; onRefresh: () => void }) {
  const statCards = [
    { label: 'Medicines', value: dashboard.medicines_count, tone: 'border-sky-100 bg-sky-50 text-sky-700' },
    { label: 'Low stock items', value: dashboard.low_stock_count, tone: 'border-amber-100 bg-amber-50 text-amber-700' },
    { label: 'Bills created', value: dashboard.sales_count, tone: 'border-emerald-100 bg-emerald-50 text-emerald-700' },
    { label: 'Stock units', value: dashboard.stock_units, tone: 'border-violet-100 bg-violet-50 text-violet-700' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title="Pharmacy dashboard" subtitle="Track stock pressure, revenue, and recent billing activity from one place." />
        <button className={ghostButtonClassName} onClick={onRefresh}>Refresh data</button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className={`rounded-md border p-4 shadow-sm ${card.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Revenue snapshot</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Billing performance</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-700">Today</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-950">{formatMoney(dashboard.today_revenue)}</p>
            </div>
            <div className="rounded-md border border-sky-100 bg-sky-50 p-4">
              <p className="text-sm text-sky-700">This month</p>
              <p className="mt-2 text-2xl font-semibold text-sky-950">{formatMoney(dashboard.monthly_revenue)}</p>
            </div>
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 sm:col-span-2">
              <p className="text-sm text-zinc-600">Inventory cost value</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{formatMoney(dashboard.inventory_value)}</p>
            </div>
          </div>
        </Panel>

        <Panel>
          <div>
            <p className="text-sm font-medium text-slate-500">Attention needed</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Low stock items</h2>
          </div>
          <div className="mt-5 space-y-3">
            {dashboard.low_stock_items.length ? dashboard.low_stock_items.map((medicine) => (
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
              {dashboard.recent_sales.map((sale) => (
                <tr key={sale.id}>
                  <td className="py-3 pr-4 font-medium text-slate-900">{sale.bill_no}</td>
                  <td className="py-3 pr-4 text-slate-600">{saleCustomerLabel(sale)}</td>
                  <td className="py-3 pr-4 text-slate-600">{sale.item_count}</td>
                  <td className="py-3 pr-4 text-slate-600">{formatDate(sale.created_at)}</td>
                  <td className="py-3 text-right font-medium text-slate-950">{formatMoney(sale.total_amount)}</td>
                </tr>
              ))}
              {!dashboard.recent_sales.length ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">No bills have been created yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

function MedicineManager({ setting }: { setting: PharmacySetting }) {
  const [medicines, setMedicines] = useState<PharmacyMedicine[]>([])
  const [form, setForm] = useState<MedicineFormState>(emptyMedicineForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    if (editingId === null) {
      setForm((current) => ({
        ...current,
        profit_percentage: current.profit_percentage || setting.default_profit_percentage,
      }))
    }
  }, [editingId, setting.default_profit_percentage])

  useEffect(() => {
    setPage(1)
  }, [query])

  useEffect(() => {
    let ignore = false

    async function loadMedicines() {
      setLoading(true)
      try {
        const response = await apiFetch<PaginatedResponse<PharmacyMedicine>>(`/pharmacy/medicines/?page=${page}&q=${encodeURIComponent(query)}`)
        if (!ignore) {
          setMedicines(response.results)
          setTotalCount(response.count)
        }
      } catch {
        if (!ignore) {
          setError('Unable to load medicines.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    void loadMedicines()
    return () => {
      ignore = true
    }
  }, [page, query])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await apiFetch<PharmacyMedicine>(editingId ? `/pharmacy/medicines/${editingId}/` : '/pharmacy/medicines/', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity),
        }),
      })
      setEditingId(null)
      setForm({
        ...emptyMedicineForm,
        profit_percentage: setting.default_profit_percentage,
      })
      const response = await apiFetch<PaginatedResponse<PharmacyMedicine>>(`/pharmacy/medicines/?page=${page}&q=${encodeURIComponent(query)}`)
      setMedicines(response.results)
      setTotalCount(response.count)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to save medicine.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteMedicine(medicineId: number) {
    setError('')
    try {
      await apiFetch(`/pharmacy/medicines/${medicineId}/`, { method: 'DELETE' })
      const response = await apiFetch<PaginatedResponse<PharmacyMedicine>>(`/pharmacy/medicines/?page=${page}&q=${encodeURIComponent(query)}`)
      setMedicines(response.results)
      setTotalCount(response.count)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to delete medicine.'))
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeader title="Medicine stock" subtitle="Maintain accurate pricing, profit margin, and current quantity for each item." />
          <label className="w-full max-w-sm">
            <span className="sr-only">Search medicines</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className={inputClassName} placeholder="Search by medicine or generic name" />
          </label>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-3 pr-4 font-medium">Medicine</th>
                <th className="pb-3 pr-4 font-medium">Quantity</th>
                <th className="pb-3 pr-4 font-medium">Buy</th>
                <th className="pb-3 pr-4 font-medium">Sell</th>
                <th className="pb-3 pr-4 font-medium">Margin</th>
                <th className="pb-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-100">
              {medicines.map((medicine) => (
                <tr key={medicine.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-slate-900">{medicine.name}</p>
                    <p className="text-xs text-slate-500">{medicine.generic_name || 'No generic name'}</p>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{medicine.quantity}</td>
                  <td className="py-3 pr-4 text-slate-700">{formatMoney(medicine.buy_price)}</td>
                  <td className="py-3 pr-4 text-slate-700">{formatMoney(medicine.sell_price)}</td>
                  <td className="py-3 pr-4 text-slate-700">{medicine.profit_percentage}%</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className={ghostButtonClassName}
                        onClick={() => {
                          setEditingId(medicine.id)
                          setForm({
                            name: medicine.name,
                            generic_name: medicine.generic_name,
                            quantity: String(medicine.quantity),
                            buy_price: medicine.buy_price,
                            profit_percentage: medicine.profit_percentage,
                          })
                        }}
                      >
                        Edit
                      </button>
                      <button className={ghostButtonClassName} onClick={() => void deleteMedicine(medicine.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!medicines.length && !loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">No medicines match this search.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
      </Panel>

      <Panel>
        <SectionHeader title={editingId ? 'Edit medicine' : 'Add medicine'} subtitle="Use the pharmacy default profit rate or override it for a specific item." />
        {error ? <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <Field label="Medicine name">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClassName} required />
          </Field>
          <Field label="Generic name">
            <input value={form.generic_name} onChange={(event) => setForm({ ...form, generic_name: event.target.value })} className={inputClassName} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quantity">
              <input value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className={inputClassName} min="0" type="number" required />
            </Field>
            <Field label="Buy price">
              <input value={form.buy_price} onChange={(event) => setForm({ ...form, buy_price: event.target.value })} className={inputClassName} min="0" step="0.01" type="number" required />
            </Field>
          </div>
          <Field label="Profit percentage">
            <input value={form.profit_percentage} onChange={(event) => setForm({ ...form, profit_percentage: event.target.value })} className={inputClassName} min="0" step="0.01" type="number" required />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button className={buttonClassName} disabled={submitting} type="submit">{submitting ? 'Saving...' : editingId ? 'Update medicine' : 'Add medicine'}</button>
            <button
              className={ghostButtonClassName}
              type="button"
              onClick={() => {
                setEditingId(null)
                setError('')
                setForm({
                  ...emptyMedicineForm,
                  profit_percentage: setting.default_profit_percentage,
                })
              }}
            >
              Reset
            </button>
          </div>
        </form>
      </Panel>
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
  onSelectSale,
}: {
  setting: PharmacySetting
  onCreated: (sale: PharmacySale) => void
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
      const sale = await apiFetch<PharmacySale>('/pharmacy/sales/', {
        method: 'POST',
        body: JSON.stringify({
          customer_type: customerType,
          patient: customerType === 'internal' ? selectedPatient?.id : undefined,
          prescription_document: customerType === 'internal' ? prescription?.id : undefined,
          customer_name: customerType === 'external' ? customerName : '',
          items: normalizedItems,
        }),
      })
      setCustomerName('')
      setSelectedPatient(null)
      setPrescription(null)
      setRows([{ medicine: '', quantity: '1' }])
      setNotice(`Bill ${sale.bill_no} created. Reception must approve payment ${sale.payment_status ?? 'pending'}.`)
      onCreated(sale)
      await loadSales(currentPage, deferredFilterText)
    } catch (caught) {
      setError(caught instanceof Error && !(caught instanceof ApiError) ? caught.message : describeApiError(caught, 'Unable to create bill.'))
    } finally {
      setSubmitting(false)
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
            className={`rounded border px-4 py-3 text-left text-sm ${customerType === 'internal' ? 'border-pink-200 bg-pink-50 text-pink-700' : 'border-sky-100 bg-white text-slate-700 hover:bg-sky-50'}`}
            onClick={() => {
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
            className={`rounded border px-4 py-3 text-left text-sm ${customerType === 'external' ? 'border-pink-200 bg-pink-50 text-pink-700' : 'border-sky-100 bg-white text-slate-700 hover:bg-sky-50'}`}
            onClick={() => {
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
                      nextRows[index] = { ...row, quantity: event.target.value }
                      setRows(nextRows)
                    }} className={inputClassName} min="1" type="number" required />
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
            <button className={buttonClassName} disabled={submitting || (customerType === 'internal' && loadingPrescription)} type="submit">{submitting ? 'Saving...' : 'Create bill and send to reception'}</button>
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
                  <p className="text-xl font-semibold text-slate-950">{formatMoney(sale.total_amount)}</p>
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
    <div className="print-area">
      <article className="a4-report mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200">
        <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div className="flex items-start gap-4">
            <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-16 w-16 rounded-2xl object-cover" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-sky-600">Pharmacy bill</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-950">{setting.pharmacy_name}</h1>
              <p className="mt-2 text-sm text-slate-500">{setting.address || 'Address not set'}</p>
              <p className="text-sm text-slate-500">{setting.phone || 'Phone not set'}</p>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-950 px-5 py-4 text-right text-white">
            <p className="text-xs uppercase tracking-[0.25em] text-sky-200">Bill no</p>
            <p className="mt-2 text-xl font-semibold">{sale.bill_no}</p>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Customer</p>
            <p className="mt-2 text-lg font-medium text-slate-900">{saleCustomerLabel(sale)}</p>
            <p className="mt-1 text-sm text-slate-500">{sale.customer_type_label} customer</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Issued at</p>
            <p className="mt-2 text-lg font-medium text-slate-900">{formatDate(sale.created_at)}</p>
            <p className="mt-1 text-sm text-slate-500">Reception status: {sale.payment_status ?? 'pending'}</p>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="px-4 py-3 font-medium">Medicine</th>
                <th className="px-4 py-3 font-medium">Generic</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-right">Unit</th>
                <th className="px-4 py-3 font-medium text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sale.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{item.medicine_name}</td>
                  <td className="px-4 py-3 text-slate-600">{item.generic_name || '-'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatMoney(item.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(item.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="mt-6 flex items-end justify-between gap-6">
          <div className="text-sm text-slate-500">
            <p>Printed by {printedBy}</p>
            <p className="mt-1">Thank you for visiting {setting.pharmacy_name}.</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-5 py-4 text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Grand total</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-950">{formatMoney(sale.total_amount)}</p>
          </div>
        </footer>
      </article>
    </div>
  )
}
