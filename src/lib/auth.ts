import { createContext, useContext } from 'react'

export interface AuthContextValue {
  loading: boolean
  authenticated: boolean
  setAuthenticated: (value: boolean) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (value === null) {
    throw new Error('useAuth must be used within AuthContext.Provider')
  }
  return value
}

export default AuthContext