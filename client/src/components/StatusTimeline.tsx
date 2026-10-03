import { Check, X } from '@/components/icons'
import { STATUS_META } from '@/components/status'
import { formatDateTime } from '@/lib/format'
import type { Complaint, Status, TimelineItem } from '@/lib/types'
import { cn } from '@/lib/utils'

const STEPS: Status[] = ['submitted', 'assigned', 'in_progress', 'fixed']

const STEP_HINT: Record<Status, string> = {
  submitted: 'We received your complaint',
  assigned: 'A staff member was assigned',
  in_progress: 'Work has started',
  fixed: 'The problem was resolved',
  rejected: 'This complaint was not accepted',
  cancelled: 'This complaint was cancelled',
}

/** Vertical stepper: Submitted -> Assigned -> In progress -> Fixed (plus a red end step if closed early). */
export function StatusTimeline({ complaint, timeline }: { complaint: Complaint; timeline: TimelineItem[] }) {
  const reachedAt = new Map<Status, string>()
  for (const t of timeline) if (t.type === 'status' && t.toStatus && !reachedAt.has(t.toStatus)) reachedAt.set(t.toStatus, t.createdAt)

  const ended = complaint.status === 'cancelled' || complaint.status === 'rejected'
  const currentIdx = ended ? -1 : STEPS.indexOf(complaint.status)
  // For a closed complaint, show the steps it actually passed through.
  const steps: Status[] = ended ? [...STEPS.filter((s) => reachedAt.has(s)), complaint.status] : STEPS

  return (
    <ol className="relative space-y-0" aria-label="Complaint progress">
      {steps.map((step, i) => {
        const isEnd = ended && i === steps.length - 1
        const done = isEnd || (ended ? true : i < currentIdx || (i === currentIdx && step === 'fixed'))
        const current = !ended && i === currentIdx && step !== 'fixed'
        const at = reachedAt.get(step)
        const last = i === steps.length - 1
        return (
          <li key={step} className="relative flex gap-3 pb-6 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={cn('absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5', done && !isEnd ? 'bg-primary' : 'bg-border')}
              />
            )}
            <span
              className={cn(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-xs transition-colors',
                isEnd && 'bg-destructive text-white',
                !isEnd && done && 'bg-background text-primary',
                current && 'border-2 border-primary bg-background text-primary',
                !done && !current && 'border-2 border-border bg-background text-muted-foreground',
              )}
            >
              {isEnd ? <X className="size-4" /> : done ? <Check className="size-8" /> : current ? <span className="size-2.5 animate-pulse rounded-full bg-primary" /> : i + 1}
            </span>
            <div className="min-w-0 pt-1">
              <p className={cn('text-sm font-medium', !done && !current && 'text-muted-foreground')}>{STATUS_META[step].label}</p>
              <p className="text-xs text-muted-foreground">{at ? `${formatDateTime(at)} · ` : ''}{STEP_HINT[step]}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
