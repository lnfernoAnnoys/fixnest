import { Loader2 } from '@/components/icons'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Field, FormError } from '@/components/Field'
import { GoogleAuthButton } from '@/components/GoogleAuthButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { COLLEGE_EMAIL_DOMAIN } from '@/lib/config'
import { LocationFields } from '@/components/LocationFields'

type Errors = Partial<Record<'name' | 'email' | 'password' | 'hostel' | 'room', string>>

export default function Register() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', hostelName: '', roomNumber: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value, }))

  function validate(): Errors {
    const e: Errors = {}
    if (form.name.trim().length < 2) e.name = 'Enter your full name.'
    const email = form.email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Enter a valid email address.'
    else if (!email.endsWith('@' + COLLEGE_EMAIL_DOMAIN)) e.email = `Use your college email (@${COLLEGE_EMAIL_DOMAIN}).`
    if (form.password.length < 8) e.password = 'Use at least 8 characters.'
    if (form.hostelName.trim().length < 2) e.hostel = 'Choose your hostel.'
    if (!/^[A-Za-z0-9-]{1,10}$/.test(form.roomNumber.replace(/\s+/g, ''))) e.room = 'Type your room number, like 302 or M423.'
    return e
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    setFormError(null)
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      const email = form.email.trim().toLowerCase()
      await api.post('/auth/register', { name: form.name.trim(), email, password: form.password, hostelName: form.hostelName.trim(), roomNumber: form.roomNumber.trim() })
      navigate('/verify', { state: { email }, replace: true })
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Students sign up with their college email. We'll send a code to confirm it.">
      <GoogleAuthButton mode="signup" />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field label="Full name" error={errors.name}>
          {(p) => <Input {...p} autoComplete="name" value={form.name} onChange={set('name')} autoFocus />}
        </Field>
        <Field label="College email" error={errors.email} hint={`Must end with @${COLLEGE_EMAIL_DOMAIN}`}>
          {(p) => <Input {...p} type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} />}
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />}
        </Field>
        <LocationFields hostel={form.hostelName} room={form.roomNumber} onHostel={(v) => setForm((f) => ({ ...f, hostelName: v }))} onRoom={(v) => setForm((f) => ({ ...f, roomNumber: v }))} errors={errors} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  )
}
