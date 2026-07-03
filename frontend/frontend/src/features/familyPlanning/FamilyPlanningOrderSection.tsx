import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, UIEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { ClinicalDocument, Medicine, PaginatedResponse, Patient, SearchResponse } from '../../types/domain'

type PatientSearchOption = Pick<Patient, 'id' | 'registration_number' | 'first_name' | 'last_name' | 'age' | 'phone'>
type FamilyPlanningMedicineOption = Pick<Medicine, 'id' | 'name' | 'current_stock' | 'unit'>
type FamilyPlanningDraftItem = {
  medicine: number
  medicine_name: string
  quantity: string
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

function familyPlanningStatus(document: ClinicalDocument): 'pending' | 'dispensed' {
  return asPayload(document).pharmacy_status === 'dispensed' ? 'dispensed' : 'pending'
}

function familyPlanningItems(document: ClinicalDocument): FamilyPlanningDraftItem[] {
  const items = asPayload(document).items
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    return [{
      medicine: Number(row.medicine || 0),
      medicine_name: String(row.medicine_name || ''),
      quantity: String(row.quantity || ''),
    }]
  })
}

export function FamilyPlanningOrderSection({
  title,
  subtitle,
  listTitle,
  listSubtitle,
  patientSearchPath,
  patientSearchPlaceholder,
}: {
  title: string
  subtitle: string
  listTitle: string
  listSubtitle: string
  patientSearchPath: string
  patientSearchPlaceholder: string
}) {
  const [documents, setDocuments] = useState<ClinicalDocument[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [filterText, setFilterText] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null)
  const [selectedPatientLabel, setSelectedPatientLabel] = useState('')
  const [selectedItemLabel, setSelectedItemLabel] = useState('')
  const [itemQuantity, setItemQuantity] = useState('')
  const [items, setItems] = useState<FamilyPlanningDraftItem[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadDocuments = useCallback(async (currentPage = page, search = filterText) => {
    const response = await apiFetch<PaginatedResponse<ClinicalDocument>>(`/documents/?document_type=family_planning&mine=1&page=${currentPage}&q=${encodeURIComponent(search)}`)
    setDocuments(response.results)
    setTotalCount(response.count)
  }, [filterText, page])

  useEffect(() => {
    setPage(1)
  }, [filterText])

  useEffect(() => {
    void loadDocuments(page, filterText).catch(() => setError('Unable to load family planning orders.'))
  }, [filterText, loadDocuments, page])

  function resetForm() {
    setSelectedPatientId(null)
    setSelectedPatientLabel('')
    setSelectedItemLabel('')
    setItemQuantity('')
    setItems([])
    setEditingId(null)
    setError('')
    setNotice('')
  }

  function addItem(medicine: FamilyPlanningMedicineOption | null) {
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
    setSelectedItemLabel('')
    setItemQuantity('')
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
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
      await apiFetch<ClinicalDocument>(editingId ? `/documents/${editingId}/` : '/documents/', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          patient: selectedPatientId,
          document_type: 'family_planning',
          title: 'Family planning order',
          total_amount: '0',
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
      setNotice(editingId ? 'Family planning order updated.' : 'Family planning order saved and sent to pharmacy.')
      resetForm()
      await loadDocuments(page, filterText)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to save family planning order.'))
    } finally {
      setSaving(false)
    }
  }

  function editDocument(document: ClinicalDocument) {
    if (familyPlanningStatus(document) === 'dispensed') {
      setError('Dispensed family planning orders cannot be edited.')
      return
    }
    setEditingId(document.id)
    setSelectedPatientId(document.patient)
    setSelectedPatientLabel(document.patient_name)
    setItems(familyPlanningItems(document))
    setSelectedItemLabel('')
    setItemQuantity('')
    setError('')
    setNotice('')
  }

  async function deleteDocument(documentId: number) {
    const target = documents.find((document) => document.id === documentId)
    if (target && familyPlanningStatus(target) === 'dispensed') {
      setError('Dispensed family planning orders cannot be deleted.')
      return
    }
    setError('')
    setNotice('')
    try {
      await apiFetch(`/documents/${documentId}/`, { method: 'DELETE' })
      if (editingId === documentId) {
        resetForm()
      }
      setNotice('Family planning order deleted.')
      await loadDocuments(page, filterText)
    } catch (caught) {
      setError(describeApiError(caught, 'Unable to delete family planning order.'))
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[26rem_minmax(0,1fr)]">
      <div className="xl:sticky xl:top-24 xl:self-start">
        <Panel>
          <SectionHeader title={title} subtitle={subtitle} />
          {error ? <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {notice ? <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <SearchCombo<PatientSearchOption>
              label="Patient"
              placeholder={patientSearchPlaceholder}
              searchPath={patientSearchPath}
              valueText={selectedPatientLabel}
              renderOption={(patient) => `${patient.registration_number} - ${patient.first_name} ${patient.last_name}${patient.age ? ` (${patient.age})` : ''}${patient.phone ? ` - ${patient.phone}` : ''}`}
              onSelect={(patient) => {
                setSelectedPatientId(patient.id)
                setSelectedPatientLabel(`${patient.registration_number} - ${patient.first_name} ${patient.last_name}`)
              }}
            />

            <FamilyPlanningItemPicker
              valueText={selectedItemLabel}
              itemQuantity={itemQuantity}
              onItemQuantityChange={setItemQuantity}
              onItemSelect={(medicine) => setSelectedItemLabel(medicine.name)}
              onAddItem={addItem}
            />

            <div className="rounded border border-sky-100 bg-sky-50/60 p-3">
              <p className="text-sm font-semibold text-slate-950">Selected items</p>
              <div className="mt-3 space-y-2">
                {items.map((item, index) => (
                  <div key={`${item.medicine}-${index}`} className="flex items-center justify-between gap-3 rounded border border-sky-100 bg-white px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-950">{item.medicine_name}</p>
                      <p className="text-slate-500">Qty: {item.quantity}</p>
                    </div>
                    <button
                      className={ghostButtonClassName}
                      type="button"
                      onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {!items.length ? <p className="text-sm text-slate-500">No family planning items added.</p> : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-sky-100 pt-2">
              <button className={buttonClassName} disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update family planning order' : 'Save family planning order'}</button>
              {(editingId || items.length || selectedPatientId) ? <button className={ghostButtonClassName} type="button" onClick={resetForm}>Reset</button> : null}
            </div>
          </form>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sky-100 pb-4">
          <SectionHeader title={listTitle} subtitle={listSubtitle} />
          <label className="w-full max-w-sm">
            <span className="sr-only">Search family planning orders</span>
            <input className={inputClassName} value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="Search by patient or order" />
          </label>
        </div>

        <div className="mt-5 xl:max-h-[calc(100vh-16rem)] xl:overflow-y-auto xl:pr-1">
          <div className="grid gap-3 lg:grid-cols-2">
            {documents.map((document) => {
              const status = familyPlanningStatus(document)
              const rows = familyPlanningItems(document)
              return (
                <div key={document.id} className="rounded border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-950">{document.patient_name}</p>
                      <p className="text-sm text-slate-500">{document.title}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{new Date(document.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${status === 'dispensed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {status === 'dispensed' ? 'Dispensed by pharmacy' : 'Pending pharmacy'}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    {rows.map((row) => <p key={`${row.medicine}-${row.medicine_name}`}><strong>{row.medicine_name}</strong> x {row.quantity}</p>)}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {status !== 'dispensed' ? <button className={ghostButtonClassName} onClick={() => editDocument(document)}>Edit</button> : null}
                    {status !== 'dispensed' ? <button className={ghostButtonClassName} onClick={() => void deleteDocument(document.id)}>Delete</button> : null}
                  </div>
                </div>
              )
            })}
          </div>
          {!documents.length ? <p className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-600">No family planning orders found.</p> : null}
        </div>

        <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
      </Panel>
    </div>
  )
}

function FamilyPlanningItemPicker({
  valueText,
  itemQuantity,
  onItemQuantityChange,
  onItemSelect,
  onAddItem,
}: {
  valueText: string
  itemQuantity: string
  onItemQuantityChange: (value: string) => void
  onItemSelect: (medicine: FamilyPlanningMedicineOption) => void
  onAddItem: (medicine: FamilyPlanningMedicineOption | null) => void
}) {
  const [selectedMedicine, setSelectedMedicine] = useState<FamilyPlanningMedicineOption | null>(null)

  useEffect(() => {
    if (!valueText) {
      setSelectedMedicine(null)
    }
  }, [valueText])

  return (
    <div className="grid gap-3 lg:grid-cols-[1.2fr_0.45fr_auto] lg:items-end">
      <SearchCombo<FamilyPlanningMedicineOption>
        label="Family planning item"
        placeholder="Search family planning stock"
        searchPath="/medicines/search/"
        extraParams="family_planning_only=1"
        valueText={valueText}
        renderOption={(medicine) => `${medicine.name} - stock ${medicine.current_stock}`}
        onSelect={(medicine) => {
          setSelectedMedicine(medicine)
          onItemSelect(medicine)
        }}
      />
      <Field label="Quantity">
        <input className={inputClassName} min="1" type="number" value={itemQuantity} onChange={(event) => onItemQuantityChange(event.target.value)} />
      </Field>
      <button className={buttonClassName} type="button" onClick={() => onAddItem(selectedMedicine)}>Add item</button>
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
      const suffix = extraParams ? `&${extraParams}` : ''
      const response = await apiFetch<SearchResponse<T>>(`${searchPath}?q=${encodeURIComponent(search)}&offset=${offset}${suffix}`)
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
