import { Loader2 } from '@/components/icons'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/AuthLayout'
import { Field, FormError } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { User } from '@/lib/types'

export default function VerifyEmail() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const email = (location.state as { email?: string } | null)?.email
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(45)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  if (!email) return <Navigate to="/login" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your email.')
    setBusy(true)
    try {
      const { user } = await api.post<{ user: User }>('/auth/verify-email', { email, code })
      setUser(user)
      toast.success('Email verified. Welcome to FixNest!')
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setError(null)
    try {
      await api.post('/auth/resend-code', { email })
      toast.success('A new code is on its way.')
      setCooldown(60)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <AuthLayout title="Check your email" subtitle={`We sent a 6-digit code to ${email}. It expires in 10 minutes.`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Verification code">
          {(p) => (
            <Input
              {...p}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
              autoFocus
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Verify email
        </Button>
      </form>
      {import.meta.env.DEV && (
        <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Development mode: the code is printed in the server console instead of being emailed.
        </p>
      )}
      <div className="mt-6 flex items-center justify-between text-sm">
        <button className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline" disabled={cooldown > 0} onClick={resend}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
        <Link to="/login" className="text-muted-foreground hover:text-foreground">
          Back to login
        </Link>
      </div>
    </AuthLayout>
  )
}
