import { useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FlaskConical, LayoutDashboard, Trash2, User } from 'lucide-react'

import { SectionHeader } from '../../components/ui'
import { AccountSettingsPage } from '../account/AccountSettingsPage'
import { useAuth } from '../auth/useAuth'
import { TrashBinPage } from '../trash/TrashBinPage'
import { LaboratoryWorkspace } from './LaboratoryWorkspace'

const links = [
  { to: '/laboratory/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/laboratory/billing', label: 'Billing', icon: FlaskConical },
  { to: '/laboratory/account', label: 'My account', icon: User },
]

const common = {
  menu: 'Menu',
  close: 'Close',
  logout: 'Logout',
  welcome: 'Welcome',
  notFoundTitle: 'Not found',
}

export function LaboratoryDashboardLayout() {
  const { user, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-sky-50 text-slate-900">
      {mobileMenuOpen ? <button className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden" onClick={() => setMobileMenuOpen(false)} aria-label={common.close} /> : null}

      <aside className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] overflow-hidden border-r border-white/35 bg-white/18 p-4 shadow-[0_20px_60px_rgba(14,165,233,0.18)] backdrop-blur-2xl transition-all duration-300 lg:max-w-none ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'} ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.55),rgba(255,255,255,0.14)_38%,rgba(186,230,253,0.12)_100%)]" />
        <div className="pointer-events-none absolute inset-x-3 top-3 h-24 rounded-[28px] bg-gradient-to-b from-white/70 via-white/25 to-transparent blur-xl" />
        <div className="relative z-10 mb-6">
          <div className={`flex items-start gap-3 ${sidebarCollapsed ? 'lg:justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-3">
              <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-12 w-12 rounded-2xl object-cover" />
              <div className={sidebarCollapsed ? 'lg:hidden' : ''}>
                <p className="text-sm font-semibold text-sky-600">MCHC</p>
                <p className="text-xs text-zinc-500">Management Information System</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="hidden rounded-lg border border-white/60 bg-white/70 p-2 text-slate-700 shadow-sm transition hover:bg-white lg:inline-flex"
                onClick={() => setSidebarCollapsed((current) => !current)}
              >
                {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
              <button className="rounded border border-pink-200 px-2 py-1 text-xs font-medium lg:hidden" onClick={() => setMobileMenuOpen(false)}>{common.close}</button>
            </div>
          </div>
        </div>
        <nav className="relative z-10 space-y-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              title={sidebarCollapsed ? link.label : undefined}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${sidebarCollapsed ? 'lg:justify-center' : ''} ${isActive ? 'bg-white/50 text-pink-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_8px_24px_rgba(236,72,153,0.14)]' : 'text-slate-700 hover:bg-white/35'}`
              }
            >
              <link.icon className="h-4 w-4 shrink-0" />
              <span className={sidebarCollapsed ? 'lg:hidden' : ''}>{link.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <header className="no-print sticky top-0 z-10 border-b border-sky-100 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileMenuOpen(true)} className="rounded border border-sky-200 bg-white px-3 py-2 text-sm font-medium lg:hidden">{common.menu}</button>
              <div>
                <p className="text-sm font-medium">{common.welcome}, {user?.first_name || user?.username}</p>
                <p className="text-xs text-zinc-500">{user?.profile?.role_label ?? 'Staff'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NavLink to="/laboratory/trash" className="rounded border border-sky-200 bg-white px-3 py-2 text-sm font-medium hover:bg-sky-50">
                <span className="inline-flex items-center gap-2"><Trash2 className="h-4 w-4" />Trash</span>
              </NavLink>
              <button onClick={() => void logout()} className="rounded border border-pink-200 bg-white px-3 py-2 text-sm font-medium hover:bg-pink-50">{common.logout}</button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">
          <Routes>
            <Route path="/laboratory" element={<Navigate to="/laboratory/dashboard" replace />} />
            <Route path="/laboratory/dashboard" element={<LaboratoryWorkspace view="dashboard" />} />
            <Route path="/laboratory/billing" element={<LaboratoryWorkspace view="billing" />} />
            <Route path="/laboratory/account" element={<AccountSettingsPage />} />
            <Route path="/laboratory/trash" element={<TrashBinPage />} />
            <Route path="/" element={<Navigate to="/laboratory/dashboard" replace />} />
            <Route path="*" element={<SectionHeader title={common.notFoundTitle} subtitle="The requested laboratory page does not exist." />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
