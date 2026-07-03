import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { PaginatedResponse, PharmacyMedicine, PharmacySetting } from '../../types/domain'

type MedicineFormState = {
  name: string
  generic_name: string
  country_of_product: string
  production_date: string
  expiry_date: string
  quantity: string
  buy_price: string
  profit_percentage: string
}

const emptyMedicineForm: MedicineFormState = {
  name: '',
  generic_name: '',
  country_of_product: '',
  production_date: '',
  expiry_date: '',
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

function formatMoneyAfn(value: string | number): string {
  return `${formatMoney(value)} AFN`
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

function monthInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 7) : ''
}

function monthValueToDate(value: string): string | null {
  return value ? `${value}-01` : null
}

function normalizeMonthInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 6)
  if (digits.length <= 4) {
    return digits
  }
  return `${digits.slice(0, 4)}-${digits.slice(4)}`
}

function formatMonthValue(value: string | null | undefined): string {
  return value ? value.slice(0, 7) : '-'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function PharmacyMedicineStockSection({
  rutfOnly = false,
  familyPlanningOnly = false,
  expiredOnly = false,
  upcomingExpiredOnly = false,
}: {
  rutfOnly?: boolean
  familyPlanningOnly?: boolean
  expiredOnly?: boolean
  upcomingExpiredOnly?: boolean
}) {
  const [setting, setSetting] = useState<PharmacySetting>(emptySetting)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false

    async function loadSetting() {
      try {
        const data = await apiFetch<PharmacySetting>('/pharmacy/settings/')
        if (!ignore) {
          setSetting(data)
          setError('')
        }
      } catch {
        if (!ignore) setError('Unable to load pharmacy settings.')
      }
    }

    void loadSetting()
    return () => {
      ignore = true
    }
  }, [])

  return (
    <div className="space-y-4">
      {error ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <MedicineManager setting={setting} rutfOnly={rutfOnly} familyPlanningOnly={familyPlanningOnly} expiredOnly={expiredOnly} upcomingExpiredOnly={upcomingExpiredOnly} />
    </div>
  )
}

