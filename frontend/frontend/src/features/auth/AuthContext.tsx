import { useEffect, useMemo, useState } from 'react'

import { apiFetch, login as loginRequest, logout as logoutRequest } from '../../api/client'
import type { User } from '../../types/domain'
import { AuthContext } from './authState'
import type { AuthContextValue } from './authState'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<User>('/auth/me/')
      .then(setUser)
      .catch(() => {
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const loggedInUser = await loginRequest(email, password)
        setUser(loggedInUser)
        return loggedInUser
      },
      async logout() {
        setUser(null)
        await logoutRequest()
      },
      hasPermission(permission) {
        return Boolean(user?.permissions.includes(permission))
      },
      setCurrentUser(nextUser) {
        setUser(nextUser)
      },
    }),
    [loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
