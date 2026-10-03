import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChartCard, HBarChart, TrendChart } from '@/components/charts'
import { ErrorState } from '@/components/states'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatDuration, shortDate } from '@/lib/format'
import type { AdminOverview } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Queue } from '@/pages/Dashboard'

const RANGES = [7, 30, 90] as const

function Tile({ label, value, to, tone, hint }: { label: string; value: string | number | undefined; to?: string; tone?: 'alert'; hint?: string }) {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      {value === undefined ? <Skeleton className="mt-1.5 h-8 w-14" /> : <p className={cn('mt-1 text-3xl font-semibold', tone === 'alert' && Number(value) > 0 && 'text-red-600 dark:text-red-400')}>{value}</p>}
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </>
  )
  const cls = 'block rounded-xl border bg-card p-4'
  return to ? (
    <Link to={to} className={cn(cls, 'outline-none transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [days, setDays] = useState<(typeof RANGES)[number]>(30)
  // Keep the previous numbers on screen (dimmed) while a new range loads, so nothing jumps.
  const overview = useQuery({
    queryKey: ['stats', 'overview', days],
    queryFn: () => api.get<AdminOverview>(`/stats/overview?days=${days}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
  const d = overview.data
  const busy = overview.isFetching && overview.isPlaceholderData

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hi, {user!.name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Hostel maintenance at a glance.</p>
      </div>

      {overview.isError && !d ? (
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      ) : (
        <>
          <section aria-label="Right now" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">Open complaints</p>
              {d ? <p className="mt-1 text-6xl font-semibold leading-none tracking-tight">{d.now.open}</p> : <Skeleton className="mt-2 h-14 w-24" />}
              <p className="mt-3 text-sm text-muted-foreground">{d ? `${d.now.total} complaints in total` : ' '}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Waiting for assignment" value={d?.now.unassigned} to="/complaints?status=submitted" />
              <Tile label="In progress" value={d?.now.inProgress} to="/complaints?status=in_progress" />
              <Tile label="Overdue" value={d?.now.overdue} to="/complaints?overdue=1" tone="alert" />
              <Tile label="High priority, open" value={d?.now.highPriority} to="/complaints?status=open&priority=high,urgent" />
            </div>
          </section>

          <section aria-label="Activity" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Activity</h2>
              <div className="flex gap-0.5 rounded-lg bg-muted p-0.5 text-sm" role="group" aria-label="Time range">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    aria-pressed={days === r}
                    onClick={() => setDays(r)}
                    className={cn('rounded-md px-3 py-1.5 font-medium transition-colors', days === r ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                  >
                    Last {r} days
                  </button>
                ))}
              </div>
            </div>

            <div className={cn('grid grid-cols-3 gap-3 transition-opacity', busy && 'opacity-60')}>
              <Tile label="Opened" value={d?.range.opened} />
              <Tile label="Fixed" value={d?.range.fixed} />
              <Tile label="Avg. time to fix" value={d ? formatDuration(d.range.avgResolutionHours) : undefined} />
            </div>

            {d ? (
              <>
                <ChartCard
                  title="Opened and fixed each day"
                  description={`Last ${d.range.days} days`}
                  busy={busy}
                  table={{
                    head: ['Day', 'Opened', 'Fixed'],
                    rows: [...d.range.trend].reverse().map((t) => [shortDate(t.date), t.opened, t.fixed]),
                  }}
                >
                  <TrendChart data={d.range.trend} />
                </ChartCard>
                <div className="grid gap-4 lg:grid-cols-2">
                  <ChartCard
                    title="Complaints by category"
                    description="Most reported problems first"
                    busy={busy}
                    table={{
                      head: ['Category', 'Complaints', 'Share'],
                      rows: d.range.byCategory.map((c) => [c.name, c.count, `${Math.round((c.count / Math.max(1, d.range.opened)) * 100)}%`]),
                    }}
                  >
                    <HBarChart rows={d.range.byCategory} />
                  </ChartCard>
                  <ChartCard
                    title="Complaints by hostel"
                    busy={busy}
                    table={{
                      head: ['Hostel', 'Complaints', 'Share'],
                      rows: d.range.byHostel.map((c) => [c.name, c.count, `${Math.round((c.count / Math.max(1, d.range.opened)) * 100)}%`]),
                    }}
                  >
                    <HBarChart rows={d.range.byHostel} />
                  </ChartCard>
                </div>
              </>
            ) : (
              <Skeleton className="h-72 w-full rounded-xl" />
            )}
          </section>
        </>
      )}

      <Queue title="Waiting for assignment" hint="Open a complaint to assign it to staff" query="status=submitted&sort=priority&pageSize=10" empty="Every complaint has been assigned." role="admin" />
      <Queue title="Overdue" hint="Past the target time for their priority" query="overdue=1&sort=priority&pageSize=10" empty="Nothing is overdue." role="admin" />
    </div>
  )
}