function MedicineManager({
  setting,
  rutfOnly = false,
  familyPlanningOnly = false,
  expiredOnly = false,
  upcomingExpiredOnly = false,
}: {
  setting: PharmacySetting
  rutfOnly?: boolean
  familyPlanningOnly?: boolean
  expiredOnly?: boolean
  upcomingExpiredOnly?: boolean
}) {
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
    setMedicines([])
    setTotalCount(0)
    setError('')
    setEditingId(null)
  }, [rutfOnly, familyPlanningOnly, expiredOnly, upcomingExpiredOnly])

  useEffect(() => {
    let ignore = false
    const querySuffix = `${rutfOnly ? '&rutf_only=1' : ''}${familyPlanningOnly ? '&family_planning_only=1' : ''}${expiredOnly ? '&expired_only=1' : ''}${upcomingExpiredOnly ? '&upcoming_expired_only=1' : ''}`

    async function loadMedicines() {
      setLoading(true)
      setError('')
      try {
        const response = await apiFetch<PaginatedResponse<PharmacyMedicine>>(`/pharmacy/medicines/?page=${page}&q=${encodeURIComponent(query)}${querySuffix}`)
        if (!ignore) {
          setMedicines(response.results)
          setTotalCount(response.count)
        }
      } catch {
        if (!ignore) {
          setMedicines([])
          setTotalCount(0)
          setError(familyPlanningOnly ? 'Unable to load family planning stock.' : rutfOnly ? 'Unable to load malnutrition stock.' : expiredOnly ? 'Unable to load expired medicines.' : upcomingExpiredOnly ? 'Unable to load upcoming expired medicines.' : 'Unable to load medicines.')
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
  }, [page, query, rutfOnly, familyPlanningOnly, expiredOnly, upcomingExpiredOnly])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const payload = familyPlanningOnly
        ? {
            name: form.name.trim(),
            generic_name: 'Family Planning',
            country_of_product: '',
            production_date: null,
            expiry_date: monthValueToDate(form.expiry_date),
            quantity: Number(form.quantity),
            buy_price: '0',
            profit_percentage: '0',
          }
        : rutfOnly
        ? {
            name: form.name.trim(),
            generic_name: 'RUTF',
            country_of_product: form.country_of_product.trim(),
            production_date: form.production_date || null,
            expiry_date: monthValueToDate(form.expiry_date),
            quantity: Number(form.quantity),
            buy_price: '0',
            profit_percentage: '0',
          }
        : {
            ...form,
            production_date: form.production_date || null,
            expiry_date: monthValueToDate(form.expiry_date),
            quantity: Number(form.quantity),
          }
      await apiFetch<PharmacyMedicine>(editingId ? `/pharmacy/medicines/${editingId}/` : '/pharmacy/medicines/', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      setEditingId(null)
      setForm({
        ...emptyMedicineForm,
        profit_percentage: setting.default_profit_percentage,
      })
      const response = await apiFetch<PaginatedResponse<PharmacyMedicine>>(`/pharmacy/medicines/?page=${page}&q=${encodeURIComponent(query)}${rutfOnly ? '&rutf_only=1' : ''}${familyPlanningOnly ? '&family_planning_only=1' : ''}${expiredOnly ? '&expired_only=1' : ''}${upcomingExpiredOnly ? '&upcoming_expired_only=1' : ''}`)
      setMedicines(response.results)
      setTotalCount(response.count)
    } catch (caught) {
      setError(describeApiError(caught, familyPlanningOnly ? 'Unable to save family planning stock.' : rutfOnly ? 'Unable to save malnutrition stock.' : expiredOnly ? 'Unable to save expired medicine.' : upcomingExpiredOnly ? 'Unable to save upcoming expired medicine.' : 'Unable to save medicine.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteMedicine(medicineId: number) {
    setError('')
    try {
      await apiFetch(`/pharmacy/medicines/${medicineId}/`, { method: 'DELETE' })
      const response = await apiFetch<PaginatedResponse<PharmacyMedicine>>(`/pharmacy/medicines/?page=${page}&q=${encodeURIComponent(query)}${rutfOnly ? '&rutf_only=1' : ''}${familyPlanningOnly ? '&family_planning_only=1' : ''}${expiredOnly ? '&expired_only=1' : ''}${upcomingExpiredOnly ? '&upcoming_expired_only=1' : ''}`)
      setMedicines(response.results)
      setTotalCount(response.count)
    } catch (caught) {
      setError(describeApiError(caught, familyPlanningOnly ? 'Unable to delete family planning stock.' : rutfOnly ? 'Unable to delete malnutrition stock.' : expiredOnly ? 'Unable to delete expired medicine.' : upcomingExpiredOnly ? 'Unable to delete upcoming expired medicine.' : 'Unable to delete medicine.'))
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeader
            title={familyPlanningOnly ? 'Family Planning Stock' : rutfOnly ? 'Malnutrition stock' : expiredOnly ? 'Expired medicines' : upcomingExpiredOnly ? 'Upcoming expired medicines' : 'Medicine stock'}
            subtitle={familyPlanningOnly ? 'Track family planning products with expiry control. Pagination is limited to 10 items per page.' : rutfOnly ? 'Manage the RUTF batches used for malnutrition orders. Approval deducts from the earliest expiry stock first.' : expiredOnly ? 'Review expired medicines, update their details, or remove them from stock. Pagination is limited to 10 items per page.' : upcomingExpiredOnly ? 'Review medicines that will expire within the coming 6 months, then edit or remove them before they become unusable. Pagination is limited to 10 items per page.' : 'Maintain accurate pricing, profit margin, and current quantity for each item.'}
          />
          <label className="w-full max-w-sm">
            <span className="sr-only">Search medicines</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className={inputClassName} placeholder={familyPlanningOnly ? 'Search family planning stock' : rutfOnly ? 'Search malnutrition stock' : expiredOnly ? 'Search expired medicines' : upcomingExpiredOnly ? 'Search upcoming expired medicines' : 'Search by medicine or generic name'} />
          </label>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-3 pr-4 font-medium">{rutfOnly || familyPlanningOnly ? 'Product name' : 'Medicine'}</th>
                <th className="pb-3 pr-4 font-medium">{rutfOnly ? 'Country' : 'Quantity'}</th>
                <th className="pb-3 pr-4 font-medium">{rutfOnly ? 'Produce date' : familyPlanningOnly ? 'Expiry date' : 'Buy'}</th>
                <th className="pb-3 pr-4 font-medium">{rutfOnly || familyPlanningOnly || expiredOnly || upcomingExpiredOnly ? (familyPlanningOnly ? 'Status' : 'Expiry date') : 'Sell'}</th>
                <th className="pb-3 pr-4 font-medium">{rutfOnly ? 'Quantity' : familyPlanningOnly ? 'Updated' : expiredOnly || upcomingExpiredOnly ? 'Sell' : 'Margin'}</th>
                <th className="pb-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-100">
              {medicines.map((medicine) => (
                <tr key={medicine.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-slate-900">{medicine.name}</p>
                    {!rutfOnly && !familyPlanningOnly ? <p className="text-xs text-slate-500">{medicine.generic_name || 'No generic name'}</p> : null}
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{rutfOnly ? (medicine.country_of_product || '-') : medicine.quantity}</td>
                  <td className="py-3 pr-4 text-slate-700">{rutfOnly ? (medicine.production_date || '-') : familyPlanningOnly ? formatMonthValue(medicine.expiry_date) : formatMoneyAfn(medicine.buy_price)}</td>
                  <td className="py-3 pr-4 text-slate-700">{rutfOnly ? formatMonthValue(medicine.expiry_date) : familyPlanningOnly ? medicine.stock_status : expiredOnly || upcomingExpiredOnly ? formatMonthValue(medicine.expiry_date) : formatMoneyAfn(medicine.sell_price)}</td>
                  <td className="py-3 pr-4 text-slate-700">{rutfOnly ? medicine.quantity : familyPlanningOnly ? formatDate(medicine.updated_at) : expiredOnly || upcomingExpiredOnly ? formatMoneyAfn(medicine.sell_price) : `${medicine.profit_percentage}%`}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className={ghostButtonClassName}
                        onClick={() => {
                          setEditingId(medicine.id)
                          setForm({
                            name: medicine.name,
                            generic_name: medicine.generic_name,
                            country_of_product: medicine.country_of_product || '',
                            production_date: medicine.production_date || '',
                            expiry_date: monthInputValue(medicine.expiry_date),
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
                  <td colSpan={6} className="py-8 text-center text-slate-500">{familyPlanningOnly ? 'No family planning stock entries match this search.' : rutfOnly ? 'No malnutrition stock entries match this search.' : expiredOnly ? 'No expired medicines match this search.' : upcomingExpiredOnly ? 'No upcoming expired medicines match this search.' : 'No medicines match this search.'}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
      </Panel>

      <Panel>
        <SectionHeader
          title={editingId ? (familyPlanningOnly ? 'Edit family planning stock' : rutfOnly ? 'Edit RUTF' : expiredOnly ? 'Edit expired medicine' : upcomingExpiredOnly ? 'Edit upcoming expired medicine' : 'Edit medicine') : (familyPlanningOnly ? 'Add family planning stock' : rutfOnly ? 'Add RUTF' : 'Add medicine')}
          subtitle={familyPlanningOnly ? 'Record the product name, quantity, and expiry month for each family planning item.' : rutfOnly ? 'Record each malnutrition stock batch with source country and dates.' : expiredOnly ? 'Update the expired medicine details or remove it from stock.' : upcomingExpiredOnly ? 'Update the medicines that will expire in the next 6 months or remove them from stock.' : 'Use the pharmacy default profit rate or override it for a specific item.'}
        />
        {error ? <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <Field label={rutfOnly || familyPlanningOnly ? 'Product name' : 'Medicine name'}>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClassName} required />
          </Field>
          {familyPlanningOnly ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Quantity">
                  <input value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className={inputClassName} min="0" type="number" required />
                </Field>
                <Field label="Expiry date">
                  <input
                    value={form.expiry_date}
                    onChange={(event) => setForm({ ...form, expiry_date: normalizeMonthInput(event.target.value) })}
                    className={inputClassName}
                    inputMode="numeric"
                    maxLength={7}
                    pattern="[0-9]{4}-[0-9]{2}"
                    placeholder="YYYY-MM"
                  />
                </Field>
              </div>
            </>
          ) : rutfOnly ? (
            <>
              <Field label="Country of product">
                <input value={form.country_of_product} onChange={(event) => setForm({ ...form, country_of_product: event.target.value })} className={inputClassName} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Expiry date">
                  <input
                    value={form.expiry_date}
                    onChange={(event) => setForm({ ...form, expiry_date: normalizeMonthInput(event.target.value) })}
                    className={inputClassName}
                    inputMode="numeric"
                    maxLength={7}
                    pattern="[0-9]{4}-[0-9]{2}"
                    placeholder="YYYY-MM"
                  />
                </Field>
              </div>
              <Field label="Quantity">
                <input value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className={inputClassName} min="0" type="number" required />
              </Field>
            </>
          ) : (
            <>
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
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Expiry date">
                  <input
                    value={form.expiry_date}
                    onChange={(event) => setForm({ ...form, expiry_date: normalizeMonthInput(event.target.value) })}
                    className={inputClassName}
                    inputMode="numeric"
                    maxLength={7}
                    pattern="[0-9]{4}-[0-9]{2}"
                    placeholder="YYYY-MM"
                  />
                </Field>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <button className={buttonClassName} disabled={submitting} type="submit">
              {submitting ? 'Saving...' : editingId ? (familyPlanningOnly ? 'Update family planning stock' : rutfOnly ? 'Update RUTF' : 'Update medicine') : (familyPlanningOnly ? 'Add family planning stock' : rutfOnly ? 'Add RUTF' : 'Add medicine')}
            </button>
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
