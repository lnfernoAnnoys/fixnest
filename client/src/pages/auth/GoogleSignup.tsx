import { Loader2 } from '@/components/icons'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/AuthLayout'
import { FormError } from '@/components/Field'
import { LocationFields } from '@/components/LocationFields'
import { Button } from '@/components/ui/button'
import { api, ApiError, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { User } from '@/lib/types'

interface SignupState {
  signupToken: string
  name: string
  email: string
}

/** Second step for a first-time Google sign-in: we already know who they are, we just need their room. */
export default function GoogleSignup() {
  const state = useLocation().state as SignupState | null
  const navigate = useNavigate()
  const { acceptUser } = useAuth()
  const [hostelName, setHostelName] = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  const [errors, setErrors] = useState<{ hostel?: string; room?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!state?.signupToken) return <Navigate to="/login" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const next = {
      hostel: hostelName.trim().length >= 2 ? undefined : 'Type your hostel name.',
      room: /^[A-Za-z0-9-]{1,10}$/.test(roomNumber.replace(/\s+/g, '')) ? undefined : 'Type your room number, like 302 or M423.',
    }
    setErrors(next)
    if (next.hostel || next.room) return
    setBusy(true)
    try {
      const { user } = await api.post<{ user: User }>('/auth/google/complete', { signupToken: state!.signupToken, hostelName: hostelName.trim(), roomNumber: roomNumber.trim() })
      acceptUser(user)
      toast.success('Welcome to FixNest!')
      navigate('/', { replace: true })
    } catch (err) {
      // An expired session means starting over from the login page.
      if (err instanceof ApiError && err.code === 'SIGNUP_EXPIRED') return navigate('/login', { replace: true })
      setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="One last step" subtitle="Tell us where you stay so we can pre-fill your complaints.">
      <div className="mb-5 rounded-lg border bg-muted/50 px-3 py-2.5 text-sm">
        <p className="font-medium">{state.name}</p>
        <p className="text-muted-foreground">{state.email}</p>
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <LocationFields hostel={hostelName} room={roomNumber} onHostel={setHostelName} onRoom={setRoomNumber} errors={errors} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Finish sign up
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/login" className="hover:text-foreground">
          Cancel
        </Link>
      </p>
    </AuthLayout>
  )
}
