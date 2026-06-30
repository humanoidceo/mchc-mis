import { useEffect, useMemo, useState } from 'react'

import { apiFetch, authStorage, login as loginRequest } from '../../api/client'
import type { User } from '../../types/domain'
import { AuthContext } from './authState'
import type { AuthContextValue } from './authState'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(authStorage.hasToken())

  useEffect(() => {
    if (!authStorage.hasToken()) {
      setLoading(false)
      return
    }

    apiFetch<User>('/auth/me/')
      .then(setUser)
      .catch(() => {
        authStorage.clear()
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
      logout() {
        authStorage.clear()
        setUser(null)
      },
      hasPermission(permission) {
        return Boolean(user?.permissions.includes(permission))
      },
    }),
    [loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
