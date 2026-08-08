import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, Panel, SectionHeader } from '../../components/ui'
import type { DoctorDepartmentAssignment, DoctorOption, PaginatedResponse } from '../../types/domain'

const departments = ['Midwifery', 'Pediatrics', 'OPD', 'Gynecology', 'Emergency', 'Laboratory', 'Ultrasound', 'Vaccination', 'Malnutrition']

function errorMessage(caught: unknown, fallback: string) {
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

export function DoctorDepartmentPage() {
  const [assignments, setAssignments] = useState<DoctorDepartmentAssignment[]>([])
  const [doctorOptions, setDoctorOptions] = useState<DoctorOption[]>([])
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorOption | null>(null)
  const [doctorSelectorOpen, setDoctorSelectorOpen] = useState(false)
  const [doctorSearch, setDoctorSearch] = useState('')
  const [doctorPage, setDoctorPage] = useState(1)
  const [doctorHasNextPage, setDoctorHasNextPage] = useState(false)
  const [doctorOptionsLoading, setDoctorOptionsLoading] = useState(false)
  const [department, setDepartment] = useState(departments[0])
  const [editingDepartments, setEditingDepartments] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const searchRequestRef = useRef(0)

  async function loadAssignments() {
    const assignmentResponse = await apiFetch<PaginatedResponse<DoctorDepartmentAssignment>>('/doctor-departments/?page_size=100')
    setAssignments(assignmentResponse.results)
    setEditingDepartments(Object.fromEntries(assignmentResponse.results.map((assignment) => [assignment.id, assignment.department])))
  }

  async function loadDoctorOptions(currentPage: number, query: string, append = false) {
    const requestNumber = searchRequestRef.current + 1
    searchRequestRef.current = requestNumber
    setDoctorOptionsLoading(true)
    try {
      const response = await apiFetch<PaginatedResponse<DoctorOption>>(`/doctor-departments/available-doctors/?page=${currentPage}&q=${encodeURIComponent(query)}`)
      if (requestNumber !== searchRequestRef.current) return
      setDoctorOptions((current) => append ? [...current, ...response.results] : response.results)
      setDoctorPage(currentPage)
      setDoctorHasNextPage(Boolean(response.next))
    } finally {
      if (requestNumber === searchRequestRef.current) setDoctorOptionsLoading(false)
    }
  }

  useEffect(() => {
    void loadAssignments()
      .catch((caught) => setError(errorMessage(caught, 'Unable to load doctor departments.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    searchRequestRef.current += 1
    setDoctorOptions([])
    setDoctorHasNextPage(false)
    const timer = window.setTimeout(() => {
      void loadDoctorOptions(1, doctorSearch)
        .catch((caught) => setError(errorMessage(caught, 'Unable to load eligible accounts.')))
    }, 200)
    return () => window.clearTimeout(timer)
  }, [doctorSearch])

  function loadMoreDoctorOptions() {
    if (doctorOptionsLoading || !doctorHasNextPage) return
    void loadDoctorOptions(doctorPage + 1, doctorSearch, true)
      .catch((caught) => setError(errorMessage(caught, 'Unable to load more eligible accounts.')))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedDoctor) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await apiFetch<DoctorDepartmentAssignment>('/doctor-departments/', {
        method: 'POST',
        body: JSON.stringify({ doctor: selectedDoctor.id, department }),
      })
      setSelectedDoctor(null)
      setNotice('Clinical staff member assigned to the department.')
      await loadAssignments()
    } catch (caught) {
      setError(errorMessage(caught, 'Unable to assign doctor.'))
    } finally {
      setSaving(false)
    }
  }

  async function saveDepartment(assignment: DoctorDepartmentAssignment) {
    const nextDepartment = editingDepartments[assignment.id] || assignment.department
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await apiFetch<DoctorDepartmentAssignment>(`/doctor-departments/${assignment.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ department: nextDepartment }),
      })
      setNotice('Doctor department updated.')
      await loadAssignments()
    } catch (caught) {
      setError(errorMessage(caught, 'Unable to update doctor department.'))
    } finally {
      setSaving(false)
    }
  }

  async function removeAssignment(assignment: DoctorDepartmentAssignment) {
    if (!window.confirm(`Remove ${assignment.doctor_name} from ${assignment.department}?`)) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await apiFetch(`/doctor-departments/${assignment.id}/`, { method: 'DELETE' })
      setNotice('Doctor department assignment removed.')
      await loadAssignments()
    } catch (caught) {
      setError(errorMessage(caught, 'Unable to remove doctor department.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Doctor departments" subtitle="Assign active Doctor, Midwife, and Gynecologist accounts to the department where they work." />
      {error ? <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <Panel>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-3 md:items-start">
          <Field label="Clinical staff account">
            <div className="space-y-2">
              <input
                className={inputClassName}
                value={doctorSearch}
                onChange={(event) => {
                  setDoctorSearch(event.target.value)
                  setDoctorPage(1)
                  setDoctorSelectorOpen(true)
                }}
                onFocus={() => setDoctorSelectorOpen(true)}
                onClick={() => setDoctorSelectorOpen(true)}
                placeholder="Search name or username"
                disabled={saving}
                role="combobox"
                aria-expanded={doctorSelectorOpen}
                aria-controls="clinical-staff-options"
              />
              {selectedDoctor ? (
                <div className="flex items-center justify-between gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <span>Selected: {selectedDoctor.username}</span>
                  <button type="button" className="text-xs font-medium underline" onClick={() => { setSelectedDoctor(null); setDoctorSelectorOpen(true) }} disabled={saving}>Change</button>
                </div>
              ) : null}
              {doctorSelectorOpen ? <div
                id="clinical-staff-options"
                role="listbox"
                className="max-h-40 overflow-y-auto rounded border border-sky-100 bg-white"
                onScroll={(event) => {
                  const list = event.currentTarget
                  if (list.scrollHeight - list.scrollTop - list.clientHeight < 24) loadMoreDoctorOptions()
                }}
              >
                {doctorOptionsLoading ? <p className="px-3 py-2 text-sm text-zinc-500">Searching accounts...</p> : null}
                {!doctorOptionsLoading && doctorOptions.map((doctor) => (
                  <button
                    key={doctor.id}
                    type="button"
                    role="option"
                    aria-selected={selectedDoctor?.id === doctor.id}
                    className={`flex w-full items-center justify-between gap-3 border-b border-sky-50 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-sky-50 ${selectedDoctor?.id === doctor.id ? 'bg-sky-50' : ''}`}
                    onClick={() => {
                      setSelectedDoctor(doctor)
                      setDoctorSelectorOpen(false)
                    }}
                    disabled={saving}
                  >
                    <span className="font-medium text-slate-900">{doctor.username}</span>
                  </button>
                ))}
                {!doctorOptionsLoading && !doctorOptions.length ? <p className="px-3 py-2 text-sm text-zinc-500">No eligible accounts found.</p> : null}
                {doctorOptionsLoading && doctorOptions.length ? <p className="px-3 py-2 text-sm text-zinc-500">Loading the next 5 accounts...</p> : null}
              </div>
              : null}
              {doctorSelectorOpen ? <p className="text-xs text-zinc-500">Scroll for the next 5 accounts.</p> : null}
            </div>
          </Field>
          <Field label="Department">
            <select className={inputClassName} value={department} onChange={(event) => setDepartment(event.target.value)} disabled={saving}>
              {departments.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <button className={buttonClassName} disabled={saving || !selectedDoctor}>{saving ? 'Saving...' : 'Assign account'}</button>
        </form>
      </Panel>

      <Panel>
        <h2 className="text-base font-semibold text-slate-900">Current assignments</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-sky-100 text-xs uppercase tracking-wide text-zinc-500">
              <tr><th className="px-3 py-2">Clinical staff</th><th className="px-3 py-2">Username</th><th className="px-3 py-2">Department</th><th className="px-3 py-2">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-sky-100">
              {assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td className="px-3 py-3 font-medium text-slate-900">{assignment.doctor_name}</td>
                  <td className="px-3 py-3 text-zinc-600">{assignment.doctor_username}</td>
                  <td className="px-3 py-3">
                    <select className={inputClassName} value={editingDepartments[assignment.id] ?? assignment.department} onChange={(event) => setEditingDepartments({ ...editingDepartments, [assignment.id]: event.target.value })} disabled={saving}>
                      {departments.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className={buttonClassName} onClick={() => void saveDepartment(assignment)} disabled={saving}>Save</button>
                      <button className={ghostButtonClassName} onClick={() => void removeAssignment(assignment)} disabled={saving}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !assignments.length ? <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">No clinical staff accounts have been assigned to a department yet.</td></tr> : null}
              {loading ? <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">Loading doctor departments...</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
