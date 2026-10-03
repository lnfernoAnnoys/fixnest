import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ChangeRoomDialog } from '@/components/ChangeRoomDialog'
import { Field, FormError } from '@/components/Field'
import { GoogleButton, useGoogleProvider } from '@/components/GoogleButton'
import { Loader2, LogOut, Monitor, Moon, Sun } from '@/components/icons'
import { PageHeader } from '@/components/states'
import { useTheme, type Theme } from '@/components/ThemeProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/UserAvatar'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { timeAgo } from '@/lib/format'
import { avatarImage } from '@/lib/image'
import type { DeviceSession, Role, User } from '@/lib/types'
import { cn } from '@/lib/utils'

const ROLE_LABEL: Record<Role, string> = { student: 'Student', staff: 'Maintenance staff', warden: 'Warden', admin: 'Admin' }

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
    </div>
  )
}

/** Turns +919876543210 into +91 98765 43210 for reading. */
function prettyPhone(p: string) {
  const m = p.match(/^\+91(\d{5})(\d{5})$/)
  return m ? `+91 ${m[1]} ${m[2]}` : p
}

function MobileNumber() {
  const { user, setUser } = useAuth()
  const [phone, setPhone] = useState(user?.phone ? prettyPhone(user.phone) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const saved = user?.phone ? prettyPhone(user.phone) : ''
  const changed = phone.trim() !== saved

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { user: updated } = await api.patch<{ user: User }>('/profile/phone', { phone: phone.trim() })
      setUser(updated)
      setPhone(updated.phone ? prettyPhone(updated.phone) : '')
      toast.success(updated.phone ? 'Mobile number saved' : 'Mobile number removed')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-2 border-t pt-4" noValidate>
      <FormError message={error} />
      <Field label="Mobile number" hint="So the hostel office can reach you. Leave it empty to remove it.">
        {(p) => (
          <div className="flex gap-2">
            <Input {...p} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button type="submit" variant="outline" disabled={!changed || busy}>
              {busy && <Loader2 className="animate-spin" />} Save
            </Button>
          </div>
        )}
      </Field>
    </form>
  )
}

