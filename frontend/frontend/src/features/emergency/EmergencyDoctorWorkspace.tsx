import { useEffect, useState } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { Field, ghostButtonClassName, inputClassName, Panel, SectionHeader } from '../../components/ui'
import type { EmergencyDoctorDashboardStats } from '../../types/domain'

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatAfn(value: string): string {
  return `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0))} AFN`
}

function errorMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : 'Unable to load the Emergency dashboard.'
}

const emptyReport: EmergencyDoctorDashboardStats = {
  period: 'monthly',
  period_label: 'Monthly',
  patients: 0,
  total_amount: '0.00',
  services: [],
}

export function EmergencyDoctorWorkspace() {
  const [period, setPeriod] = useState<EmergencyDoctorDashboardStats['period']>('monthly')
  const [fromDate, setFromDate] = useState(todayDateInputValue)
  const [toDate, setToDate] = useState(todayDateInputValue)
  const [report, setReport] = useState<EmergencyDoctorDashboardStats>(emptyReport)
  const [error, setError] = useState('')

  async function loadReport() {
    if (period === 'custom' && (!fromDate || !toDate || fromDate > toDate)) {
      setError('Choose a valid From and To date range.')
      return
    }
    try {
      const params = new URLSearchParams({ period })
      if (period === 'custom') {
        params.set('from', fromDate)
        params.set('to', toDate)
      }
      setReport(await apiFetch<EmergencyDoctorDashboardStats>(`/emergency/dashboard/?${params.toString()}`))
      setError('')
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  useEffect(() => {
    void loadReport()
  }, [period, fromDate, toDate])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title="Emergency dashboard" subtitle="Emergency patients and collected service fees for the selected period." />
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Period">
            <select className={inputClassName} value={period} onChange={(event) => setPeriod(event.target.value as EmergencyDoctorDashboardStats['period'])}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          {period === 'custom' ? <>
            <Field label="From"><input className={inputClassName} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></Field>
            <Field label="To"><input className={inputClassName} type="date" min={fromDate} value={toDate} onChange={(event) => setToDate(event.target.value)} /></Field>
          </> : null}
          <button className={ghostButtonClassName} onClick={() => void loadReport()}>Refresh</button>
        </div>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-rose-100 bg-rose-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Emergency patients</p>
          <p className="mt-3 text-4xl font-semibold text-slate-950">{report.patients}</p>
          <p className="mt-2 text-sm text-slate-600">Distinct patients registered in Emergency.</p>
        </div>
        <div className="rounded-md border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Total money</p>
          <p className="mt-3 text-4xl font-semibold text-slate-950">{formatAfn(report.total_amount)}</p>
          <p className="mt-2 text-sm text-slate-600">Collected final amount from Emergency services.</p>
        </div>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-950">Emergency services</p>
          <p className="text-xs font-medium text-zinc-500">{report.period_label}</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {report.services.map((service) => (
            <div key={service.service} className="rounded border border-rose-100 bg-white p-4 shadow-sm shadow-rose-50">
              <p className="text-sm font-semibold text-slate-950">{service.label}</p>
              <p className="mt-3 text-3xl font-semibold text-rose-700">{service.patients}</p>
              <p className="mt-1 text-xs font-medium text-zinc-500">patient(s)</p>
              <p className="mt-3 border-t border-rose-100 pt-3 text-sm font-semibold text-emerald-700">{formatAfn(service.amount)}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
