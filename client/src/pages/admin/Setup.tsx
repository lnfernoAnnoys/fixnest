import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Field, FormError } from '@/components/Field'
import { Loader2 } from '@/components/icons'
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api, errorMessage } from '@/lib/api'
import type { AdminCategory, AdminHostel } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function Setup() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'categories' ? 'categories' : 'rooms'
  return (
    <div>
      <PageHeader title="Setup" description="The hostels and their rooms, and the kinds of problem students can report." />
      <div className="mb-5 flex gap-1 rounded-lg bg-muted p-1 sm:inline-flex" role="tablist" aria-label="Setup">
        {[
          ['rooms', 'Hostels and rooms'],
          ['categories', 'Categories'],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === 'rooms' ? {} : { tab: key }, { replace: true })}
            className={cn('flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none', tab === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'rooms' ? <RoomsPanel /> : <CategoriesPanel />}
    </div>
  )
}

// ---- small reusable dialog: ask for one name -------------------------------------------------------

function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  initial = '',
  confirmLabel,
  submit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: string
  label: string
  initial?: string
  confirmLabel: string
  submit: (name: string) => Promise<unknown>
}) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) (setName(initial), setError(null))
  }, [open, initial])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (name.trim().length < 2) return setError('Enter at least 2 characters.')
    setBusy(true)
    try {
      await submit(name.trim())
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <FormError message={error} />
          <Field label={label}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />}</Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---- hostels and rooms ---------------------------------------------------------------------------------

