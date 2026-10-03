import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Camera, CheckCircle2, Clock, Loader2, MapPin, MessageSquare, Send, User, UserCog, X } from '@/components/icons'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ComplaintActions } from '@/components/ComplaintActions'
import { ErrorState } from '@/components/states'
import { OverdueBadge, PriorityBadge, StatusBadge, STATUS_META } from '@/components/status'
import { StatusTimeline } from '@/components/StatusTimeline'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiError, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatFull, locationLabel, timeAgo } from '@/lib/format'
import { compressImage } from '@/lib/image'
import type { Complaint, TimelineItem } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Detail {
  complaint: Complaint
  timeline: TimelineItem[]
}

const ROLE_LABEL = { student: 'Student', staff: 'Staff', warden: 'Warden', admin: 'Admin' } as const

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 text-sm">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="font-medium">{children}</div>
      </div>
    </div>
  )
}

const isVideo = (src: string) => /.(mp4|mov|webm)$/.test(src)

/** A photo (tap to enlarge) or, for a video the student attached, a player with a download link as a fallback. */
function Photo({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false)
  if (isVideo(src)) {
    return (
      <div className="mt-3">
        <video src={src} controls playsInline preload="metadata" aria-label={alt.replace(/^Photo/, 'Video')} className="max-h-72 w-full rounded-lg border bg-black sm:w-auto" />
        <a href={src} download className="mt-1 inline-block text-xs text-primary hover:underline">
          Download video
        </a>
      </div>
    )
  }
  return (
    <>
      <button onClick={() => setOpen(true)} className="mt-3 block overflow-hidden rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`Open photo: ${alt}`}>
        <img src={src} alt={alt} loading="lazy" className="max-h-64 w-full object-cover transition-transform hover:scale-[1.02] sm:w-auto" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-2 sm:max-w-3xl">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <img src={src} alt={alt} className="max-h-[80vh] w-full rounded-md object-contain" />
        </DialogContent>
      </Dialog>
    </>
  )
}

function ActivityItem({ item }: { item: TimelineItem }) {
  const isNote = item.type === 'note'
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
          isNote ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden
      >
        {isNote ? <MessageSquare className="size-3.5" /> : <Clock className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{item.actor.name}</span>{' '}
          <span className="text-muted-foreground">
            ({ROLE_LABEL[item.actor.role]}) · {timeAgo(item.createdAt)}
          </span>
        </p>
        {isNote ? (
          <div className="mt-1 rounded-lg rounded-tl-none bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{item.note}</div>
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {item.toStatus ? `Status: ${STATUS_META[item.toStatus].label}` : item.note}
            {item.type === 'status' && item.note && item.toStatus && item.note !== 'Complaint submitted' ? ` · ${item.note}` : ''}
          </p>
        )}
        {item.imageUrl && <Photo src={item.imageUrl} alt="Attached photo" />}
      </div>
    </li>
  )
}

function AddNote({ code, onDone }: { code: string; onDone: () => void }) {
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const send = useMutation({
    mutationFn: (fd: FormData) => api.post(`/complaints/${code}/notes`, fd),
    onSuccess: () => {
      setNote('')
      setPhoto(null)
      setError(null)
      toast.success('Note added')
      onDone()
    },
    onError: (e) => setError(errorMessage(e, "Couldn't add your note. Check your connection and try again.")),
  })
  return (
    <form
      className="mt-5 space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!note.trim()) return setError('Write a note first.')
        const fd = new FormData()
        fd.set('note', note.trim())
        if (photo) fd.set('image', photo)
        send.mutate(fd)
      }}
    >
      <Textarea aria-label="Add a note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add more details or an update..." aria-invalid={!!error} />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Attach a photo" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPhoto(await compressImage(f)) }} />
          <Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
            <Camera /> Photo
          </Button>
          {photo && (
            <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              {photo.name.slice(0, 16)}
              <button type="button" aria-label="Remove photo" onClick={() => setPhoto(null)}>
                <X className="size-3" />
              </button>
            </span>
          )}
        </div>
        <Button type="submit" size="sm" disabled={send.isPending}>
          {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Add note
        </Button>
      </div>
    </form>
  )
}

