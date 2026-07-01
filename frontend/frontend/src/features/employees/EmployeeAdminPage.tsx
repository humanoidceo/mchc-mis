import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { Employee, PaginatedResponse } from '../../types/domain'

const emptyForm = {
  first_name: '',
  last_name: '',
  position: '',
  salary: '',
  join_date: '',
  national_id_card_number: '',
  email: '',
  mobile_number: '',
}

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiError) {
    if (caught.details && typeof caught.details === 'object') {
      return Object.values(caught.details as Record<string, unknown>)
        .flatMap((value) => Array.isArray(value) ? value.map(String) : [String(value)])
        .join(' ')
    }
    return caught.message
  }
  return fallback
}

export function EmployeeAdminPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadEmployees(currentPage = page, search = query) {
    const response = await apiFetch<PaginatedResponse<Employee>>(`/auth/employees/?page=${currentPage}&q=${encodeURIComponent(search)}`)
    setEmployees(response.results)
    setTotalCount(response.count)
  }

  useEffect(() => {
    void loadEmployees(page, query).catch(() => setError('Unable to load employees.'))
  }, [page, query])

  useEffect(() => {
    setPage(1)
  }, [query])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = new FormData()
      payload.append('first_name', form.first_name)
      payload.append('last_name', form.last_name)
      payload.append('position', form.position)
      payload.append('salary', form.salary)
      payload.append('join_date', form.join_date)
      payload.append('national_id_card_number', form.national_id_card_number)
      payload.append('email', form.email)
      payload.append('mobile_number', form.mobile_number)
      if (imageFile) {
        payload.append('image', imageFile)
      }
      await apiFetch<Employee>(editingId ? `/auth/employees/${editingId}/` : '/auth/employees/', {
        method: editingId ? 'PATCH' : 'POST',
        body: payload,
      })
      setForm(emptyForm)
      setImageFile(null)
      setEditingId(null)
      setShowForm(false)
      setNotice(editingId ? 'Employee updated.' : 'Employee created.')
      await loadEmployees(1, query)
      setPage(1)
    } catch (caught) {
      setError(errorMessage(caught, 'Unable to save employee.'))
    } finally {
      setSaving(false)
    }
  }

  function startEdit(employee: Employee) {
    setEditingId(employee.id)
    setShowForm(true)
    setImageFile(null)
    setForm({
      first_name: employee.first_name,
      last_name: employee.last_name,
      position: employee.position,
      salary: employee.salary,
      join_date: employee.join_date,
      national_id_card_number: employee.national_id_card_number,
      email: employee.email,
      mobile_number: employee.mobile_number,
    })
    setError('')
    setNotice('')
  }

  async function removeEmployee(employeeId: number) {
    setError('')
    setNotice('')
    try {
      await apiFetch(`/auth/employees/${employeeId}/`, { method: 'DELETE' })
      setNotice('Employee deleted.')
      await loadEmployees(page, query)
    } catch (caught) {
      setError(errorMessage(caught, 'Unable to delete employee.'))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title="Employees" subtitle="Maintain the list of clinic employees and their basic employment records." />
        <button className={buttonClassName} onClick={() => setShowForm((current) => !current)}>
          {showForm ? 'Close form' : 'Create employee'}
        </button>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      {showForm ? (
        <Panel>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="First name"><input className={inputClassName} value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} required /></Field>
              <Field label="Last name"><input className={inputClassName} value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} required /></Field>
              <Field label="Position"><input className={inputClassName} value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} required /></Field>
              <Field label="Salary"><input className={inputClassName} min="0" step="0.01" type="number" value={form.salary} onChange={(event) => setForm({ ...form, salary: event.target.value })} required /></Field>
              <Field label="Join date"><input className={inputClassName} type="date" value={form.join_date} onChange={(event) => setForm({ ...form, join_date: event.target.value })} required /></Field>
              <Field label="National ID card number"><input className={inputClassName} value={form.national_id_card_number} onChange={(event) => setForm({ ...form, national_id_card_number: event.target.value })} required /></Field>
              <Field label="Email address"><input className={inputClassName} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
              <Field label="Mobile number"><input className={inputClassName} value={form.mobile_number} onChange={(event) => setForm({ ...form, mobile_number: event.target.value })} /></Field>
              <Field label="Employee image"><input className={inputClassName} type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} /></Field>
            </div>
            <div className="flex gap-2">
              <button className={buttonClassName} disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update employee' : 'Save employee'}</button>
              <button className={ghostButtonClassName} type="button" onClick={() => { setForm(emptyForm); setImageFile(null); setEditingId(null); setShowForm(false) }}>Cancel</button>
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeader title="Employee list" subtitle="Search by employee name, position, national ID, email, or phone." />
          <label className="w-full max-w-sm">
            <span className="sr-only">Search employees</span>
            <input className={inputClassName} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employees" />
          </label>
        </div>

        <div className="mt-5 space-y-3">
          {employees.map((employee) => (
            <div key={employee.id} className="rounded border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
              <div className="flex flex-wrap items-start gap-4">
                <div className="h-20 w-20 overflow-hidden rounded-lg border border-sky-100 bg-slate-50">
                  {employee.image_url ? (
                    <img src={employee.image_url} alt={`${employee.first_name} ${employee.last_name}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">No image</div>
                  )}
                </div>
                <div className="grid flex-1 gap-2 md:grid-cols-2">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{employee.first_name} {employee.last_name}</p>
                    <p className="text-sm text-slate-500">{employee.position}</p>
                    <p className="mt-2 text-sm text-slate-700">Salary {employee.salary}</p>
                    <p className="text-sm text-slate-700">Joined {employee.join_date}</p>
                  </div>
                  <div className="text-sm text-slate-700">
                    <p>National ID: {employee.national_id_card_number}</p>
                    <p>Email: {employee.email || '-'}</p>
                    <p>Mobile: {employee.mobile_number || '-'}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className={ghostButtonClassName} onClick={() => startEdit(employee)}>Edit</button>
                  <button className={ghostButtonClassName} onClick={() => void removeEmployee(employee.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
          {!employees.length ? <p className="rounded border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-600">No employees found.</p> : null}
          <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
        </div>
      </Panel>
    </div>
  )
}
