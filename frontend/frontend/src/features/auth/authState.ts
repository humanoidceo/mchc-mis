import { createContext } from 'react'

import type { User } from '../../types/domain'

export type AuthContextValue = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => void
  hasPermission: (permission: string) => boolean
  setCurrentUser: (user: User | null) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
