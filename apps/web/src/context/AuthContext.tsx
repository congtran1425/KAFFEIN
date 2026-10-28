/**
 * AuthContext — manages JWT session for the Web Admin Console.
 *
 * On login:  token stored in localStorage, user profile decoded from JWT.
 * On refresh: /auth/me called to validate and refresh profile.
 * On logout: token cleared, app resets.
 *
 * Role-based routing:
 *   OWNER        → sees all stores, can switch via Store Switcher
 *   STORE_MANAGER → locked to homeStoreId, Store Switcher hidden
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { authApi, type LoginResponse } from '../services/api'

export type Role = 'OWNER' | 'STORE_MANAGER'

export interface AuthUser {
  userId: string
  fullName: string
  role: Role
  homeStoreId: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  /** null = loading; false = not logged in; AuthUser = logged in */
  status: 'loading' | 'unauthenticated' | 'authenticated'
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  error: string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'access_token'

function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<'loading' | 'unauthenticated' | 'authenticated'>('loading')
  const [error, setError] = useState<string | null>(null)
  // On mount: try to restore session from localStorage
  useEffect(() => {
    let isCancelled = false
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setStatus('unauthenticated')
      return
    }
    authApi
      .me()
      .then((profile) => {
        if (isCancelled) return
        setUser({
          userId: profile.userId,
          fullName: profile.fullName,
          role: profile.role,
          homeStoreId: profile.homeStoreId,
        })
        setStatus('authenticated')
      })
      .catch(() => {
        if (isCancelled) return
        clearToken()
        setUser(null)
        setStatus('unauthenticated')
      })
    return () => {
      isCancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    const res: LoginResponse = await authApi.login(email, password)
    saveToken(res.accessToken)
    const me: AuthUser = {
      userId: res.userId,
      fullName: res.fullName,
      role: res.role,
      homeStoreId: res.homeStoreId,
    }
    setUser(me)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    setStatus('unauthenticated')
    window.history.pushState({}, '', '/')
  }, [])

  const value = useMemo(
    () => ({ user, status, login, logout, error }),
    [user, status, login, logout, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
