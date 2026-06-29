import { Navigate } from 'react-router-dom'

import { useAuth } from './useAuth'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth()

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-sky-50 text-slate-700">Loading...</div>
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />
  }

  return children
}
