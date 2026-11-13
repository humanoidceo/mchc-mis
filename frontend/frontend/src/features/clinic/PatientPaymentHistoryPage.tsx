import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, ReceiptText, WalletCards } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { apiFetch } from '../../api/client'
import { PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { PaginatedResponse, Payment } from '../../types/domain'
import { formatReceiptAmount, formatReceiptDate } from './PrintDocument'

type PaymentHistoryResponse = PaginatedResponse<Payment> & {
  patient: {
    id: number
    registration_number: string
    full_name: string
    father_name: string
    mobile_number: string
  }
  from: string | null
  to: string | null
  total_amount: string
}

function paymentTypeLabel(payment: Payment): string {
  if (payment.payment_type === 'free') return 'Free'
  if (payment.payment_type === 'discount') return `${payment.discount_percentage}% discount`
  return 'Full payment'
}

export function PatientPaymentHistoryPage() {
  const navigate = useNavigate()
  const { patientId } = useParams<{ patientId: string }>()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PaymentHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadHistory = useCallback(async () => {
    if (!patientId || !/^\d+$/.test(patientId)) {
      setError('The selected patient is not valid.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      setData(await apiFetch<PaymentHistoryResponse>(`/payments/${patientId}/history/?${params.toString()}`))
    } catch {
      setError('Unable to load this patient’s payment history. Please check the date range and try again.')
    } finally {
      setLoading(false)
    }
  }, [fromDate, page, patientId, toDate])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  function changeFromDate(value: string) {
    setPage(1)
    setFromDate(value)
  }

  function changeToDate(value: string) {
    setPage(1)
    setToDate(value)
  }

  const patient = data?.patient

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Patient payment history" subtitle="Review every payment for one registered patient and filter it by date." />
        <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-800 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-sky-100" type="button" onClick={() => navigate('/payments')}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to bills</button>
      </div>

      <Panel>
        <div className="overflow-hidden rounded-[28px] border border-sky-100 bg-white shadow-[0_24px_65px_-38px_rgba(14,116,144,0.55)]">
          <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(186,230,253,0.72),transparent_34%),linear-gradient(135deg,#0f3c5d,#0e7490_55%,#0284c7)] px-5 py-5 text-white sm:px-7">
            <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full border border-white/20" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">Reception desk</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">Payment history</h2>
                <p className="mt-1 text-sm text-sky-100">{patient ? `${patient.full_name} · ${patient.registration_number}` : 'Loading registered patient details...'}</p>
              </div>
              <WalletCards className="h-10 w-10 text-cyan-100" aria-hidden="true" />
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {patient ? <div className="grid gap-3 rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#f0f9ff,#ffffff_60%,#ecfeff)] p-4 text-sm sm:grid-cols-3"><p><span className="block text-xs text-slate-500">Patient</span><strong className="text-slate-950">{patient.full_name}</strong></p><p><span className="block text-xs text-slate-500">Father name</span><strong className="text-slate-950">{patient.father_name || '—'}</strong></p><p><span className="block text-xs text-slate-500">Mobile number</span><strong className="text-slate-950">{patient.mobile_number || '—'}</strong></p></div> : null}

            <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
              <label className="min-w-48 flex-1"><span className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />From</span><input className="h-11 w-full rounded-xl border border-white bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" type="date" value={fromDate} max={toDate || undefined} onChange={(event) => changeFromDate(event.target.value)} /></label>
              <label className="min-w-48 flex-1"><span className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />To</span><input className="h-11 w-full rounded-xl border border-white bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100" type="date" value={toDate} min={fromDate || undefined} onChange={(event) => changeToDate(event.target.value)} /></label>
              <button className="inline-flex h-11 items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-800 shadow-sm transition hover:bg-sky-100 focus:outline-none focus:ring-4 focus:ring-sky-100" type="button" onClick={() => void loadHistory()}><ReceiptText className="h-4 w-4" aria-hidden="true" />Refresh</button>
            </div>

            {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Payments in selected period</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{data?.count ?? '—'}</p></div>
              <div className="rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 p-4 text-white shadow-lg shadow-sky-200"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-100">Total amount</p><p className="mt-2 text-3xl font-semibold tracking-tight">{data ? `${formatReceiptAmount(data.total_amount)} AFN` : '—'}</p></div>
            </div>
          </div>

          <div className="border-t border-sky-100 px-4 pb-4 pt-1 sm:px-6 sm:pb-6">
            <div className="overflow-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Date</th><th className="px-3 py-3">Department / service</th><th className="px-3 py-3">Payment option</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Amount</th></tr></thead>
                <tbody>
                  {data?.results.map((payment) => <tr key={payment.id} className="border-b border-slate-100 last:border-b-0"><td className="px-3 py-3 text-slate-600">{formatReceiptDate(payment.created_at)}</td><td className="px-3 py-3"><p className="font-medium text-slate-900">{payment.department || payment.service}</p><p className="text-xs text-slate-500">{payment.service}</p></td><td className="px-3 py-3 text-slate-700">{paymentTypeLabel(payment)}</td><td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${payment.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{payment.status}</span></td><td className="px-3 py-3 text-right font-semibold text-slate-950">{payment.payment_type === 'free' ? 'Free' : `${formatReceiptAmount(payment.amount)} AFN`}</td></tr>)}
                  {!loading && data && !data.results.length ? <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={5}>No payments were recorded in this date range.</td></tr> : null}
                  {loading ? <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={5}>Loading payment history...</td></tr> : null}
                </tbody>
              </table>
            </div>
            {data ? <PaginationControls page={page} totalCount={data.count} onPageChange={setPage} /> : null}
          </div>
        </div>
      </Panel>
    </div>
  )
}
