import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Field, FormError } from '@/components/Field'
import { Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, errorMessage } from '@/lib/api'

const COOLDOWN = 60

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    const address = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(address)) return setError('Enter the email address you signed up with.')
    setBusy(true)
    try {
      await api.post('/auth/forgot-password', { email: address })
      setSentTo(address)
      setWait(COOLDOWN)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" subtitle={`If there is a FixNest account for ${sentTo}, we've sent a link to choose a new password. It works once and expires in 30 minutes.`}>
        <div className="space-y-4">
          <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">Can't see it? Look in your spam folder, and check that you used the address you signed up with.</p>
          {import.meta.env.DEV && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Development mode: the link is printed in the server console instead of being emailed.</p>}
          <FormError message={error} />
          <Button variant="outline" className="w-full" disabled={wait > 0 || busy} onClick={() => send()}>
            {busy && <Loader2 className="animate-spin" />} {wait > 0 ? `Send again in ${wait}s` : 'Send the link again'}
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="font-medium text-primary hover:underline">
              Back to log in
            </Link>
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Forgot your password?" subtitle="Enter your email and we'll send you a link to choose a new one.">
      <form onSubmit={send} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Email">
          {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@students.isquareit.edu.in" autoFocus />}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  )
}
