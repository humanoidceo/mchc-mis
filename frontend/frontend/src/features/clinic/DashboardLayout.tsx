import { NavLink, Route, Routes, Navigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { UserAdminPage } from '../users/UserAdminPage'
import { ClinicWorkspace } from './ClinicWorkspace'
import { SectionHeader } from '../../components/ui'

const links = [
  { to: '/dashboard', label: 'Dashboard', permission: null },
  { to: '/patients', label: 'Patients', permission: 'patients.view' },
  { to: '/payments', label: 'Payments', permission: 'payments.view' },
  { to: '/documents', label: 'Clinical documents', permission: null },
  { to: '/stock', label: 'Medicine stock', permission: 'stock.manage' },
  { to: '/users', label: 'Users', permission: 'users.manage' },
]

export function DashboardLayout() {
  const { user, logout, hasPermission } = useAuth()
  const visibleLinks = links.filter((link) => !link.permission || hasPermission(link.permission))

  return (
    <div className="min-h-screen bg-sky-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-sky-100 bg-white p-4 shadow-sm shadow-sky-100 lg:block">
        <div className="mb-6">
          <p className="text-sm font-semibold text-sky-600">MCHC</p>
          <p className="text-xs text-zinc-500">Management Information System</p>
        </div>
        <nav className="space-y-1">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm font-medium ${isActive ? 'bg-pink-50 text-pink-700' : 'text-slate-700 hover:bg-sky-50'}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-10 border-b border-sky-100 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{user?.first_name || user?.username}</p>
              <p className="text-xs text-zinc-500">{user?.profile?.role_label ?? 'Staff'}</p>
            </div>
            <button onClick={logout} className="rounded border border-pink-200 bg-white px-3 py-2 text-sm font-medium hover:bg-pink-50">Logout</button>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">
          <Routes>
            <Route path="/dashboard" element={<ClinicWorkspace view="dashboard" />} />
            <Route path="/patients" element={<ClinicWorkspace view="patients" />} />
            <Route path="/payments" element={<ClinicWorkspace view="payments" />} />
            <Route path="/documents" element={<ClinicWorkspace view="documents" />} />
            <Route path="/stock" element={<ClinicWorkspace view="stock" />} />
            <Route path="/users" element={<UserAdminPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<SectionHeader title="Not found" subtitle="The requested MIS page does not exist." />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
