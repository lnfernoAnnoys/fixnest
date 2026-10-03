import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Field, FormError } from '@/components/Field'
import { Loader2, Search } from '@/components/icons'
import { NativeSelect } from '@/components/NativeSelect'
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/UserAvatar'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { ManagedUser, Page } from '@/lib/types'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25

/** A readable temporary password (no look-alike characters). */
function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export default function People() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const { user: me } = useAuth()
  const isAdmin = me?.role === 'admin'
  const tab = params.get('tab')
  const role = tab === 'staff' ? 'staff' : tab === 'warden' && isAdmin ? 'warden' : 'student'
  const active = params.get('active') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [search, setSearch] = useState(params.get('q') ?? '')
  const q = params.get('q') ?? ''

  function set(changes: Record<string, string>, keepPage = false) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k)
    if (!keepPage) next.delete('page')
    setParams(next, { replace: true })
  }
  useEffect(() => {
    const t = setTimeout(() => search.trim() !== q && set({ q: search.trim() }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const query = new URLSearchParams({ role, page: String(page), pageSize: String(PAGE_SIZE) })
  if (q) query.set('q', q)
  if (active) query.set('active', active)
  const users = useQuery({
    queryKey: ['admin', 'users', query.toString()],
    queryFn: () => api.get<Page<ManagedUser>>(`/admin/users?${query}`),
    placeholderData: keepPreviousData,
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    qc.invalidateQueries({ queryKey: ['staff'] })
  }

  const [toggle, setToggle] = useState<ManagedUser | null>(null)
  const [reset, setReset] = useState<ManagedUser | null>(null)
  const [adding, setAdding] = useState(false)

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => api.patch(`/admin/users/${id}`, { active }),
    onSuccess: (_d, v) => {
      toast.success(v.active ? 'Account reactivated' : 'Account deactivated')
      setToggle(null)
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const items = users.data?.items ?? []
  const total = users.data?.total ?? 0
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(total, page * PAGE_SIZE)
  const stale = users.isFetching && users.isPlaceholderData

  return (
    <div>
      <PageHeader
        title="People"
        description={isAdmin ? 'Students sign up themselves. Maintenance staff and wardens are added here.' : 'Students sign up themselves. Maintenance staff accounts are added here.'}
        actions={role !== 'student' && <Button onClick={() => setAdding(true)}>{role === 'warden' ? 'Add warden' : 'Add staff member'}</Button>}
      />

      <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1 sm:inline-flex" role="tablist" aria-label="People">
        {(isAdmin ? (['student', 'staff', 'warden'] as const) : (['student', 'staff'] as const)).map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={role === r}
            onClick={() => set({ tab: r === 'student' ? '' : r, page: '' })}
            className={cn('flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none', role === r ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {r === 'student' ? 'Students' : r === 'staff' ? 'Maintenance staff' : 'Wardens'}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" className="h-10 pl-9" aria-label="Search people" />
        </div>
        <NativeSelect aria-label="Account status" value={active} onChange={(e) => set({ active: e.target.value })} className="h-10 sm:w-44">
          <option value="">Active and deactivated</option>
          <option value="1">Active only</option>
          <option value="0">Deactivated only</option>
        </NativeSelect>
      </div>

      {users.isPending ? (
        <ListSkeleton rows={5} />
      ) : users.isError && !users.data ? (
        <ErrorState error={users.error} onRetry={() => users.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={q || active ? 'Nobody matches that' : role === 'staff' ? 'No maintenance staff yet' : role === 'warden' ? 'No wardens yet' : 'No students yet'}
          body={q || active ? 'Try a different search or filter.' : role === 'staff' ? 'Add your first staff member so complaints can be assigned.' : role === 'warden' ? 'Add a warden to run the hostel day to day.' : 'Students appear here once they sign up.'}
          action={role !== 'student' && !q && !active ? <Button onClick={() => setAdding(true)}>{role === 'warden' ? 'Add warden' : 'Add staff member'}</Button> : undefined}
        />
      ) : (
        <div className={cn('transition-opacity', stale && 'opacity-60')} aria-busy={stale}>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {items.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <UserAvatar user={u} className={cn('size-10', !u.active && 'opacity-50')} />
                <div className="min-w-0 flex-1 basis-56">
                  <p className={cn('truncate text-sm font-medium', !u.active && 'text-muted-foreground line-through')}>{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email}
                    {u.phone && ` · ${u.phone}`}
                    {u.googleLinked && ' · Google connected'}
                  </p>
                </div>
                <div className="basis-48 text-sm text-muted-foreground">
                  {u.role === 'student' ? (
                    <>
                      <p>{u.hostel ? `${u.hostel} · Room ${u.room}` : 'No room set'}</p>
                      <p className="text-xs">{u.complaintsFiled} complaint{u.complaintsFiled === 1 ? '' : 's'} filed</p>
                    </>
                  ) : u.role === 'warden' ? (
                    <p>Warden</p>
                  ) : (
                    <>
                      <p>{u.specialty ?? 'No specialty'}</p>
                      <p className="text-xs">{u.openAssigned} open job{u.openAssigned === 1 ? '' : 's'}</p>
                    </>
                  )}
                </div>
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', u.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-400/15 dark:text-zinc-400')}>
                  {u.active ? 'Active' : 'Deactivated'}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setReset(u)}>
                    Reset password
                  </Button>
                  <Button variant={u.active ? 'destructive' : 'outline'} size="sm" onClick={() => (u.active ? setToggle(u) : setActive.mutate({ id: u.id, active: true }))}>
                    {u.active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {from}–{to} of {total}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) }, true)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={to >= total} onClick={() => set({ page: String(page + 1) }, true)}>
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!toggle} onOpenChange={(o) => !o && setToggle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {toggle?.name}?</DialogTitle>
            <DialogDescription>
              They will be signed out immediately and won't be able to log in again until you reactivate them.
              {toggle?.role === 'staff' && toggle.openAssigned > 0 && ` They still have ${toggle.openAssigned} open job(s). Those stay assigned to them until you move them to someone else.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToggle(null)}>
              Keep active
            </Button>
            <Button variant="destructive" disabled={setActive.isPending} onClick={() => toggle && setActive.mutate({ id: toggle.id, active: false })}>
              {setActive.isPending && <Loader2 className="animate-spin" />} Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddStaffDialog open={adding} onOpenChange={setAdding} onDone={refresh} kind={role === 'warden' ? 'warden' : 'staff'} />
      <ResetPasswordDialog user={reset} onClose={() => setReset(null)} />
    </div>
  )
}

function AddStaffDialog({ open, onOpenChange, onDone, kind }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void; kind: 'staff' | 'warden' }) {
  const empty = { name: '', email: '', specialty: '', phone: '', password: '' }
  const [form, setForm] = useState(empty)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const create = useMutation({
    mutationFn: () => api.post('/admin/users', { ...form, role: kind, name: form.name.trim(), email: form.email.trim() }),
    onSuccess: () => {
      toast.success(`${form.name.trim()} added. Share their password with them securely.`)
      setForm(empty)
      onOpenChange(false)
      onDone()
    },
    onError: (e) => setError(errorMessage(e)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.name.trim().length < 2) return setError('Enter their full name.')
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Enter a valid email address.')
    if (form.password.length < 8) return setError('The password needs at least 8 characters.')
    create.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === 'warden' ? 'Add a warden' : 'Add a maintenance staff member'}</DialogTitle>
          <DialogDescription>If their email is a Google account, they can also sign in with Google.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <FormError message={error} />
          <Field label="Full name">{(p) => <Input {...p} value={form.name} onChange={set('name')} autoFocus />}</Field>
          <Field label="Email">{(p) => <Input {...p} type="email" value={form.email} onChange={set('email')} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            {kind === 'staff' && <Field label="Specialty">{(p) => <Input {...p} value={form.specialty} onChange={set('specialty')} placeholder="e.g. Electrician" />}</Field>}
            <Field label="Phone" className={kind === 'warden' ? 'col-span-2' : undefined}>{(p) => <Input {...p} type="tel" value={form.phone} onChange={set('phone')} />}</Field>
          </div>
          <Field label="Temporary password" hint="They can use it to log in. Share it with them securely.">
            {(p) => (
              <div className="flex gap-2">
                <Input {...p} value={form.password} onChange={set('password')} className="font-mono" />
                <Button type="button" variant="outline" onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}>
                  Generate
                </Button>
              </div>
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />} {kind === 'warden' ? 'Add warden' : 'Add staff member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: ManagedUser | null; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => api.post(`/admin/users/${user!.id}/reset-password`, { password }),
    onSuccess: () => {
      toast.success(`Password reset for ${user!.name}. Share it with them securely.`)
      setPassword('')
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && !save.isPending && (setPassword(''), setError(null), onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {user?.name}</DialogTitle>
          <DialogDescription>Set a new password. They will be signed out on every device and must log in again.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <FormError message={error} />
          <Field label="New password" hint="At least 8 characters.">
            {(p) => (
              <div className="flex gap-2">
                <Input {...p} value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" autoFocus />
                <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())}>
                  Generate
                </Button>
              </div>
            )}
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => {
              setError(null)
              if (password.length < 8) return setError('The password needs at least 8 characters.')
              save.mutate()
            }}
          >
            {save.isPending && <Loader2 className="animate-spin" />} Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
