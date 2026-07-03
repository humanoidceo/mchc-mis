import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, inputClassName, Panel, SectionHeader } from '../../components/ui'
import type { User } from '../../types/domain'
import { useAuth } from '../auth/useAuth'

const common = {
  saving: 'Saving...',
}

const t = {
  title: 'My account',
  subtitle: 'Update your login email address and password for this account.',
  username: 'Username',
  role: 'Role',
  emailAddress: 'Email address',
  currentPassword: 'Current password',
  newPassword: 'New password',
  confirmNewPassword: 'Confirm new password',
  checkingUsername: 'Checking username...',
  usernameRequired: 'Username is required.',
  roleFallback: 'Staff',
  currentPasswordPlaceholder: 'Required only when changing password',
  newPasswordPlaceholder: 'Leave blank to keep current password',
  confirmPasswordPlaceholder: 'Repeat the new password',
  updateAccount: 'Update account',
  updated: 'Account settings updated.',
  unableToUpdate: 'Unable to update account settings.',
}

function flattenValidationDetails(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return [`${prefix}: ${value.join(', ')}`]
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, nestedValue]) => {
      const nestedPrefix = prefix ? `${prefix}.${key}` : key
      return flattenValidationDetails(nestedValue, nestedPrefix)
    })
  }
  return prefix ? [`${prefix}: ${String(value)}`] : [String(value)]
}

function describeApiError(caught: unknown): string {
  if (caught instanceof ApiError) {
    const details = flattenValidationDetails(caught.details).join(' ')
    return details || caught.message
  }
  return ''
}

export function AccountSettingsPage() {
  const { user, setCurrentUser } = useAuth()
  const [form, setForm] = useState({
    username: user?.username ?? '',
    email: user?.email ?? '',
    current_password: '',
    new_password: '',
    confirm_new_password: '',
  })
  const [usernameMessage, setUsernameMessage] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const username = form.username.trim()
    const currentUsername = (user?.username ?? '').trim()
    let cancelled = false

    if (!username) {
      setUsernameStatus('taken')
      setUsernameMessage(t.usernameRequired)
      return
    }

    if (username === currentUsername) {
      setUsernameStatus('idle')
      setUsernameMessage('')
      return
    }

    const timer = window.setTimeout(() => {
      setUsernameStatus('checking')
      void apiFetch<{ available: boolean; message: string }>(`/auth/account/username-availability/?username=${encodeURIComponent(username)}`)
        .then((response) => {
          if (cancelled) return
          setUsernameStatus(response.available ? 'available' : 'taken')
          setUsernameMessage(response.message)
        })
        .catch((caught) => {
          if (cancelled) return
          setUsernameStatus('taken')
          setUsernameMessage(describeApiError(caught) || t.unableToUpdate)
        })
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [form.username, user?.username])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (usernameStatus === 'checking' || usernameStatus === 'taken') {
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')

    const payload: Record<string, string> = {}
    if (form.username.trim() !== (user?.username ?? '').trim()) {
      payload.username = form.username.trim()
    }
    if (form.email.trim() !== (user?.email ?? '').trim()) {
      payload.email = form.email.trim()
    }
    if (form.new_password || form.current_password || form.confirm_new_password) {
      payload.current_password = form.current_password
      payload.new_password = form.new_password
      payload.confirm_new_password = form.confirm_new_password
    }

    try {
      const updatedUser = await apiFetch<User>('/auth/account/', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      setCurrentUser(updatedUser)
      setForm({
        username: updatedUser.username ?? '',
        email: updatedUser.email ?? '',
        current_password: '',
        new_password: '',
        confirm_new_password: '',
      })
      setUsernameStatus('idle')
      setUsernameMessage('')
      setSuccess(t.updated)
    } catch (caught) {
      setError(describeApiError(caught) || t.unableToUpdate)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader title={t.title} subtitle={t.subtitle} />
      <Panel>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">{error}</div> : null}
          {success ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 md:col-span-2">{success}</div> : null}
          <Field label={t.username}>
            <>
              <input className={inputClassName} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required />
              {usernameStatus === 'checking' ? <p className="mt-1 text-xs text-zinc-500">{t.checkingUsername}</p> : null}
              {usernameMessage ? <p className={`mt-1 text-xs ${usernameStatus === 'taken' ? 'text-red-600' : 'text-emerald-700'}`}>{usernameMessage}</p> : null}
            </>
          </Field>
          <Field label={t.role}>
            <input className={`${inputClassName} bg-slate-50`} value={user?.profile?.role_label ?? t.roleFallback} disabled />
          </Field>
          <Field label={t.emailAddress}>
            <input className={inputClassName} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </Field>
          <div className="hidden md:block" />
          <Field label={t.currentPassword}>
            <input className={inputClassName} type="password" value={form.current_password} onChange={(event) => setForm({ ...form, current_password: event.target.value })} placeholder={t.currentPasswordPlaceholder} />
          </Field>
          <Field label={t.newPassword}>
            <input className={inputClassName} type="password" value={form.new_password} onChange={(event) => setForm({ ...form, new_password: event.target.value })} placeholder={t.newPasswordPlaceholder} />
          </Field>
          <Field label={t.confirmNewPassword}>
            <input className={inputClassName} type="password" value={form.confirm_new_password} onChange={(event) => setForm({ ...form, confirm_new_password: event.target.value })} placeholder={t.confirmPasswordPlaceholder} />
          </Field>
          <div className="md:col-span-2">
            <button className={buttonClassName} disabled={saving || usernameStatus === 'checking' || usernameStatus === 'taken'}>{saving ? common.saving : t.updateAccount}</button>
          </div>
        </form>
      </Panel>
    </div>
  )
}
