import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, Panel, SectionHeader } from '../../components/ui'
import type { ExpenseCategory, ExpenseSubcategory, PaginatedResponse } from '../../types/domain'

type CategoryForm = {
  id: number | null
  title_dari: string
  title_pashto: string
  title_english: string
  subcategories: ExpenseSubcategory[]
}

const emptySubcategory = (): ExpenseSubcategory => ({
  code: '',
  title_dari: '',
  title_pashto: '',
  title_english: '',
})

const emptyForm = (): CategoryForm => ({
  id: null,
  title_dari: '',
  title_pashto: '',
  title_english: '',
  subcategories: [emptySubcategory()],
})

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiError) {
    if (caught.details && typeof caught.details === 'object') {
      const detail = Object.values(caught.details as Record<string, unknown>)
        .flatMap((value) => Array.isArray(value) ? value.map(String) : [String(value)])
        .join(' ')
      return detail || caught.message
    }
    return caught.message
  }
  return fallback
}

function subcategoryTitle(subcategory: ExpenseSubcategory): string {
  return subcategory.display_title || subcategory.title_english || subcategory.title_dari || subcategory.title_pashto || subcategory.code
}

function categoryTitle(category: Pick<ExpenseCategory, 'display_title' | 'title_dari' | 'title_pashto' | 'title_english'>): string {
  return category.display_title || category.title_english || category.title_dari || category.title_pashto
}

