import { useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { AlertTriangle, ChevronLeft, ChevronRight, LayoutDashboard, ReceiptText, User } from 'lucide-react'

import { SectionHeader } from '../../components/ui'
import { AccountSettingsPage } from '../account/AccountSettingsPage'
import { useAuth } from '../auth/useAuth'
import { EmergencyDoctorWorkspace } from './EmergencyDoctorWorkspace'
import { EmergencyServicePricesPage } from './EmergencyServicePricesPage'

const links = [
  { to: '/emergency/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/emergency/service-prices', label: 'Emergency services prices', icon: ReceiptText },
  { to: '/emergency/account', label: 'My account', icon: User },
]

export function EmergencyDoctorDashboardLayout() {
  const { user, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-rose-50 text-slate-900">
      {mobileMenuOpen ? <button className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] overflow-hidden border-r border-white/35 bg-white/30 p-4 shadow-[0_20px_60px_rgba(225,29,72,0.14)] backdrop-blur-2xl transition-all duration-300 lg:max-w-none ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'} ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="relative z-10 mb-6 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-600 text-white"><AlertTriangle className="h-6 w-6" /></div>
            <div className={sidebarCollapsed ? 'lg:hidden' : ''}><p className="text-sm font-semibold text-rose-700">MCHC</p><p className="text-xs text-zinc-500">Emergency Department</p></div>
          </div>
          <div className="flex gap-2">
            <button className="hidden rounded-lg border border-rose-100 bg-white p-2 lg:inline-flex" onClick={() => setSidebarCollapsed((current) => !current)} aria-label="Toggle sidebar">{sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button>
            <button className="rounded border border-rose-200 px-2 py-1 text-xs lg:hidden" onClick={() => setMobileMenuOpen(false)}>Close</button>
          </div>
        </div>
        <nav className="relative z-10 space-y-1">
          {links.map((link) => <NavLink key={link.to} to={link.to} onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${sidebarCollapsed ? 'lg:justify-center' : ''} ${isActive ? 'bg-rose-100 text-rose-800' : 'text-slate-700 hover:bg-white/70'}`}><link.icon className="h-4 w-4 shrink-0" /><span className={sidebarCollapsed ? 'lg:hidden' : ''}>{link.label}</span></NavLink>)}
        </nav>
      </aside>
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <header className="sticky top-0 z-10 border-b border-rose-100 bg-white/95 px-4 py-3 backdrop-blur"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><button onClick={() => setMobileMenuOpen(true)} className="rounded border border-rose-200 bg-white px-3 py-2 text-sm font-medium lg:hidden">Menu</button><div><p className="text-sm font-medium">Welcome, {user?.first_name || user?.username}</p><p className="text-xs text-zinc-500">{user?.profile?.role_label ?? 'Staff'}</p></div></div><button onClick={() => void logout()} className="rounded border border-rose-200 bg-white px-3 py-2 text-sm font-medium hover:bg-rose-50">Logout</button></div></header>
        <main className="mx-auto max-w-7xl px-4 py-6"><Routes><Route path="/emergency" element={<Navigate to="/emergency/dashboard" replace />} /><Route path="/emergency/dashboard" element={<EmergencyDoctorWorkspace />} /><Route path="/emergency/service-prices" element={<EmergencyServicePricesPage />} /><Route path="/emergency/account" element={<AccountSettingsPage />} /><Route path="/" element={<Navigate to="/emergency/dashboard" replace />} /><Route path="*" element={<SectionHeader title="Not found" subtitle="The requested Emergency page does not exist." />} /></Routes></main>
      </div>
    </div>
  )
}
