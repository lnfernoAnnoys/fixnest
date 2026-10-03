import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FormError } from '@/components/Field'
import { GoogleButton, useGoogleProvider } from '@/components/GoogleButton'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { User } from '@/lib/types'

type GoogleResult = { user: User } | { needsProfile: true; signupToken: string; name: string; email: string; picture: string | null }

/**
 * Login / sign-up with Google, plus the "or" divider. Renders nothing until the server reports that
 * Google sign-in is configured, so the app works unchanged without it.
 */
export function GoogleAuthButton({ next = '/', mode = 'signin' }: { next?: string; mode?: 'signin' | 'signup' }) {
  const navigate = useNavigate()
  const { acceptUser } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const configured = useGoogleProvider().data?.google

  if (!configured) return null

  async function handle(credential: string) {
    setError(null)
    try {
      const r = await api.post<GoogleResult>('/auth/google', { credential })
      if ('needsProfile' in r) {
        navigate('/google-signup', { state: { signupToken: r.signupToken, name: r.name, email: r.email }, replace: true })
      } else {
        acceptUser(r.user)
        navigate(next, { replace: true })
      }
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="space-y-3">
      <FormError message={error} />
      <GoogleButton onCredential={handle} text={mode === 'signup' ? 'signup_with' : 'continue_with'} />
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  )
}
