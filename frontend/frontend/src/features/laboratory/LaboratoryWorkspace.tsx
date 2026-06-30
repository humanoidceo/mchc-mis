import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, UIEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, Panel, SectionHeader } from '../../components/ui'
import type {
  ClinicalDocument,
  LaboratoryBill,
  LaboratoryDashboardStats,
  LaboratoryOrder,
  LaboratoryPatientSearchOption,
  LabTest,
  SearchResponse,
} from '../../types/domain'
import { useAuth } from '../auth/useAuth'

type View = 'dashboard' | 'billing'
type BillRow = {
  test: string
  test_label: string
  cost: string
  instructions: string
}
type ResultRow = {
  test: number
  test_name: string
  normal_range_from: string
  normal_range_to: string
  unit: string
  result: string
}

const emptyDashboard: LaboratoryDashboardStats = {
  pending_lab_orders: 0,
  bills_created: 0,
  pending_reception_payments: 0,
  approved_reception_payments: 0,
  monthly_amount: '0.00',
  recent_bills: [],
}

function formatMoney(value: string | number): string {
  return Number(value || 0).toFixed(2)
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

function billCustomerLabel(bill: LaboratoryBill): string {
  const payload = bill.payload as Record<string, unknown>
  const customerName = typeof payload.customer_name === 'string' ? payload.customer_name : ''
  return bill.customer_type === 'internal' ? bill.patient_name : customerName || bill.patient_name
}

function asBillDocument(bill: LaboratoryBill, printedBy: string): ClinicalDocument {
  return {
    id: bill.id,
    patient: bill.patient,
    patient_name: bill.patient_name,
    document_type: 'lab_bill',
    document_type_label: 'Laboratory bill',
    title: bill.title,
    payload: bill.payload,
    total_amount: bill.total_amount,
    created_at: bill.created_at,
    created_by_name: printedBy,
  }
}

export function LaboratoryWorkspace({ view }: { view: View }) {
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState<LaboratoryDashboardStats>(emptyDashboard)
  const [bills, setBills] = useState<LaboratoryBill[]>([])
  const [selectedBill, setSelectedBill] = useState<LaboratoryBill | null>(null)
  const [selectedPrintMode, setSelectedPrintMode] = useState<'bill' | 'result'>('bill')
  const [error, setError] = useState('')

  const printedBy = user?.first_name || user?.username || 'MCHC staff'

  const loadData = useCallback(async (currentView = view) => {
    setError('')
    try {
      if (currentView === 'dashboard') {
        setDashboard(await apiFetch<LaboratoryDashboardStats>('/laboratory/dashboard/'))
        return
      }
      setBills(await apiFetch<LaboratoryBill[]>('/laboratory/bills/'))
    } catch {
      setError('Unable to load laboratory data.')
    }
  }, [view])

  useEffect(() => {
    void loadData()
  }, [loadData])

  return (
    <div className="space-y-6">
      {error ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {view === 'dashboard' ? <LaboratoryDashboard dashboard={dashboard} onRefresh={() => void loadData('dashboard')} /> : null}
      {view === 'billing' ? (
        <LaboratoryBilling
          bills={bills}
          onCreated={(bill) => {
            setSelectedPrintMode('bill')
            setSelectedBill(bill)
            void loadData('billing')
          }}
          onRefresh={() => void loadData('billing')}
          onSelectBill={(bill, mode) => {
            setSelectedPrintMode(mode)
            setSelectedBill(bill)
          }}
          onBillUpdated={(bill) => {
            setBills((current) => current.map((row) => row.id === bill.id ? bill : row))
          }}
        />
      ) : null}
      {selectedBill ? (
        <div className="space-y-3">
          <div className="no-print flex gap-2">
            <button className={buttonClassName} onClick={() => window.print()}>{selectedPrintMode === 'result' ? 'Print result' : 'Print bill'}</button>
            <button className={ghostButtonClassName} onClick={() => setSelectedBill(null)}>Close preview</button>
          </div>
          {selectedPrintMode === 'result'
            ? <PrintLaboratoryResult bill={selectedBill} printedBy={printedBy} />
            : <PrintLaboratoryBill bill={selectedBill} printedBy={printedBy} />}
        </div>
      ) : null}
    </div>
  )
}

function LaboratoryDashboard({ dashboard, onRefresh }: { dashboard: LaboratoryDashboardStats; onRefresh: () => void }) {
  const statCards = [
    { label: 'Pending lab orders', value: dashboard.pending_lab_orders, tone: 'border-sky-100 bg-sky-50 text-sky-700' },
    { label: 'Bills created', value: dashboard.bills_created, tone: 'border-emerald-100 bg-emerald-50 text-emerald-700' },
    { label: 'Reception pending', value: dashboard.pending_reception_payments, tone: 'border-amber-100 bg-amber-50 text-amber-700' },
    { label: 'Reception approved', value: dashboard.approved_reception_payments, tone: 'border-teal-100 bg-teal-50 text-teal-700' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title="Laboratory dashboard" subtitle="Manage doctor lab orders, external customers, and bills waiting for reception approval." />
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

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Panel>
          <p className="text-sm font-semibold text-slate-950">Monthly total billed</p>
          <p className="mt-4 text-3xl font-semibold text-slate-950">{formatMoney(dashboard.monthly_amount)}</p>
          <p className="mt-2 text-sm text-zinc-600">All laboratory bills created this month by the current account.</p>
        </Panel>

        <Panel>
          <p className="text-sm font-semibold text-slate-950">Recent bills</p>
          <div className="mt-4 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="py-2 font-semibold">Patient</th>
                  <th className="py-2 font-semibold">Customer type</th>
                  <th className="py-2 font-semibold">Items</th>
                  <th className="py-2 font-semibold">Amount</th>
                  <th className="py-2 font-semibold">Reception</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recent_bills.map((bill) => (
                  <tr key={bill.id} className="border-b border-zinc-100">
                    <td className="py-2">{billCustomerLabel(bill)}</td>
                    <td className="py-2">{bill.customer_type_label}</td>
                    <td className="py-2">{bill.item_count}</td>
                    <td className="py-2">{bill.total_amount}</td>
                    <td className="py-2">{bill.payment_status ?? 'pending'}</td>
                  </tr>
                ))}
                {!dashboard.recent_bills.length ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-zinc-500">No laboratory bills created yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function LaboratoryBilling({
  bills,
  onCreated,
  onRefresh,
  onSelectBill,
  onBillUpdated,
}: {
  bills: LaboratoryBill[]
  onCreated: (bill: LaboratoryBill) => void
  onRefresh: () => void
  onSelectBill: (bill: LaboratoryBill, mode: 'bill' | 'result') => void
  onBillUpdated: (bill: LaboratoryBill) => void
}) {
  const [customerType, setCustomerType] = useState<'internal' | 'external'>('internal')
  const [customerName, setCustomerName] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<LaboratoryPatientSearchOption | null>(null)
  const [latestOrder, setLatestOrder] = useState<LaboratoryOrder | null>(null)
  const [rows, setRows] = useState<BillRow[]>([{ test: '', test_label: '', cost: '', instructions: '' }])
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [deferredFilterText, setDeferredFilterText] = useState('')
  const [page, setPage] = useState(1)
  const [editingResultsBillId, setEditingResultsBillId] = useState<number | null>(null)
  const [resultRows, setResultRows] = useState<ResultRow[]>([])
  const [savingResults, setSavingResults] = useState(false)

  useEffect(() => {
    startTransition(() => setDeferredFilterText(filterText))
  }, [filterText])

  const filteredBills = useMemo(() => (
    bills.filter((bill) => {
      const term = deferredFilterText.trim().toLowerCase()
      if (!term) return true
      return [billCustomerLabel(bill), bill.title, String(bill.id)].some((value) => value.toLowerCase().includes(term))
    })
  ), [bills, deferredFilterText])

  const totalPages = Math.max(1, Math.ceil(filteredBills.length / 10))
  const paginatedBills = filteredBills.slice((page - 1) * 10, page * 10)
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.cost || 0), 0)

  useEffect(() => {
    setPage(1)
  }, [deferredFilterText])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  async function loadLatestOrder(patient: LaboratoryPatientSearchOption) {
    setSelectedPatient(patient)
    setLoadingOrder(true)
    setError('')
    setNotice('')
    try {
      const order = await apiFetch<LaboratoryOrder>(`/laboratory/patients/${patient.id}/latest-order/`)
      setLatestOrder(order)
      setRows(order.items.map((item) => ({
        test: item.test ? String(item.test) : '',
        test_label: item.test_name,
        cost: '',
        instructions: item.instructions,
      })))
    } catch (caught) {
      setLatestOrder(null)
      setRows([{ test: '', test_label: '', cost: '', instructions: '' }])
      setError(describeApiError(caught, 'Unable to load the latest lab order for this patient.'))
    } finally {
      setLoadingOrder(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const items = rows
        .filter((row) => row.test && Number(row.cost) > 0)
        .map((row) => ({
          test: Number(row.test),
          test_name: row.test_label,
          instructions: row.instructions,
          cost: row.cost,
        }))
      if (!items.length) throw new Error('Add at least one lab test with cost.')

      const bill = await apiFetch<LaboratoryBill>('/laboratory/bills/', {
        method: 'POST',
        body: JSON.stringify({
          customer_type: customerType,
          patient: customerType === 'internal' ? selectedPatient?.id : undefined,
          lab_order_document: customerType === 'internal' ? latestOrder?.id : undefined,
          customer_name: customerType === 'external' ? customerName : '',
          items,
        }),
      })

      setSelectedPatient(null)
      setLatestOrder(null)
      setCustomerName('')
      setRows([{ test: '', test_label: '', cost: '', instructions: '' }])
      setNotice(`Laboratory bill created. Reception must approve payment ${bill.payment_status ?? 'pending'}.`)
      onCreated(bill)
    } catch (caught) {
      setError(caught instanceof Error && !(caught instanceof ApiError) ? caught.message : describeApiError(caught, 'Unable to create laboratory bill.'))
    } finally {
      setSubmitting(false)
    }
  }

  function openResultsEditor(bill: LaboratoryBill) {
    const payload = bill.payload as Record<string, unknown>
    const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : []
    setEditingResultsBillId(bill.id)
    setResultRows(items.map((item) => ({
      test: Number(item.test),
      test_name: String(item.test_name ?? item.test ?? 'Test'),
      normal_range_from: String(item.normal_range_from ?? ''),
      normal_range_to: String(item.normal_range_to ?? ''),
      unit: String(item.unit ?? ''),
      result: String(item.result ?? ''),
    })))
    setError('')
    setNotice('')
  }

  async function saveResults(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editingResultsBillId === null) return
    setSavingResults(true)
    setError('')
    setNotice('')
    try {
      const bill = await apiFetch<LaboratoryBill>(`/laboratory/bills/${editingResultsBillId}/results/`, {
        method: 'POST',
        body: JSON.stringify({
          items: resultRows.map((row) => ({ test: row.test, result: row.result })),
        }),
      })
      onBillUpdated(bill)
      setEditingResultsBillId(null)
      setNotice('Laboratory results saved.')
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to save laboratory results.'))
    } finally {
      setSavingResults(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Panel>
        <SectionHeader title="Create laboratory bill" subtitle="Internal patients load tests from the doctor lab order. External customers are billed manually and then sent to reception for approval." />
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
            <p className={`mt-1 ${customerType === 'internal' ? 'text-pink-600' : 'text-slate-500'}`}>Search a registered patient and load the latest doctor lab order.</p>
          </button>
          <button
            type="button"
            className={`rounded border px-4 py-3 text-left text-sm ${customerType === 'external' ? 'border-pink-200 bg-pink-50 text-pink-700' : 'border-sky-100 bg-white text-slate-700 hover:bg-sky-50'}`}
            onClick={() => {
              setCustomerType('external')
              setSelectedPatient(null)
              setLatestOrder(null)
              setRows([{ test: '', test_label: '', cost: '', instructions: '' }])
              setNotice('')
            }}
          >
            <p className="font-semibold">External customer</p>
            <p className={`mt-1 ${customerType === 'external' ? 'text-pink-600' : 'text-slate-500'}`}>Type the customer name, add tests manually, print the bill, then send to reception.</p>
          </button>
        </div>

        {error ? <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {notice ? <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {customerType === 'internal' ? (
            <div className="space-y-4">
              <SearchCombo<LaboratoryPatientSearchOption>
                label="Internal patient"
                placeholder="Search registration number or patient name"
                searchPath="/laboratory/patients/"
                renderOption={(patient) => `${patient.registration_number} - ${patient.first_name} ${patient.last_name}${patient.age ? ` (${patient.age})` : ''}`}
                onSelect={(patient) => void loadLatestOrder(patient)}
              />
              {selectedPatient ? (
                <div className="rounded border border-sky-100 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-950">{selectedPatient.first_name} {selectedPatient.last_name}</p>
                  <p className="mt-1">Registration {selectedPatient.registration_number}</p>
                  {latestOrder ? <p className="mt-2 text-sky-700">Loaded lab order {latestOrder.title} from {formatDate(latestOrder.created_at)}.</p> : null}
                  {loadingOrder ? <p className="mt-2 text-sky-700">Loading lab order...</p> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <Field label="External customer name">
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className={inputClassName} required />
            </Field>
          )}

          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={index} className="grid gap-3 rounded border border-sky-100 bg-slate-50 p-4 md:grid-cols-[1fr_140px_1fr_auto]">
                <SearchCombo<LabTest>
                  label={`Lab test ${index + 1}`}
                  placeholder="Search lab tests"
                  searchPath="/lab-tests/search/"
                  valueText={row.test_label}
                  renderOption={(test) => test.name}
                  onSelect={(test) => {
                    const nextRows = [...rows]
                    nextRows[index] = { ...row, test: String(test.id), test_label: test.name }
                    setRows(nextRows)
                  }}
                />
                <Field label="Cost">
                  <input
                    className={inputClassName}
                    min="0"
                    step="0.01"
                    type="number"
                    value={row.cost}
                    onChange={(event) => {
                      const nextRows = [...rows]
                      nextRows[index] = { ...row, cost: event.target.value }
                      setRows(nextRows)
                    }}
                    required
                  />
                </Field>
                <Field label="Instruction or note">
                  <input
                    className={inputClassName}
                    value={row.instructions}
                    onChange={(event) => {
                      const nextRows = [...rows]
                      nextRows[index] = { ...row, instructions: event.target.value }
                      setRows(nextRows)
                    }}
                  />
                </Field>
                <div className="flex items-end">
                  <button className={ghostButtonClassName} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))} type="button">Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {customerType === 'external' ? <button className={ghostButtonClassName} onClick={() => setRows([...rows, { test: '', test_label: '', cost: '', instructions: '' }])} type="button">Add line</button> : null}
            <div className="rounded border border-zinc-200 bg-white px-4 py-2 text-sm text-slate-700">Total {formatMoney(totalAmount)}</div>
            <button className={buttonClassName} disabled={submitting || (customerType === 'internal' && loadingOrder)} type="submit">{submitting ? 'Saving...' : 'Create bill and send to reception'}</button>
          </div>
        </form>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeader title="Recent laboratory bills" subtitle="Review and print bills created in this account." />
          <div className="flex gap-2">
            <input value={filterText} onChange={(event) => setFilterText(event.target.value)} className={inputClassName} placeholder="Search by patient or bill" />
            <button className={ghostButtonClassName} onClick={onRefresh}>Refresh</button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {editingResultsBillId !== null ? (
            <form onSubmit={saveResults} className="rounded border border-sky-100 bg-sky-50 p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionHeader title="Enter test results" subtitle="Results can only be entered after reception approves the laboratory bill." />
                <button className={ghostButtonClassName} type="button" onClick={() => setEditingResultsBillId(null)}>Close</button>
              </div>
              <div className="mt-4 space-y-3">
                {resultRows.map((row, index) => (
                  <div key={`${row.test}-${index}`} className="grid gap-3 rounded border border-sky-100 bg-white p-4 md:grid-cols-[1fr_1fr_1fr]">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{row.test_name}</p>
                      <p className="mt-1 text-sm text-zinc-600">
                        Normal range: {row.normal_range_from || '-'} to {row.normal_range_to || '-'} {row.unit || ''}
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Result">
                        <input
                          className={inputClassName}
                          value={row.result}
                          onChange={(event) => {
                            const nextRows = [...resultRows]
                            nextRows[index] = { ...row, result: event.target.value }
                            setResultRows(nextRows)
                          }}
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <button className={buttonClassName} disabled={savingResults}>{savingResults ? 'Saving...' : 'Save results'}</button>
              </div>
            </form>
          ) : null}
          {paginatedBills.map((bill) => (
            <div key={bill.id} className="rounded border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-950">Laboratory bill #{bill.id}</p>
                  <p className="text-sm text-slate-500">{billCustomerLabel(bill)}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{formatDate(bill.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{bill.customer_type_label}</p>
                  <p className="text-sm text-slate-500">Total</p>
                  <p className="text-xl font-semibold text-slate-950">{formatMoney(bill.total_amount)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${bill.payment_status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  Reception payment {bill.payment_status ?? 'pending'}
                </span>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">{bill.item_count} test(s)</span>
              </div>
              <div className="mt-4 flex gap-2">
                <button className={buttonClassName} onClick={() => onSelectBill(bill, 'bill')}>Print bill</button>
                {bill.payment_status === 'approved' ? <button className={ghostButtonClassName} onClick={() => openResultsEditor(bill)}>Enter results</button> : null}
                {bill.has_results ? <button className={ghostButtonClassName} onClick={() => onSelectBill(bill, 'result')}>Print result</button> : null}
              </div>
            </div>
          ))}
          {!filteredBills.length ? <p className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-600">No laboratory bills found.</p> : null}
          {filteredBills.length ? (
            <div className="flex items-center justify-between rounded border border-zinc-200 bg-white px-4 py-3 text-sm text-slate-700">
              <p>Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <button className={ghostButtonClassName} disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
                <button className={ghostButtonClassName} disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
              </div>
            </div>
          ) : null}
        </div>
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

function PrintLaboratoryBill({ bill, printedBy }: { bill: LaboratoryBill; printedBy: string }) {
  const document = asBillDocument(bill, printedBy)
  const payload = document.payload as Record<string, unknown>
  const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : []

  return (
    <section className="print-area a4-report rounded-md border border-zinc-200 bg-white p-6 text-zinc-950">
      <header className="flex items-center gap-4 border-b border-zinc-200 pb-4">
        <div>
          <p className="text-sm font-medium text-sky-600">AFZENDA</p>
          <h2 className="text-xl font-semibold">Mother and Child Health Care Center</h2>
          <p className="text-sm text-zinc-600">Laboratory bill</p>
        </div>
      </header>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <p><strong>Date:</strong> {formatDate(document.created_at)}</p>
        <p><strong>Reception status:</strong> {bill.payment_status ?? 'pending'}</p>
        <p><strong>Patient:</strong> {billCustomerLabel(bill)}</p>
        <p><strong>Customer type:</strong> {bill.customer_type_label}</p>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-300 text-left">
            <th className="py-2">Test</th>
            <th className="py-2">Details</th>
            <th className="py-2 text-right">Cost</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="border-b border-zinc-100">
              <td className="py-2">{String(item.test_name ?? item.test ?? 'Test')}</td>
              <td className="py-2">{String(item.instructions ?? '')}</td>
              <td className="py-2 text-right">{String(item.cost ?? '')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex justify-between border-t border-zinc-200 pt-4 text-sm">
        <span>Total cost: {bill.total_amount}</span>
        <span>Printed by: {printedBy}</span>
      </div>
    </section>
  )
}

function PrintLaboratoryResult({ bill, printedBy }: { bill: LaboratoryBill; printedBy: string }) {
  const payload = bill.payload as Record<string, unknown>
  const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : []

  return (
    <section className="print-area a4-report rounded-md border border-zinc-200 bg-white p-6 text-zinc-950">
      <header className="border-b border-zinc-200 pb-4">
        <p className="text-sm font-medium text-sky-600">AFZENDA</p>
        <h2 className="text-xl font-semibold">Mother and Child Health Care Center</h2>
        <p className="text-sm text-zinc-600">Laboratory result report</p>
      </header>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <p><strong>Date:</strong> {formatDate(bill.created_at)}</p>
        <p><strong>Printed by:</strong> {printedBy}</p>
        <p><strong>Patient:</strong> {billCustomerLabel(bill)}</p>
        <p><strong>Customer type:</strong> {bill.customer_type_label}</p>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-300 text-left">
            <th className="py-2">Test</th>
            <th className="py-2">Normal range</th>
            <th className="py-2">Unit</th>
            <th className="py-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="border-b border-zinc-100">
              <td className="py-2">{String(item.test_name ?? item.test ?? 'Test')}</td>
              <td className="py-2">{`${String(item.normal_range_from ?? '-')}${item.normal_range_to ? ` to ${String(item.normal_range_to)}` : ''}`}</td>
              <td className="py-2">{String(item.unit ?? '')}</td>
              <td className="py-2 font-medium">{String(item.result ?? '')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 border-t border-zinc-200 pt-4 text-sm">
        <p><strong>Laboratory total bill:</strong> {bill.total_amount}</p>
      </div>
    </section>
  )
}
