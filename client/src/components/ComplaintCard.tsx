import { ChevronRight, ImageIcon, MapPin } from '@/components/icons'
import { Link } from 'react-router-dom'
import { OverdueBadge, PriorityBadge, StatusBadge } from '@/components/status'
import { locationLabel, timeAgo } from '@/lib/format'
import type { Complaint, Role } from '@/lib/types'

export function ComplaintCard({ complaint: c, viewerRole }: { complaint: Complaint; viewerRole: Role }) {
  return (
    <Link
      to={`/complaints/${c.code}`}
      className="group block rounded-xl border bg-card p-4 outline-none transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono font-medium text-foreground">{c.code}</span>
            <span aria-hidden>·</span>
            <span>{c.category.name}</span>
            <span aria-hidden>·</span>
            <span>{timeAgo(c.createdAt)}</span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">{c.description}</p>
        </div>
        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge status={c.status} />
        <PriorityBadge priority={c.priority} />
        {c.isOverdue && <OverdueBadge />}
        {viewerRole === 'staff' && c.status === 'assigned' && !c.acknowledgedAt && (
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">New</span>
        )}
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden /> {locationLabel(c.location)}
        </span>
        {viewerRole !== 'student' && <span className="text-xs text-muted-foreground">by {c.student.name}</span>}
        {c.imageUrl && <ImageIcon className="size-3.5 text-muted-foreground" aria-label="Has attachment" />}
      </div>
    </Link>
  )
}
