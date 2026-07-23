import { useState } from 'react'
import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Database, FileText, FolderLock, Globe, HeartPulse, LayoutDashboard, Package, ReceiptText, Shield, Trash2, User, Users, Wallet } from 'lucide-react'

import { useAuth } from '../auth/useAuth'
import { AccountSettingsPage } from '../account/AccountSettingsPage'
import { EmployeeAdminPage } from '../employees/EmployeeAdminPage'
import { LaboratoryDashboardLayout } from '../laboratory/LaboratoryDashboardLayout'
import { MalnutritionDashboardLayout } from '../malnutrition/MalnutritionDashboardLayout'
import { MidwifeDashboardLayout } from '../midwife/MidwifeDashboardLayout'
import { PharmacyDashboardLayout } from '../pharmacy/PharmacyDashboardLayout'
import { UserAdminPage } from '../users/UserAdminPage'
import { VaccinationDashboardLayout } from '../vaccination/VaccinationDashboardLayout'
import { WebsiteContentEditorPage } from '../website/WebsiteContentEditorPage'
import { TrashBinPage } from '../trash/TrashBinPage'
import { ClinicWorkspace } from './ClinicWorkspace'
import { DatabaseBackupPage } from './DatabaseBackupPage'
import { SectionHeader } from '../../components/ui'

const common = {
  menu: 'Menu',
  close: 'Close',
  logout: 'Logout',
  welcome: 'Welcome',
  myAccount: 'My account',
  notFoundTitle: 'Not found',
  notFoundSubtitle: 'The requested MIS page does not exist.',
}

const layoutText = {
  brandSubtitle: 'Management Information System',
  dashboard: 'Dashboard',
  patients: 'Patients',
  reception: 'Reception',
  report: 'Report',
  expenses: 'Expenses',
  salaries: 'Salaries',
  clinicalDocuments: 'Clinical documents',
  familyPlanning: 'Family planning',
  ultrasoundReports: 'Ultrasound reports',
  privateDocuments: 'Private documents',
  databaseBackup: 'Database backup',
  medicineStock: 'Medicine stock',
  employees: 'Employees',
  websiteContent: 'Website content',
  users: 'Users',
}

export function DashboardLayout() {
  const { user, logout, hasPermission } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const links = [
    { to: '/dashboard', label: layoutText.dashboard, permission: null, icon: LayoutDashboard },
    { to: '/patients', label: layoutText.patients, permission: 'patients.view', icon: Users },
    { to: '/payments', label: layoutText.reception, permission: 'payments.view', icon: ReceiptText },
    { to: '/reception-report', label: layoutText.report, permission: 'payments.view', icon: FileText },
    { to: '/expenses', label: layoutText.expenses, permission: 'expenses.manage', icon: Wallet },
    { to: '/salaries', label: layoutText.salaries, permission: 'expenses.manage', icon: Wallet },
    { to: '/documents', label: layoutText.clinicalDocuments, permission: null, icon: FileText },
    { to: '/family-planning', label: layoutText.familyPlanning, permission: 'documents.family_planning.create', icon: HeartPulse },
    { to: '/ultrasound-reports', label: layoutText.ultrasoundReports, permission: 'documents.ultrasound.create', icon: FileText },
    { to: '/private-documents', label: layoutText.privateDocuments, permission: 'private_documents.manage', icon: FolderLock },
    { to: '/database-backup', label: layoutText.databaseBackup, permission: null, icon: Database },
    { to: '/stock', label: layoutText.medicineStock, permission: 'stock.manage', icon: Package },
    { to: '/employees', label: layoutText.employees, permission: 'employees.manage', icon: Users },
    { to: '/website-content', label: layoutText.websiteContent, permission: 'website.content.manage', icon: Globe },
    { to: '/users', label: layoutText.users, permission: 'users.manage', icon: Shield },
    { to: '/account', label: common.myAccount, permission: null, icon: User },
  ]

  if (user?.profile?.role === 'pharmacist') {
    return <PharmacyDashboardLayout />
  }

  if (user?.profile?.role === 'laboratory') {
    return <LaboratoryDashboardLayout />
  }

  if (user?.profile?.role === 'vaccinator') {
    return <VaccinationDashboardLayout />
  }

  if (user?.profile?.role === 'midwife') {
    return <MidwifeDashboardLayout />
  }

  if (user?.profile?.role === 'malnutrition') {
    return <MalnutritionDashboardLayout />
  }

  const visibleLinks = links.filter((link) => {
    if (user?.profile?.role === 'receptionist' && link.to === '/patients') return false
    if (user?.profile?.role === 'receptionist' && link.to === '/documents') return false
    if (link.to === '/reception-report' && !['receptionist', 'super_admin'].includes(user?.profile?.role ?? '')) return false
    if (link.to === '/database-backup' && !['receptionist', 'super_admin'].includes(user?.profile?.role ?? '') && !hasPermission('database.backup')) return false
    if (user?.profile?.role === 'gynecologist' && link.to === '/patients') return false
    if (link.to === '/family-planning' && user?.profile?.role !== 'gynecologist') return false
    if (link.to === '/ultrasound-reports' && user?.profile?.role !== 'gynecologist') return false
    return !link.permission || hasPermission(link.permission)
  })

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
                <p className="text-xs text-zinc-500">{layoutText.brandSubtitle}</p>
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
          {visibleLinks.map((link) => (
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
              <NavLink to="/trash" className="rounded border border-sky-200 bg-white px-3 py-2 text-sm font-medium hover:bg-sky-50">
                <span className="inline-flex items-center gap-2"><Trash2 className="h-4 w-4" />Trash</span>
              </NavLink>
              <button onClick={() => void logout()} className="rounded border border-pink-200 bg-white px-3 py-2 text-sm font-medium hover:bg-pink-50">{common.logout}</button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">
          <Routes>
            <Route path="/dashboard" element={<ClinicWorkspace view="dashboard" />} />
            <Route path="/patients" element={<ClinicWorkspace view="patients" />} />
            <Route path="/payments" element={<ClinicWorkspace view="payments" />} />
            <Route path="/reception-report" element={<ClinicWorkspace view="reception-report" />} />
            <Route path="/expenses" element={<ClinicWorkspace view="expenses" />} />
            <Route path="/salaries" element={<ClinicWorkspace view="salaries" />} />
            <Route path="/documents" element={<ClinicWorkspace view="documents" />} />
            <Route path="/private-documents" element={<ClinicWorkspace view="private-documents" />} />
            <Route path="/database-backup" element={<DatabaseBackupPage />} />
            <Route path="/family-planning" element={<ClinicWorkspace view="family-planning" />} />
            <Route path="/ultrasound-reports" element={<ClinicWorkspace view="ultrasound-reports" />} />
            <Route path="/stock" element={<ClinicWorkspace view="stock" />} />
            <Route path="/employees" element={<EmployeeAdminPage />} />
            <Route path="/website-content" element={<WebsiteContentEditorPage />} />
            <Route path="/users" element={<UserAdminPage />} />
            <Route path="/account" element={<AccountSettingsPage />} />
            <Route path="/trash" element={<TrashBinPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<SectionHeader title={common.notFoundTitle} subtitle={common.notFoundSubtitle} />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
