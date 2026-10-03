import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import { api } from '@/lib/api'
import { loadGoogleIdentity } from '@/lib/google'

/** Whether the server has Google sign-in configured, and with which (public) client id. */
export function useGoogleProvider() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => api.get<{ google: { clientId: string } | null }>('/auth/providers'),
    staleTime: Infinity,
    retry: false,
  })
}

/**
 * Google's own "Sign in with Google" button. It hands back a signed credential; what to do with it
 * (log in, sign up, connect an account) is up to the caller. Renders nothing when Google isn't configured.
 */
export function GoogleButton({
  onCredential,
  text = 'continue_with',
}: {
  onCredential: (credential: string) => void
  text?: 'signin_with' | 'signup_with' | 'continue_with'
}) {
  const { resolvedTheme } = useTheme()
  const holder = useRef<HTMLDivElement>(null)
  const callback = useRef(onCredential)
  callback.current = onCredential
  const [unavailable, setUnavailable] = useState(false)
  const clientId = useGoogleProvider().data?.google?.clientId

  useEffect(() => {
    if (!clientId || !holder.current) return
    let cancelled = false
    loadGoogleIdentity()
      .then((gid) => {
        if (cancelled || !holder.current) return
        gid.initialize({ client_id: clientId, ux_mode: 'popup', callback: ({ credential }) => callback.current(credential) })
        holder.current.innerHTML = ''
        gid.renderButton(holder.current, {
          type: 'standard',
          theme: resolvedTheme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          width: Math.min(400, holder.current.offsetWidth || 320),
        })
      })
      .catch(() => !cancelled && setUnavailable(true))
    return () => {
      cancelled = true
    }
  }, [clientId, resolvedTheme, text])

  if (!clientId) return null
  return (
    <>
      <div ref={holder} className="flex min-h-10 justify-center" aria-label="Continue with Google" />
      {unavailable && <p className="mt-2 text-center text-xs text-muted-foreground">Google couldn't load. Check your connection and try again.</p>}
    </>
  )
}