function ActiveDevices() {
  const qc = useQueryClient()
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<{ sessions: DeviceSession[] }>('/auth/sessions') })
  const [confirmAll, setConfirmAll] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ['sessions'] })

  const logOut = useMutation({
    mutationFn: (id: string) => api.del(`/auth/sessions/${id}`),
    onSuccess: () => (toast.success('That device was logged out'), refresh()),
    onError: (e) => (toast.error(errorMessage(e)), refresh()),
  })
  const logOutOthers = useMutation({
    mutationFn: () => api.post<{ loggedOut: number }>('/auth/sessions/revoke-others'),
    onSuccess: (r) => (toast.success(`Logged out ${r.loggedOut} other device${r.loggedOut === 1 ? '' : 's'}`), setConfirmAll(false), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  })

  const list = sessions.data?.sessions ?? []
  const others = list.filter((s) => !s.current)

  return (
    <Section title="Active devices" description="Where you are logged in right now. If you don't recognise one, log it out and change your password.">
      {sessions.isPending ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : sessions.isError ? (
        <p className="text-sm text-destructive">
          Couldn't load your devices.{' '}
          <button type="button" className="underline" onClick={() => sessions.refetch()}>
            Try again
          </button>
        </p>
      ) : (
        <>
          <ul className="divide-y">
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3 text-sm">
                <Monitor className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium">{s.device}</span>
                    {s.current && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">This device</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {s.current ? 'Active now' : `Last active ${timeAgo(s.lastSeenAt)}`}
                    {s.ip ? ` · ${s.ip}` : ''}
                  </span>
                </span>
                {!s.current && (
                  <Button type="button" variant="outline" size="sm" disabled={logOut.isPending} onClick={() => logOut.mutate(s.id)}>
                    Log out
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {others.length > 0 && (
            <div className="mt-3 border-t pt-3">
              {confirmAll ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm">Log out {others.length} other device{others.length === 1 ? '' : 's'}?</p>
                  <Button type="button" variant="destructive" size="sm" disabled={logOutOthers.isPending} onClick={() => logOutOthers.mutate()}>
                    {logOutOthers.isPending && <Loader2 className="animate-spin" />} Yes, log them out
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmAll(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmAll(true)}>
                  Log out all other devices
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Section>
  )
}

export default function Settings() {
  const { user, setUser, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const google = useGoogleProvider().data?.google
  const [error, setError] = useState<string | null>(null)
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [roomOpen, setRoomOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  if (!user) return null

  async function choosePhoto(file: File | undefined) {
    if (!file) return
    setSavingPhoto(true)
    try {
      const fd = new FormData()
      fd.set('image', await avatarImage(file))
      const { user: updated } = await api.post<{ user: User }>('/profile/avatar', fd)
      setUser(updated)
      toast.success('Profile picture updated')
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't use that picture. Try a JPEG, PNG or WebP image."))
    } finally {
      setSavingPhoto(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function removePhoto() {
    setSavingPhoto(true)
    try {
      const { user: updated } = await api.del<{ user: User }>('/profile/avatar')
      setUser(updated)
      toast.success('Profile picture removed')
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't remove it. Check your connection and try again."))
    } finally {
      setSavingPhoto(false)
    }
  }

  async function toggleEmail(on: boolean) {
    setSavingEmail(true)
    try {
      const { user: updated } = await api.patch<{ user: User }>('/auth/preferences', { emailNotifications: on })
      setUser(updated)
      toast.success(on ? 'Email notifications turned on' : 'Email notifications turned off')
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't save that. Check your connection and try again."))
    } finally {
      setSavingEmail(false)
    }
  }

  async function connectGoogle(credential: string) {
    setError(null)
    try {
      const { user: updated } = await api.post<{ user: User }>('/auth/google/link', { credential })
      setUser(updated)
      toast.success('Google account connected')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Your profile, how you sign in, and how FixNest looks." />
      <div className="space-y-6">
        <Section title="Profile">
          <div className="mb-3 flex items-center gap-4">
            <UserAvatar user={user} className="size-16 text-lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{user.name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={savingPhoto} onClick={() => fileInput.current?.click()}>
                  {savingPhoto && <Loader2 className="animate-spin" />} {user.avatarUrl ? 'Change photo' : 'Add photo'}
                </Button>
                {user.customAvatar && (
                  <Button type="button" size="sm" variant="ghost" disabled={savingPhoto} onClick={removePhoto}>
                    Remove
                  </Button>
                )}
              </div>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Choose a profile picture" onChange={(e) => choosePhoto(e.target.files?.[0])} />
            </div>
          </div>
          <dl className="divide-y">
            <Row label="Role">{ROLE_LABEL[user.role]}</Row>
            {user.role === 'student' && user.hostelName && (
              <>
                <Row label="Hostel">{user.hostelName}</Row>
                <Row label="Room">{user.roomNumber}</Row>
              </>
            )}
          </dl>
          <MobileNumber />
          {user.role === 'student' && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4">
              <Button type="button" size="sm" variant="outline" disabled={!!user.roomChangeAllowedAt} onClick={() => setRoomOpen(true)}>
                Change room
              </Button>
              <p className="text-xs text-muted-foreground">
                {user.roomChangeAllowedAt
                  ? `You can change your room again on ${new Date(user.roomChangeAllowedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.`
                  : 'You can change your hostel or room once every 30 days.'}
              </p>
            </div>
          )}
          {roomOpen && <ChangeRoomDialog open onClose={() => setRoomOpen(false)} />}
        </Section>

        <Section title="Sign-in methods" description="Connect Google to log in faster and use your Google profile picture.">
          <ul className="divide-y">
            <li className="flex items-center justify-between gap-3 py-3 text-sm">
              <span>
                <span className="block font-medium">Email and password</span>
                <span className="block text-muted-foreground">{user.email}</span>
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">Active</span>
            </li>
            <li className="py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-medium">Google</span>
                  <span className="block text-muted-foreground">
                    {user.googleLinked ? `Connected to ${user.email}` : google ? `Use the Google account for ${user.email}` : "Google sign-in isn't set up on this server yet."}
                  </span>
                </span>
                {!!user.googleLinked && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">Connected</span>
                )}
              </div>
              {!user.googleLinked && google && (
                <div className="mt-3 space-y-2">
                  <FormError message={error} />
                  <GoogleButton onCredential={connectGoogle} text="continue_with" />
                </div>
              )}
            </li>
          </ul>
        </Section>

        <Section title="Email notifications" description="Get an email when something changes on a complaint you are involved in. You always see them in the app too.">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg py-1">
            <span className="min-w-0 text-sm">
              <span className="block font-medium">Send me emails</span>
              <span className="block truncate text-muted-foreground">To {user.email}</span>
            </span>
            <input type="checkbox" role="switch" className="peer sr-only" checked={!!user.emailNotifications} disabled={savingEmail} onChange={(e) => toggleEmail(e.target.checked)} />
            <span
              aria-hidden
              className="relative h-6 w-11 shrink-0 rounded-full bg-input transition-colors peer-checked:bg-primary peer-disabled:opacity-60 peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
            />
          </label>
        </Section>

        <ActiveDevices />

        <Section title="Appearance">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                role="radio"
                aria-checked={theme === value}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm font-medium transition-all',
                  theme === value ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>
        </Section>

        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={async () => {
            await logout()
            navigate('/login', { replace: true })
          }}
        >
          <LogOut /> Log out
        </Button>

        <p className="pt-2 text-xs text-muted-foreground">
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy policy
          </Link>
          {' · '}
          <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
            Terms of service
          </Link>
        </p>

      </div>
    </div>
  )
}