function RoomsPanel() {
  const qc = useQueryClient()
  const hostels = useQuery({ queryKey: ['admin', 'hostels'], queryFn: () => api.get<{ hostels: AdminHostel[] }>('/admin/hostels') })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'hostels'] })
    qc.invalidateQueries({ queryKey: ['hostels'] })
  }
  const [newHostel, setNewHostel] = useState(false)
  const [rename, setRename] = useState<AdminHostel | null>(null)
  const [addTo, setAddTo] = useState<AdminHostel | null>(null)
  const [roomId, setRoomId] = useState<number | null>(null)

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/admin/hostels/${id}`),
    onSuccess: () => (toast.success('Hostel deleted'), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (hostels.isPending) return <ListSkeleton rows={2} />
  if (hostels.isError) return <ErrorState error={hostels.error} onRetry={() => hostels.refetch()} />

  const all = hostels.data.hostels
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setNewHostel(true)}>Add hostel</Button>
      </div>

      {all.length === 0 && <EmptyState title="No hostels yet" body="Add your hostels. Students can only choose from these, so nobody can make up a hostel. Rooms appear as students sign up." action={<Button onClick={() => setNewHostel(true)}>Add hostel</Button>} />}

      {all.map((h) => {
        const floors = [...new Set(h.rooms.map((r) => r.floor))].sort((a, b) => a - b)
        return (
          <section key={h.id} className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{h.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {h.rooms.length} room{h.rooms.length === 1 ? '' : 's'} · {h.complaints} complaint{h.complaints === 1 ? '' : 's'} so far
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setRename(h)}>
                  Rename
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAddTo(h)}>
                  Add rooms
                </Button>
                {h.rooms.length === 0 && h.complaints === 0 && (
                  <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(h.id)}>
                    Delete
                  </Button>
                )}
              </div>
            </div>

            {h.rooms.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No rooms yet. They appear as students sign up, or use "Add rooms" to create a whole floor at once.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {floors.map((f) => (
                  <div key={f}>
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Floor {f}</h3>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {h.rooms
                        .filter((r) => r.floor === f)
                        .map((r) => (
                          <button
                            key={r.id}
                            onClick={() => setRoomId(r.id)}
                            title={`${r.students} student${r.students === 1 ? '' : 's'}, ${r.complaints} complaint${r.complaints === 1 ? '' : 's'}`}
                            className="min-w-14 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium outline-none transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            {r.number}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}

      <NameDialog
        open={newHostel}
        onOpenChange={setNewHostel}
        title="Add a hostel"
        label="Hostel name"
        confirmLabel="Add hostel"
        submit={async (name) => {
          await api.post('/admin/hostels', { name })
          toast.success(`${name} added`)
          refresh()
        }}
      />
      <NameDialog
        open={!!rename}
        onOpenChange={(o) => !o && setRename(null)}
        title="Rename hostel"
        label="Hostel name"
        initial={rename?.name}
        confirmLabel="Save"
        submit={async (name) => {
          await api.patch(`/admin/hostels/${rename!.id}`, { name })
          toast.success('Renamed')
          refresh()
        }}
      />
      <AddRoomsDialog hostel={addTo} onClose={() => setAddTo(null)} onDone={refresh} />
      <RoomDialog roomId={roomId} onClose={() => setRoomId(null)} onChanged={refresh} hostels={all} />
    </div>
  )
}

function AddRoomsDialog({ hostel, onClose, onDone }: { hostel: AdminHostel | null; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'range' | 'single'>('range')
  const [floor, setFloor] = useState('1')
  const [from, setFrom] = useState('101')
  const [to, setTo] = useState('110')
  const [single, setSingle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useMutation({
    mutationFn: () =>
      api.post<{ created: number; skipped: string[] }>(`/admin/hostels/${hostel!.id}/rooms`, mode === 'range' ? { floor: Number(floor), from: Number(from), to: Number(to) } : { floor: Number(floor), number: single.trim() }),
    onSuccess: (r) => {
      toast.success(`${r.created} room${r.created === 1 ? '' : 's'} added${r.skipped.length ? `, ${r.skipped.length} already existed` : ''}`)
      onDone()
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (floor === '' || Number.isNaN(Number(floor))) return setError('Enter the floor number (0 is the ground floor).')
    if (mode === 'range' && (from === '' || to === '')) return setError('Enter the first and last room number.')
    if (mode === 'single' && !single.trim()) return setError('Enter the room number.')
    add.mutate()
  }
  return (
    <Dialog open={!!hostel} onOpenChange={(o) => !o && !add.isPending && (setError(null), onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add rooms to {hostel?.name}</DialogTitle>
          <DialogDescription>Room numbers that already exist are skipped.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <FormError message={error} />
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="How many rooms">
            {(['range', 'single'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={cn('flex-1 rounded-md px-3 py-1.5 text-sm font-medium', mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
                {m === 'range' ? 'A run of rooms' : 'One room'}
              </button>
            ))}
          </div>
          <Field label="Floor">{(p) => <Input {...p} type="number" min={0} max={50} value={floor} onChange={(e) => setFloor(e.target.value)} />}</Field>
          {mode === 'range' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="First room number">{(p) => <Input {...p} type="number" min={0} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
              <Field label="Last room number">{(p) => <Input {...p} type="number" min={0} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
            </div>
          ) : (
            <Field label="Room number" hint="Letters, digits or dashes, e.g. 302 or G-04.">
              {(p) => <Input {...p} value={single} onChange={(e) => setSingle(e.target.value)} maxLength={10} />}
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={add.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending && <Loader2 className="animate-spin" />} Add rooms
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** One room: fix its number or floor, or delete it (only when nobody lives there and it has no complaints). */
function RoomDialog({ roomId, onClose, onChanged, hostels }: { roomId: number | null; onClose: () => void; onChanged: () => void; hostels: AdminHostel[] }) {
  const hostel = hostels.find((h) => h.rooms.some((r) => r.id === roomId))
  const room = hostel?.rooms.find((r) => r.id === roomId)
  const [number, setNumber] = useState('')
  const [floor, setFloor] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (room) (setNumber(room.number), setFloor(String(room.floor)))
    setError(null)
  }, [room?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => api.patch(`/admin/rooms/${roomId}`, { number: number.trim(), floor: Number(floor) }),
    onSuccess: () => (toast.success('Room updated'), onChanged()),
    onError: (e) => setError(errorMessage(e)),
  })
  const del = useMutation({
    mutationFn: () => api.del(`/admin/rooms/${roomId}`),
    onSuccess: () => (toast.success('Room deleted'), onChanged(), onClose()),
    onError: (e) => setError(errorMessage(e)),
  })

  const changed = room && (number.trim() !== room.number || Number(floor) !== room.floor)

  return (
    <Dialog open={roomId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hostel && room ? `${hostel.name} · Room ${room.number}` : 'Room'}</DialogTitle>
          <DialogDescription>Students add their own room when they sign up. Fix the number or the floor here.</DialogDescription>
        </DialogHeader>
        {room && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              setError(null)
              save.mutate()
            }}
          >
            <FormError message={error} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Room number">{(p) => <Input {...p} value={number} onChange={(e) => setNumber(e.target.value)} maxLength={10} />}</Field>
              <Field label="Floor">{(p) => <Input {...p} type="number" min={0} max={50} value={floor} onChange={(e) => setFloor(e.target.value)} />}</Field>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="destructive" size="sm" disabled={del.isPending} onClick={() => del.mutate()}>
                Delete room
              </Button>
              <Button type="submit" size="sm" disabled={!changed || save.isPending}>
                {save.isPending && <Loader2 className="animate-spin" />} Save changes
              </Button>
            </div>
            {(room.students > 0 || room.complaints > 0) && (
              <p className="text-xs text-muted-foreground">
                {room.students} student{room.students === 1 ? '' : 's'} and {room.complaints} complaint{room.complaints === 1 ? '' : 's'} are linked to this room, so it can't be deleted.
              </p>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---- categories -------------------------------------------------------------------------------------

function CategoriesPanel() {
  const qc = useQueryClient()
  const cats = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api.get<{ categories: AdminCategory[] }>('/admin/categories') })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'categories'] })
    qc.invalidateQueries({ queryKey: ['categories'] })
  }
  const [adding, setAdding] = useState(false)
  const [rename, setRename] = useState<AdminCategory | null>(null)
  const toggle = useMutation({
    mutationFn: (c: AdminCategory) => api.patch(`/admin/categories/${c.id}`, { active: !c.active }),
    onSuccess: (_d, c) => (toast.success(c.active ? `${c.name} turned off` : `${c.name} turned on`), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (cats.isPending) return <ListSkeleton rows={4} />
  if (cats.isError) return <ErrorState error={cats.error} onRetry={() => cats.refetch()} />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Turning a category off hides it from the complaint form. Existing complaints keep it.</p>
        <Button onClick={() => setAdding(true)}>Add category</Button>
      </div>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {cats.data.categories.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 basis-40">
              <p className={cn('truncate text-sm font-medium', !c.active && 'text-muted-foreground line-through')}>{c.name}</p>
              <p className="text-xs text-muted-foreground">
                {c.complaints} complaint{c.complaints === 1 ? '' : 's'}
              </p>
            </div>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', c.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-400/15 dark:text-zinc-400')}>
              {c.active ? 'On' : 'Off'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setRename(c)}>
                Rename
              </Button>
              <Button variant="outline" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate(c)}>
                {c.active ? 'Turn off' : 'Turn on'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <NameDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add a category"
        description="For example: Pest control, Laundry, Security."
        label="Category name"
        confirmLabel="Add category"
        submit={async (name) => {
          await api.post('/admin/categories', { name })
          toast.success(`${name} added`)
          refresh()
        }}
      />
      <NameDialog
        open={!!rename}
        onOpenChange={(o) => !o && setRename(null)}
        title="Rename category"
        label="Category name"
        initial={rename?.name}
        confirmLabel="Save"
        submit={async (name) => {
          await api.patch(`/admin/categories/${rename!.id}`, { name })
          toast.success('Renamed')
          refresh()
        }}
      />
    </div>
  )
}
