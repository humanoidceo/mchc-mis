import { useEffect, useState } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { Field, ghostButtonClassName, inputClassName, Panel, SectionHeader } from '../../components/ui'
import type { EmergencyServicePrice } from '../../types/domain'

function errorMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : 'Unable to save the Emergency service price.'
}

export function EmergencyServicePricesPage() {
  const [prices, setPrices] = useState<EmergencyServicePrice[]>([])
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    void apiFetch<EmergencyServicePrice[]>('/emergency/service-prices/')
      .then((items) => {
        if (cancelled) return
        setPrices(items)
        setDrafts(Object.fromEntries(items.map((item) => [item.id, item.price])))
        setError('')
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  async function savePrice(price: EmergencyServicePrice) {
    const value = (drafts[price.id] ?? '').trim()
    const numericValue = Number(value)
    if (!value || !Number.isFinite(numericValue) || numericValue < 0) {
      setError('Enter a valid price of zero or more.')
      return
    }
    setSavingId(price.id)
    setError('')
    setNotice('')
    try {
      const saved = await apiFetch<EmergencyServicePrice>(`/emergency/service-prices/${price.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ price: value }),
      })
      setPrices((items) => items.map((item) => item.id === saved.id ? saved : item))
      setDrafts((current) => ({ ...current, [saved.id]: saved.price }))
      setNotice(`${saved.label} price saved.`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Emergency services prices" subtitle="Set the amount automatically used when reception registers each Emergency service." />
      {error ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
      <Panel>
        <p className="text-sm text-zinc-600">Prices are in AFN. A price change affects new or edited Emergency bills only; existing bills keep their recorded fee.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {prices.map((price) => (
            <div key={price.id} className="rounded-xl border border-rose-100 bg-rose-50/50 p-4">
              <p className="font-semibold text-slate-950">{price.label}</p>
              <div className="mt-4 flex items-end gap-2">
                <div className="min-w-0 flex-1"><Field label="Price (AFN)"><input className={inputClassName} type="number" min="0" step="0.01" inputMode="decimal" value={drafts[price.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [price.id]: event.target.value }))} /></Field></div>
                <button className={ghostButtonClassName} onClick={() => void savePrice(price)} disabled={savingId === price.id}>{savingId === price.id ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          ))}
          {loading ? <p className="text-sm text-zinc-500">Loading service prices…</p> : null}
        </div>
      </Panel>
    </div>
  )
}
