import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { api, ApiError } from './api'
import type { User } from './types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  setUser: (u: User) => void
  /** Use after any sign-in that already produced a session: swaps cached data over to the new user. */
  acceptUser: (u: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { data, isPending } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>('/auth/me')).user
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  })

  const setUser = useCallback((u: User) => qc.setQueryData(['me'], u), [qc])

  const acceptUser = useCallback(
    (u: User) => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'providers' })
      qc.setQueryData(['me'], u)
    },
    [qc],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const { user } = await api.post<{ user: User }>('/auth/login', { email, password })
      acceptUser(user)
      return user
    },
    [acceptUser],
  )

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined)
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
    qc.setQueryData(['me'], null)
  }, [qc])

  const value = useMemo(() => ({ user: data ?? null, loading: isPending, login, logout, setUser, acceptUser }), [data, isPending, login, logout, setUser, acceptUser])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
