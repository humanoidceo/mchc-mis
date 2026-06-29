import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { ApiError } from '../../api/client'
import { useAuth } from './useAuth'

export function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username, password)
      navigate('/dashboard', { replace: true })
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
            <span className="mb-1 block text-sm font-medium text-slate-700">Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded border border-sky-200 px-3 py-2 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
              autoComplete="username"
              required
            />
          </label>

          <label className="mb-6 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded border border-sky-200 px-3 py-2 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
              type="password"
              autoComplete="current-password"
              required
            />
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
