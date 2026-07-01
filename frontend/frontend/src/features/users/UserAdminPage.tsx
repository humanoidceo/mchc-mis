import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { apiFetch } from '../../api/client'
import { buttonClassName, Field, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { PaginatedResponse, PermissionDefinition, RoleCode, RoleDefinition, User } from '../../types/domain'

type Catalog = {
  permissions: PermissionDefinition[]
  roles: RoleDefinition[]
}

const emptyUser = {
  username: '',
  password: '',
  first_name: '',
  last_name: '',
  email: '',
  role: 'receptionist' as RoleCode,
  phone: '',
  allowed_permissions: [] as string[],
  is_active: true,
}

export function UserAdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [catalog, setCatalog] = useState<Catalog>({ permissions: [], roles: [] })
  const [form, setForm] = useState(emptyUser)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)

  async function loadData(currentPage = page) {
    const [userData, catalogData] = await Promise.all([
      apiFetch<PaginatedResponse<User>>(`/auth/users/?page=${currentPage}`),
      apiFetch<Catalog>('/auth/permissions/'),
    ])
    setUsers(userData.results)
    setTotalUsers(userData.count)
    setCatalog(catalogData)
  }

  useEffect(() => {
    loadData(page).catch(() => setError('Unable to load users.'))
  }, [page])

  useEffect(() => {
    if (!editingId && catalog.permissions.length && form.allowed_permissions.length === 0) {
      setForm((current) => ({
        ...current,
        allowed_permissions: catalog.permissions
          .filter((permission) => permission.default_roles.includes(current.role))
          .map((permission) => permission.code),
      }))
    }
  }, [catalog.permissions, editingId, form.allowed_permissions.length])

  const groupedPermissions = useMemo(() => {
    return catalog.permissions.reduce<Record<string, PermissionDefinition[]>>((groups, permission) => {
      groups[permission.group] = [...(groups[permission.group] ?? []), permission]
      return groups
    }, {})
  }, [catalog.permissions])

  function defaultPermissionsForRole(role: RoleCode) {
    return catalog.permissions
      .filter((permission) => permission.default_roles.includes(role))
      .map((permission) => permission.code)
  }

  function resetForm() {
    setForm({
      ...emptyUser,
      allowed_permissions: defaultPermissionsForRole(emptyUser.role),
    })
  }

  function changeRole(role: RoleCode) {
    setForm({
      ...form,
      role,
      allowed_permissions: defaultPermissionsForRole(role),
    })
  }

  function togglePermission(code: string) {
    const hasPermission = form.allowed_permissions.includes(code)
    setForm({
      ...form,
      allowed_permissions: hasPermission
        ? form.allowed_permissions.filter((permission) => permission !== code)
        : [...form.allowed_permissions, code],
    })
  }

  function editUser(user: User) {
    setEditingId(user.id)
    setForm({
      username: user.username,
      password: '',
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: user.profile?.role ?? 'receptionist',
      phone: user.profile?.phone ?? '',
      allowed_permissions: user.profile?.allowed_permissions ?? [],
      is_active: user.is_active,
    })
  }

  async function deleteUser(userId: number) {
    setError('')
    try {
      await apiFetch(`/auth/users/${userId}/`, { method: 'DELETE' })
      await loadData(page)
    } catch {
      setError('Unable to delete user.')
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const payload = { ...form }
    if (!payload.password) {
      delete (payload as Partial<typeof payload>).password
    }

    try {
      if (editingId) {
        await apiFetch<User>(`/auth/users/${editingId}/`, { method: 'PATCH', body: JSON.stringify(payload) })
      } else {
        await apiFetch<User>('/auth/users/', { method: 'POST', body: JSON.stringify(payload) })
      }
      resetForm()
      setEditingId(null)
      await loadData(page)
    } catch {
      setError('Unable to save user. Check required fields and permissions.')
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Users and permissions" subtitle="Super admins can grant or revoke permissions using checkboxes." />
      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <Panel>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Username"><input className={inputClassName} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></Field>
            <Field label="Password"><input className={inputClassName} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" required={!editingId} /></Field>
            <Field label="First name"><input className={inputClassName} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></Field>
            <Field label="Last name"><input className={inputClassName} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></Field>
            <Field label="Email"><input className={inputClassName} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" /></Field>
            <Field label="Phone"><input className={inputClassName} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Role">
              <select className={inputClassName} value={form.role} onChange={(e) => changeRole(e.target.value as RoleCode)}>
                {catalog.roles.map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}
              </select>
            </Field>
            <label className="flex items-end gap-2 text-sm font-medium text-zinc-700">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Active
            </label>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {Object.entries(groupedPermissions).map(([group, permissions]) => (
              <div key={group} className="rounded border border-zinc-200 p-3">
                <p className="mb-2 text-sm font-semibold text-zinc-800">{group}</p>
                <div className="space-y-2">
                  {permissions.map((permission) => (
                    <label key={permission.code} className="flex gap-2 text-sm text-zinc-700">
                      <input type="checkbox" checked={form.allowed_permissions.includes(permission.code)} onChange={() => togglePermission(permission.code)} />
                      <span>{permission.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button className={buttonClassName}>{editingId ? 'Update user' : 'Create user'}</button>
            {editingId ? <button type="button" className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium" onClick={() => { setEditingId(null); resetForm() }}>Cancel</button> : null}
          </div>
        </form>
      </Panel>

      <Panel>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-zinc-200"><th className="py-2">User</th><th>Role</th><th>Status</th><th>Permissions</th><th></th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-zinc-100">
                  <td className="py-2">{user.username}</td>
                  <td>{user.profile?.role_label ?? 'No role'}</td>
                  <td>{user.is_active ? 'Active' : 'Inactive'}</td>
                  <td>{user.permissions.length}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button className="rounded border border-zinc-300 px-3 py-1 text-sm" onClick={() => editUser(user)}>Edit</button>
                      <button className="rounded border border-zinc-300 px-3 py-1 text-sm" onClick={() => void deleteUser(user.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls page={page} totalCount={totalUsers} onPageChange={setPage} />
      </Panel>
    </div>
  )
}