export function ExpenseCategoriesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<CategoryForm>(emptyForm)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadCategories() {
    const response = await apiFetch<PaginatedResponse<ExpenseCategory>>('/expense-categories/')
    setCategories(response.results)
  }

  useEffect(() => {
    void loadCategories()
      .catch((caught) => setError(errorMessage(caught, 'Unable to load expense categories.')))
      .finally(() => setLoading(false))
  }, [])

  function openCreateModal() {
    setError('')
    setForm(emptyForm())
    setModalOpen(true)
  }

  function openEditModal(category: ExpenseCategory) {
    setError('')
    setForm({
      id: category.id,
      title_dari: category.title_dari,
      title_pashto: category.title_pashto,
      title_english: category.title_english,
      subcategories: category.subcategories.map((subcategory) => ({
        id: subcategory.id,
        code: subcategory.code,
        title_dari: subcategory.title_dari,
        title_pashto: subcategory.title_pashto,
        title_english: subcategory.title_english,
      })),
    })
    setModalOpen(true)
  }

  function updateSubcategory(index: number, values: Partial<ExpenseSubcategory>) {
    setForm((current) => ({
      ...current,
      subcategories: current.subcategories.map((subcategory, currentIndex) => currentIndex === index ? { ...subcategory, ...values } : subcategory),
    }))
  }

  function removeSubcategory(index: number) {
    setForm((current) => ({
      ...current,
      subcategories: current.subcategories.filter((_subcategory, currentIndex) => currentIndex !== index),
    }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!form.title_dari.trim() && !form.title_pashto.trim() && !form.title_english.trim()) {
      setError('Provide a category title in at least one language.')
      return
    }
    if (!form.subcategories.length) {
      setError('Add at least one subcategory.')
      return
    }
    if (form.subcategories.some((subcategory) => !subcategory.code.trim())) {
      setError('Every subcategory needs a unique code.')
      return
    }
    if (form.subcategories.some((subcategory) => !subcategory.title_dari.trim() && !subcategory.title_pashto.trim() && !subcategory.title_english.trim())) {
      setError('Every subcategory needs a title in at least one language.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title_dari: form.title_dari.trim(),
        title_pashto: form.title_pashto.trim(),
        title_english: form.title_english.trim(),
        subcategories: form.subcategories.map((subcategory) => ({
          ...(subcategory.id ? { id: subcategory.id } : {}),
          code: subcategory.code.trim(),
          title_dari: subcategory.title_dari.trim(),
          title_pashto: subcategory.title_pashto.trim(),
          title_english: subcategory.title_english.trim(),
        })),
      }
      await apiFetch<ExpenseCategory>(
        form.id ? `/expense-categories/${form.id}/` : '/expense-categories/',
        {
          method: form.id ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
      )
      setModalOpen(false)
      setNotice(form.id ? 'Expense category updated.' : 'Expense category created.')
      await loadCategories()
    } catch (caught) {
      setError(errorMessage(caught, 'Unable to save expense category.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title="Expense category" subtitle="Create categories and their expense subcategories." />
        <button className={buttonClassName} type="button" onClick={openCreateModal}>Add category</button>
      </div>
      {error && !modalOpen ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <Panel>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-sky-100 text-xs uppercase tracking-wide text-zinc-500">
              <tr><th className="px-3 py-2">ID</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Subcategories</th><th className="px-3 py-2">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-sky-100">
              {categories.map((category) => (
                <tr key={category.id}>
                  <td className="px-3 py-3 font-medium text-slate-900">{category.id}</td>
                  <td className="px-3 py-3 font-medium text-slate-900">{categoryTitle(category)}</td>
                  <td className="px-3 py-3 text-slate-700">
                    <div className="flex flex-wrap gap-2">
                      {category.subcategories.map((subcategory) => (
                        <span key={subcategory.id} className="rounded bg-sky-50 px-2 py-1 text-xs"><strong>{subcategory.code}</strong> — {subcategoryTitle(subcategory)}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3"><button className={ghostButtonClassName} type="button" onClick={() => openEditModal(category)}>Edit</button></td>
                </tr>
              ))}
              {loading ? <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">Loading expense categories...</td></tr> : null}
              {!loading && !categories.length ? <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">No expense categories have been created yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Panel>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="expense-category-modal-title">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="expense-category-modal-title" className="text-xl font-semibold text-slate-950">{form.id ? 'Edit expense category' : 'Add expense category'}</h2>
                <p className="mt-1 text-sm text-zinc-600">Give the category a title in one or more languages, then add one or more subcategories.</p>
              </div>
              <button className={ghostButtonClassName} type="button" onClick={() => setModalOpen(false)} disabled={saving}>Close</button>
            </div>
            {error ? <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <form className="mt-5 space-y-5" onSubmit={submit}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="ID">
                  <input className={inputClassName} value={form.id ? String(form.id) : 'Assigned automatically'} disabled />
                </Field>
                <Field label="Title (Dari)"><input className={inputClassName} dir="rtl" value={form.title_dari} onChange={(event) => setForm((current) => ({ ...current, title_dari: event.target.value }))} disabled={saving} /></Field>
                <Field label="Title (Pashto)"><input className={inputClassName} dir="rtl" value={form.title_pashto} onChange={(event) => setForm((current) => ({ ...current, title_pashto: event.target.value }))} disabled={saving} /></Field>
                <Field label="Title (English)"><input className={inputClassName} value={form.title_english} onChange={(event) => setForm((current) => ({ ...current, title_english: event.target.value }))} disabled={saving} /></Field>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="font-semibold text-slate-950">Subcategories</h3><p className="text-sm text-zinc-600">Code must be unique. Give each subcategory a title in one or more languages.</p></div>
                  <button className={ghostButtonClassName} type="button" onClick={() => setForm((current) => ({ ...current, subcategories: [...current.subcategories, emptySubcategory()] }))} disabled={saving}>Add subcategory</button>
                </div>
                {form.subcategories.map((subcategory, index) => (
                  <div key={subcategory.id ?? `new-${index}`} className="rounded border border-sky-100 bg-sky-50/50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-900">Subcategory {index + 1}</p>{form.subcategories.length > 1 ? <button className="text-sm font-medium text-red-700 hover:underline" type="button" onClick={() => removeSubcategory(index)} disabled={saving}>Remove</button> : null}</div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <Field label="Code"><input className={inputClassName} value={subcategory.code} onChange={(event) => updateSubcategory(index, { code: event.target.value })} placeholder="Unique code" disabled={saving} required /></Field>
                      <Field label="Title (Dari)"><input className={inputClassName} dir="rtl" value={subcategory.title_dari} onChange={(event) => updateSubcategory(index, { title_dari: event.target.value })} disabled={saving} /></Field>
                      <Field label="Title (Pashto)"><input className={inputClassName} dir="rtl" value={subcategory.title_pashto} onChange={(event) => updateSubcategory(index, { title_pashto: event.target.value })} disabled={saving} /></Field>
                      <Field label="Title (English)"><input className={inputClassName} value={subcategory.title_english} onChange={(event) => updateSubcategory(index, { title_english: event.target.value })} disabled={saving} /></Field>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap justify-end gap-2"><button className={ghostButtonClassName} type="button" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button><button className={buttonClassName} disabled={saving}>{saving ? 'Saving...' : form.id ? 'Save changes' : 'Create category'}</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
