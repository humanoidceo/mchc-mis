import { useState } from 'react'
import { NavLink, Route, Routes, Navigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { AccountSettingsPage } from '../account/AccountSettingsPage'
import { EmployeeAdminPage } from '../employees/EmployeeAdminPage'
import { LaboratoryDashboardLayout } from '../laboratory/LaboratoryDashboardLayout'
import { PharmacyDashboardLayout } from '../pharmacy/PharmacyDashboardLayout'
import { UserAdminPage } from '../users/UserAdminPage'
import { VaccinationDashboardLayout } from '../vaccination/VaccinationDashboardLayout'
import { WebsiteContentEditorPage } from '../website/WebsiteContentEditorPage'
import { ClinicWorkspace } from './ClinicWorkspace'
import { SectionHeader } from '../../components/ui'

const links = [
  { to: '/dashboard', label: 'Dashboard', permission: null },
  { to: '/patients', label: 'Patients', permission: 'patients.view' },
  { to: '/payments', label: 'Reception', permission: 'payments.view' },
  { to: '/documents', label: 'Clinical documents', permission: null },
  { to: '/stock', label: 'Medicine stock', permission: 'stock.manage' },
  { to: '/employees', label: 'Employees', permission: 'employees.manage' },
  { to: '/website-content', label: 'Website content', permission: 'website.content.manage' },
  { to: '/users', label: 'Users', permission: 'users.manage' },
  { to: '/account', label: 'My account', permission: null },
]

export function DashboardLayout() {
  const { user, logout, hasPermission } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  if (user?.profile?.role === 'pharmacist') {
    return <PharmacyDashboardLayout />
  }

  if (user?.profile?.role === 'laboratory') {
    return <LaboratoryDashboardLayout />
  }

  if (user?.profile?.role === 'vaccinator') {
    return <VaccinationDashboardLayout />
  }

  const visibleLinks = links.filter((link) => {
    if (user?.profile?.role === 'receptionist' && link.to === '/patients') return false
    if (user?.profile?.role === 'receptionist' && link.to === '/documents') return false
    return !link.permission || hasPermission(link.permission)
  })

  return (
    <div className="min-h-screen bg-sky-50 text-slate-900">
      {mobileMenuOpen ? <button className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" /> : null}

      <aside className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] border-r border-sky-100 bg-white p-4 shadow-sm shadow-sky-100 transition-transform lg:w-64 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-12 w-12 rounded-2xl object-cover" />
              <div>
                <p className="text-sm font-semibold text-sky-600">MCHC</p>
                <p className="text-xs text-zinc-500">Management Information System</p>
              </div>
            </div>
            <button className="rounded border border-pink-200 px-2 py-1 text-xs font-medium lg:hidden" onClick={() => setMobileMenuOpen(false)}>Close</button>
          </div>
        </div>
        <nav className="space-y-1">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setMobileMenuOpen(false)}
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
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileMenuOpen(true)} className="rounded border border-sky-200 bg-white px-3 py-2 text-sm font-medium lg:hidden">Menu</button>
              <div>
                <p className="text-sm font-medium">Welcome, {user?.first_name || user?.username}</p>
                <p className="text-xs text-zinc-500">{user?.profile?.role_label ?? 'Staff'}</p>
              </div>
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
            <Route path="/employees" element={<EmployeeAdminPage />} />
            <Route path="/website-content" element={<WebsiteContentEditorPage />} />
            <Route path="/users" element={<UserAdminPage />} />
            <Route path="/account" element={<AccountSettingsPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<SectionHeader title="Not found" subtitle="The requested MIS page does not exist." />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
