import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, Clock, Hammer, Inbox, MapPin, PlusCircle, TriangleAlert } from '@/components/icons'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ComplaintCard } from '@/components/ComplaintCard'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Complaint, Page, Role, Summary } from '@/lib/types'
import { cn } from '@/lib/utils'

function StatTile({ label, value, icon, tone }: { label: string; value: number | undefined; icon: ReactNode; tone: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
      <div className={cn('mb-3 flex size-8 items-center justify-center rounded-lg', tone)}>{icon}</div>
      {value === undefined ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-semibold tabular-nums">{value}</p>}
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/** A short, priority-sorted list of complaints that need action, with its own loading/empty/error states. */
export function Queue({ title, hint, query, empty, role }: { title: string; hint?: string; query: string; empty: string; role: Role }) {
  const q = useQuery({ queryKey: ['complaints', 'queue', query], queryFn: () => api.get<Page<Complaint>>(`/complaints?${query}`) })
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">
          {title}
          {q.data && q.data.total > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{q.data.total}</span>}
        </h2>
        {hint && <p className="hidden text-xs text-muted-foreground sm:block">{hint}</p>}
      </div>
      {q.isPending ? (
        <ListSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-3">
          {q.data.items.map((c) => (
            <ComplaintCard key={c.id} complaint={c} viewerRole={role} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const role = user!.role
  const summary = useQuery({ queryKey: ['summary'], queryFn: () => api.get<Summary>('/complaints/summary') })
  const recent = useQuery({
    queryKey: ['complaints', 'recent'],
    queryFn: () => api.get<Page<Complaint>>('/complaints?pageSize=5&sort=updated'),
  })
  const s = summary.data
  const open = s ? s.byStatus.submitted + s.byStatus.assigned + s.byStatus.in_progress : undefined

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hi, {user!.name.split(' ')[0]}</h1>
          {role === 'student' && user!.hostelName ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5" aria-hidden /> {user!.hostelName} · Room {user!.roomNumber}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{role === 'staff' ? 'Your assigned work at a glance.' : 'Hostel maintenance overview.'}</p>
          )}
        </div>
        {role === 'student' && (
          <div className="flex w-full gap-2 sm:w-auto">
            <Button size="lg" className="h-11 flex-1 px-5 sm:flex-none" render={<Link to="/new" />}>
              <PlusCircle /> Report a problem
            </Button>
          </div>
        )}
      </div>

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Open" value={open} icon={<Inbox className="size-4" />} tone="bg-primary/10 text-primary" />
          <StatTile label="In progress" value={s?.byStatus.in_progress} icon={<Hammer className="size-4" />} tone="bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300" />
          <StatTile label="Fixed" value={s?.byStatus.fixed} icon={<CheckCircle2 className="size-4" />} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" />
          {role === 'student' ? (
            <StatTile label="All complaints" value={s?.total} icon={<Clock className="size-4" />} tone="bg-slate-100 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300" />
          ) : (
            <StatTile label="Overdue" value={s?.overdue} icon={<TriangleAlert className="size-4" />} tone="bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300" />
          )}
        </div>
      )}

      {role === 'staff' && (
        <>
          <Queue title="To start" hint="Newly assigned to you, most urgent first" query="status=assigned&sort=priority&pageSize=20" empty="Nothing waiting. New assignments will show up here." role={role} />
          <Queue title="In progress" query="status=in_progress&sort=priority&pageSize=20" empty="You have no jobs in progress." role={role} />
        </>
      )}
      {role !== 'staff' && (
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{role === 'student' ? 'Recent activity' : 'Recent complaints'}</h2>
          <Link to="/complaints" className="flex min-h-10 items-center gap-1 text-sm text-primary hover:underline">
            View all <ArrowRight className="size-3.5" />
          </Link>
        </div>
        {recent.isPending ? (
          <ListSkeleton rows={3} />
        ) : recent.isError ? (
          <ErrorState error={recent.error} onRetry={() => recent.refetch()} />
        ) : recent.data.items.length === 0 ? (
          <EmptyState
            title={role === 'student' ? 'No complaints yet' : 'Nothing here yet'}
            body={role === 'student' ? 'Something broken in your room? Report it and we will keep you posted.' : 'Complaints will appear here.'}
            action={
              role === 'student' ? (
                <Button render={<Link to="/new" />}>
                  <PlusCircle /> Report a problem
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {recent.data.items.map((c) => (
              <ComplaintCard key={c.id} complaint={c} viewerRole={role} />
            ))}
          </div>
        )}
      </section>
      )}
    </div>
  )
}
