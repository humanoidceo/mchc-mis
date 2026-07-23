import { useState } from 'react'
import { Database, Download } from 'lucide-react'

import { ApiError, apiDownload } from '../../api/client'
import { buttonClassName, Panel, SectionHeader } from '../../components/ui'
import { useAuth } from '../auth/useAuth'

function describeApiError(caught: unknown): string {
  if (caught instanceof ApiError) {
    return caught.message
  }
  return 'Unable to download database backup.'
}

function downloadBlob(blob: Blob, filename: string) {
  const downloadUrl = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = downloadUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(downloadUrl)
}

export function DatabaseBackupPage() {
  const { user, hasPermission } = useAuth()
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const role = user?.profile?.role
  const canDownloadBackup = role === 'super_admin' || role === 'receptionist' || hasPermission('database.backup')

  async function downloadDatabaseBackup() {
    setError('')
    setSuccess('')
    setDownloading(true)
    try {
      const { blob, filename } = await apiDownload('/database/backup/')
      downloadBlob(blob, filename || 'mchc-mis-db-backup.sql')
      setSuccess('Database backup downloaded.')
    } catch (caught) {
      setError(describeApiError(caught))
    } finally {
      setDownloading(false)
    }
  }

  if (!canDownloadBackup) {
    return <SectionHeader title="Access denied" subtitle="Your account cannot download database backups." />
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Database backup" subtitle="Download the current MySQL database as a SQL backup file." />
      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-sky-100 bg-sky-50 text-sky-700">
              <Database className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">MySQL database export</p>
              <p className="mt-1 text-sm text-zinc-500">The backup will be saved to this computer.</p>
            </div>
          </div>
          <button className={buttonClassName} type="button" onClick={() => void downloadDatabaseBackup()} disabled={downloading}>
            <span className="inline-flex items-center gap-2">
              <Download className="h-4 w-4" />
              {downloading ? 'Preparing backup...' : 'Download backup'}
            </span>
          </button>
        </div>
        {error ? <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
      </Panel>
    </div>
  )
}