export default function ComplaintDetail() {
  const { code = '' } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['complaint', code],
    queryFn: () => api.get<Detail>(`/complaints/${code}`),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 1,
    refetchInterval: 30_000,
  })

  function refresh() {
    qc.invalidateQueries({ queryKey: ['complaint', code] })
    qc.invalidateQueries({ queryKey: ['complaints'] })
    qc.invalidateQueries({ queryKey: ['summary'] })
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  const cancel = useMutation({
    mutationFn: () => api.post<Detail>(`/complaints/${code}/cancel`),
    onSuccess: () => {
      setConfirmCancel(false)
      toast.success('Complaint cancelled')
      refresh()
    },
    onError: (e) => {
      setConfirmCancel(false)
      toast.error(errorMessage(e, "Couldn't cancel. Check your connection and try again."))
    },
  })

  const back = (
    <Link to="/complaints" className="mb-2 inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Back to complaints
    </Link>
  )

  if (isPending) {
    return (
      <div>
        {back}
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }
  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div>
        {back}
        <ErrorState title={notFound ? 'Complaint not found' : "Couldn't load this complaint"} error={error} onRetry={notFound ? undefined : () => refetch()} />
      </div>
    )
  }

  const { complaint: c, timeline } = data
  const isStudent = user!.role === 'student'
  const open = ['submitted', 'assigned', 'in_progress'].includes(c.status)
  const canCancel = isStudent && (c.status === 'submitted' || c.status === 'assigned')

  return (
    <div>
      {back}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{c.code}</h1>
            <StatusBadge status={c.status} />
            <PriorityBadge priority={c.priority} />
            {c.isOverdue && <OverdueBadge />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {c.category.name} · Submitted {formatFull(c.createdAt)}
          </p>
        </div>
        {canCancel && (
          <Button variant="destructive" onClick={() => setConfirmCancel(true)}>
            Cancel complaint
          </Button>
        )}
      </div>

      <ComplaintActions complaint={c} onChanged={refresh} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-2 text-sm font-semibold">Problem</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{c.description}</p>
            {c.imageUrl && <Photo src={c.imageUrl} alt="Photo of the problem" />}
          </section>

          {c.status === 'fixed' && (
            <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" /> Resolved
              </h2>
              <p className="text-sm">{c.resolutionNote ?? 'This problem has been fixed.'}</p>
              {c.resolvedAt && <p className="mt-1 text-xs text-muted-foreground">{formatFull(c.resolvedAt)}</p>}
              {c.resolutionImageUrl && <Photo src={c.resolutionImageUrl} alt="Photo of the completed fix" />}
            </section>
          )}

          {c.status === 'rejected' && (
            <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
              <h2 className="mb-1 text-sm font-semibold text-rose-700 dark:text-rose-300">Not accepted</h2>
              <p className="text-sm">{c.resolutionNote ?? 'This complaint was rejected.'}</p>
            </section>
          )}

          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Activity</h2>
            <ul className="space-y-4">
              {timeline.map((t) => (
                <ActivityItem key={t.id} item={t} />
              ))}
            </ul>
            {open ? <AddNote code={c.code} onDone={refresh} /> : <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">This complaint is closed, so notes are turned off.</p>}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Progress</h2>
            <StatusTimeline complaint={c} timeline={timeline} />
          </section>
          <section className="rounded-xl border bg-card px-5 py-2">
            <h2 className="pb-1 pt-3 text-sm font-semibold">Details</h2>
            <div className="divide-y">
              <DetailRow icon={<MapPin className="size-4" />} label="Location">
                {locationLabel(c.location)}
                {c.location.floor != null && <span className="text-muted-foreground"> · Floor {c.location.floor}</span>}
              </DetailRow>
              <DetailRow icon={<UserCog className="size-4" />} label="Assigned to">
                {c.assignedStaff ? c.assignedStaff.name : <span className="font-normal text-muted-foreground">Not assigned yet</span>}
              </DetailRow>
              {!isStudent && (
                <DetailRow icon={<User className="size-4" />} label="Reported by">
                  {c.student.name}
                  {c.student.email && <span className="block text-xs font-normal text-muted-foreground">{c.student.email}</span>}
                </DetailRow>
              )}
              {open && (
                <DetailRow icon={<Clock className="size-4" />} label="Target resolution">
                  <span className={cn(c.isOverdue && 'text-destructive')}>{formatFull(c.dueAt)}</span>
                </DetailRow>
              )}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this complaint?</DialogTitle>
            <DialogDescription>{c.code} will be closed and nobody will work on it. You can always file a new one.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              {cancel.isPending && <Loader2 className="animate-spin" />} Yes, cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
