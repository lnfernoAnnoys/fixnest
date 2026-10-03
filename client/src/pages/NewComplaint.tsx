import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Armchair,
  Camera,
  Droplet,
  Ellipsis,
  Hammer,
  Loader2,
  MapPin,
  Send,
  Sparkles,
  TriangleAlert,
  Wifi,
  X,
  Zap,
  Wrench,
  type LucideIcon,
} from '@/components/icons'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Field, FormError } from '@/components/Field'
import { HostelSelect, LocationFields } from '@/components/LocationFields'
import { PageHeader } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { compressImage } from '@/lib/image'
import type { Category, Complaint, Priority } from '@/lib/types'
import { cn } from '@/lib/utils'

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_VIDEO_BYTES = 25 * 1024 * 1024

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Electrical: Zap,
  Plumbing: Wrench,
  Furniture: Armchair,
  'Wi-Fi / Internet': Wifi,
  Cleaning: Sparkles,
  'Water Supply': Droplet,
  'Room Maintenance': Hammer,
  Other: Ellipsis,
}

/** The urgency blocks warm up from grey to red as the choice gets more serious. Full class names so Tailwind can see them. */
const PRIORITY_TONE: Record<Priority, { on: string; off: string }> = {
  low: { on: 'border-slate-400 bg-slate-500/10 ring-1 ring-slate-400', off: 'hover:border-slate-400/60' },
  medium: { on: 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500', off: 'hover:border-blue-500/50' },
  high: { on: 'border-orange-500 bg-orange-500/15 ring-1 ring-orange-500', off: 'hover:border-orange-500/50' },
  urgent: { on: 'border-red-500 bg-red-500/15 ring-1 ring-red-500', off: 'hover:border-red-500/50' },
}

const PRIORITIES: { value: Priority; label: string; hint: string }[] = [
  { value: 'low', label: 'Low', hint: 'Can wait' },
  { value: 'medium', label: 'Medium', hint: 'Normal' },
  { value: 'high', label: 'High', hint: 'Soon' },
  { value: 'urgent', label: 'Urgent', hint: 'Safety risk' },
]

type Mode = 'mine' | 'other' | 'common'

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px] text-primary">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function NewComplaint() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ categories: Category[] }>('/categories'), staleTime: 10 * 60_000 })

  const [mode, setMode] = useState<Mode>('mine')
  const [otherHostel, setOtherHostel] = useState('')
  const [otherRoom, setOtherRoom] = useState('')
  const [commonHostel, setCommonHostel] = useState(user?.hostelName ?? '')
  const [commonNote, setCommonNote] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [pendingPriority, setPendingPriority] = useState<'high' | 'urgent' | null>(null)
  const [attachment, setAttachment] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!attachment) return setPreview(null)
    const url = URL.createObjectURL(attachment)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [attachment])

  const submit = useMutation({
    mutationFn: (fd: FormData) => api.post<{ complaint: Complaint }>('/complaints', fd),
    onSuccess: ({ complaint }) => {
      qc.invalidateQueries({ queryKey: ['complaints'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      toast.success(`Complaint ${complaint.code} submitted`)
      navigate(`/complaints/${complaint.code}`, { replace: true })
    },
    onError: (e) => setFormError(errorMessage(e, "Couldn't submit your complaint. Check your connection and try again.")),
  })

  /** High and Urgent ask for a second look first, so nobody picks them just to be served sooner. */
  function choosePriority(p: Priority) {
    if (p === priority) return
    if (p === 'high' || p === 'urgent') setPendingPriority(p)
    else setPriority(p)
  }

  /** A photo is shrunk first; a video is sent as it is, so it only has to fit the size limit. */
  async function pickFile(file: File | undefined) {
    if (!file) return
    const fail = (message: string) => setErrors((e) => ({ ...e, attachment: message }))
    if (file.type.startsWith('image/')) {
      fail('')
      return setAttachment(await compressImage(file))
    }
    if (!VIDEO_TYPES.includes(file.type)) return fail('Attach a photo (JPEG, PNG or WebP) or a video (MP4, WebM or MOV).')
    if (file.size > MAX_VIDEO_BYTES) return fail('That video is too large. Choose one under 25 MB.')
    fail('')
    setAttachment(file)
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    setFormError(null)
    const e: Record<string, string> = {}
    if (!categoryId) e.category = 'Pick what kind of problem it is.'
    if (description.trim().length < 10) e.description = 'Describe the problem in at least 10 characters.'
    if (mode === 'other' && (!otherHostel.trim() || !otherRoom.trim())) e.location = 'Choose the hostel and type the room number.'
    if (mode === 'common' && (!commonHostel.trim() || !commonNote.trim())) e.location = 'Choose the hostel and say where it is.'
    setErrors(e)
    if (Object.keys(e).length) {
      document.querySelector('[data-error="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    const fd = new FormData()
    fd.set('categoryId', String(categoryId))
    fd.set('description', description.trim())
    fd.set('priority', priority)
    if (mode === 'other') (fd.set('hostelName', otherHostel.trim()), fd.set('roomNumber', otherRoom.trim()))
    if (mode === 'common') (fd.set('hostelName', commonHostel.trim()), fd.set('locationNote', commonNote.trim()))
    if (attachment) fd.set('image', attachment)
    submit.mutate(fd)
  }

  const modes: { key: Mode; label: string }[] = [
    { key: 'mine', label: 'My room' },
    { key: 'other', label: 'Another room' },
    { key: 'common', label: 'Common area' },
  ]

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Report a problem" description="It takes under a minute. We'll keep you updated." />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={formError} />

        <Step n={1} title="Where is the problem?">
          <div className="mb-3 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1" role="radiogroup" aria-label="Location type">
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={mode === m.key}
                onClick={() => setMode(m.key)}
                className={cn(
                  'flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  mode === m.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'mine' && (
            <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm">
              <MapPin className="size-4 text-muted-foreground" aria-hidden />
              {user!.hostelName ? (
                <span>
                  <strong>{user!.hostelName}</strong> · Room {user!.roomNumber}
                </span>
              ) : (
                'Your room is not set. Choose "Another room".'
              )}
            </div>
          )}
          {mode === 'other' && (
            <div data-error={!!errors.location}>
              <LocationFields compact hostel={otherHostel} room={otherRoom} onHostel={setOtherHostel} onRoom={setOtherRoom} errors={{ hostel: errors.location, room: errors.location }} />
            </div>
          )}
          {mode === 'common' && (
            <div className="space-y-3" data-error={!!errors.location}>
              <HostelSelect value={commonHostel} onChange={setCommonHostel} />
              <Input aria-label="Where exactly" placeholder="e.g. 2nd floor washroom, mess hall" maxLength={120} value={commonNote} onChange={(e) => setCommonNote(e.target.value)} />
            </div>
          )}
          {errors.location && <p className="mt-2 text-xs text-destructive">{errors.location}</p>}
        </Step>

        <Step n={2} title="What kind of problem?">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Category" data-error={!!errors.category}>
            {categories.isPending
              ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)
              : categories.data?.categories.map((c) => {
                  const Icon = CATEGORY_ICONS[c.name] ?? Ellipsis
                  const on = categoryId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setCategoryId(c.id)}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-center text-xs font-medium leading-tight transition-all',
                        on ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                      {c.name}
                    </button>
                  )
                })}
          </div>
          {categories.isError && <p className="mt-2 text-xs text-destructive">Couldn't load categories. Refresh and try again.</p>}
          {errors.category && <p className="mt-2 text-xs text-destructive">{errors.category}</p>}
        </Step>

        <Step n={3} title="Describe it">
          <Field label="What's wrong?" error={errors.description} className="[&>label]:sr-only">
            {(p) => (
              <Textarea {...p} data-error={!!errors.description} rows={4} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. The ceiling fan makes a loud noise and stops after a few minutes." />
            )}
          </Field>
          <p className="mt-1 text-right text-[11px] text-muted-foreground">{description.length}/1000</p>

          <div className="mt-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              className="sr-only"
              onChange={(e) => (pickFile(e.target.files?.[0]), (e.target.value = ''))}
              aria-label="Attach a photo or video"
            />
            {preview && attachment ? (
              <div className="relative inline-block">
                {attachment.type.startsWith('video/') ? (
                  <video src={`${preview}#t=0.1`} muted playsInline preload="metadata" aria-label="Selected video preview" className="h-28 w-28 rounded-lg border object-cover" />
                ) : (
                  <img src={preview} alt="Selected photo preview" className="h-28 w-28 rounded-lg border object-cover" />
                )}
                <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment" className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow">
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                <Camera /> Attach file
              </Button>
            )}
            {errors.attachment && <p className="mt-2 text-xs text-destructive">{errors.attachment}</p>}
          </div>
        </Step>

        <Step n={4} title="How urgent is it?">
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Priority">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={priority === p.value}
                onClick={() => choosePriority(p.value)}
                className={cn('rounded-lg border px-2 py-2.5 text-center transition-all', priority === p.value ? PRIORITY_TONE[p.value].on : cn('bg-background', PRIORITY_TONE[p.value].off))}
              >
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="block text-[11px] text-muted-foreground">{p.hint}</span>
              </button>
            ))}
          </div>
        </Step>

        <Dialog open={pendingPriority !== null} onOpenChange={(o) => !o && setPendingPriority(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TriangleAlert className={cn('size-5', pendingPriority === 'urgent' ? 'text-red-500' : 'text-orange-500')} aria-hidden />
                Is this really {pendingPriority === 'urgent' ? 'urgent' : 'high priority'}?
              </DialogTitle>
              <DialogDescription>
                {pendingPriority === 'urgent'
                  ? 'Urgent is only for a safety risk, like sparks from a switchboard, a serious leak or a lock that will not open.'
                  : 'High is for a problem that needs fixing soon, like no water, or a door that will not lock.'}
              </DialogDescription>
            </DialogHeader>
            <p className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2.5 text-sm">
              Please do not pick a higher urgency just to get your complaint fixed sooner. The warden can see and change the priority, and
              students who misuse it may face consequences.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPendingPriority(null)}>
                Go back
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setPriority(pendingPriority!)
                  setPendingPriority(null)
                }}
              >
                Yes, it is {pendingPriority === 'urgent' ? 'urgent' : 'high'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={submit.isPending}>
          {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />} {submit.isPending ? 'Submitting...' : 'Submit complaint'}
        </Button>
      </form>
    </div>
  )
}
