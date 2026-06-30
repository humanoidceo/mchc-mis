import { Navigate, NavLink, Route, Routes } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { SectionHeader } from '../../components/ui'
import { PharmacyWorkspace } from './PharmacyWorkspace'

const links = [
  { to: '/pharmacy/dashboard', label: 'Dashboard' },
  { to: '/pharmacy/medicines', label: 'Medicines' },
  { to: '/pharmacy/low-stock', label: 'Low stock' },
  { to: '/pharmacy/sales', label: 'Billing' },
  { to: '/pharmacy/settings', label: 'Settings' },
]

export function PharmacyDashboardLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-sky-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-sky-100 bg-white p-4 shadow-sm shadow-sky-100 lg:block">
        <div className="mb-6">
          <p className="text-sm font-semibold text-sky-600">MCHC</p>
          <p className="text-xs text-zinc-500">Management Information System</p>
        </div>
        <nav className="space-y-1">
          {links.map((link) => (
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
            <Route path="/pharmacy" element={<Navigate to="/pharmacy/dashboard" replace />} />
            <Route path="/pharmacy/dashboard" element={<PharmacyWorkspace view="dashboard" />} />
            <Route path="/pharmacy/medicines" element={<PharmacyWorkspace view="medicines" />} />
            <Route path="/pharmacy/low-stock" element={<PharmacyWorkspace view="low-stock" />} />
            <Route path="/pharmacy/sales" element={<PharmacyWorkspace view="sales" />} />
            <Route path="/pharmacy/settings" element={<PharmacyWorkspace view="settings" />} />
            <Route path="/" element={<Navigate to="/pharmacy/dashboard" replace />} />
            <Route path="*" element={<SectionHeader title="Not found" subtitle="The requested pharmacy page does not exist." />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
