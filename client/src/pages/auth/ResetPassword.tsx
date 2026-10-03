import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Field, FormError } from '@/components/Field'
import { Eye, EyeOff, Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ApiError, errorMessage } from '@/lib/api'

/** The token lives after the "#" in the emailed link, so it is never sent to any server or website. */
const readToken = () => new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? ''

export default function ResetPassword() {
  const navigate = useNavigate()
  const [token] = useState(readToken)
  const [account, setAccount] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(token ? null : 'This reset link is incomplete. Ask for a new one.')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Check the link as soon as the page opens, so a stale link is explained right away.
  useEffect(() => {
    if (!token) return
    api
      .post<{ email: string }>('/auth/reset-password/check', { token })
      .then((r) => setAccount(r.email))
      .catch((e) => setLinkError(e instanceof ApiError && e.status === 400 ? e.message : errorMessage(e)))
  }, [token])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const next: typeof errors = {}
    if (password.length < 8) next.password = 'Use at least 8 characters.'
    if (confirm !== password) next.confirm = "The two passwords don't match."
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      navigate('/login', { replace: true, state: { passwordReset: true } })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RESET_INVALID') setLinkError(err.message)
      else setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (linkError) {
    return (
      <AuthLayout title="This link can't be used" subtitle={linkError}>
        <Button size="lg" className="w-full" render={<Link to="/forgot-password" />}>
          Get a new link
        </Button>
        <p className="mt-6 text-center text-sm">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to log in
          </Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password" subtitle={account ? `For ${account}. You'll be signed out of your other devices.` : 'Checking your link...'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field label="New password" error={errors.password} hint="At least 8 characters.">
          {(p) => (
            <div className="relative">
              <Input {...p} type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" autoFocus disabled={!account} />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide passwords' : 'Show passwords'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>
        <Field label="Confirm new password" error={errors.confirm}>
          {(p) => <Input {...p} type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={!account} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy || !account}>
          {busy && <Loader2 className="animate-spin" />} Save new password
        </Button>
      </form>
    </AuthLayout>
  )
}
