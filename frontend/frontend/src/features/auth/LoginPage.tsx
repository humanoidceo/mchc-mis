import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { ApiError } from '../../api/client'
import { useAuth } from './useAuth'

function landingPathForRole(role?: string | null) {
  if (role === 'pharmacist') return '/pharmacy/dashboard'
  if (role === 'laboratory') return '/laboratory/dashboard'
  if (role === 'vaccinator') return '/vaccination/dashboard'
  return '/dashboard'
}

export function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    return <Navigate to={landingPathForRole(user.profile?.role)} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const loggedInUser = await login(email, password)
      navigate(landingPathForRole(loggedInUser.profile?.role), { replace: true })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to login')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#e0f2fe_0%,#fff_46%,#fce7f3_100%)] px-4 py-8 text-slate-900">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <form onSubmit={handleSubmit} className="w-full rounded-md border border-sky-100 bg-white/95 p-6 shadow-xl shadow-sky-100">
          <div className="mb-6">
            <p className="text-sm font-medium text-sky-600">MCHC MIS</p>
            <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
            <p className="mt-2 text-sm text-slate-600">Mother and Child Health Care Center</p>
          </div>

          {error ? <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded border border-sky-200 px-3 py-2 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="mb-6 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
            <span className="relative block">
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded border border-sky-200 px-3 py-2 pr-11 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r text-slate-500 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-100"
              >
                {showPassword ? (
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6" />
                    <path d="M9.9 4.2A9.5 9.5 0 0 1 12 4c5 0 8.3 4.1 9.5 6a11.8 11.8 0 0 1-2.3 2.8" />
                    <path d="M6.6 6.6A12.2 12.2 0 0 0 2.5 10c1.2 1.9 4.5 6 9.5 6a9 9 0 0 0 4-.9" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M2.5 12S5.8 6 12 6s9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-sky-500 px-4 py-2 font-medium text-white shadow-sm shadow-sky-200 hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {submitting ? 'Signing in...' : 'Login'}
          </button>
        </form>
      </section>
    </main>
  )
}
