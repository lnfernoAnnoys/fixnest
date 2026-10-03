import { Bell, CheckCheck } from '@/components/icons'
import { useNavigate } from 'react-router-dom'
import { useMarkRead, useNotifications } from '@/components/NotificationBell'
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/states'
import { Button } from '@/components/ui/button'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function Notifications() {
  const { data, isPending, isError, error, refetch } = useNotifications()
  const markRead = useMarkRead()
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={data ? (data.unread ? `${data.unread} unread` : 'You are all caught up') : undefined}
        actions={
          !!data?.unread && (
            <Button variant="outline" onClick={() => markRead.mutate('all')}>
              <CheckCheck /> Mark all read
            </Button>
          )
        }
      />
      {isPending ? (
        <ListSkeleton rows={5} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState icon={<Bell className="size-5" />} title="No notifications yet" body="Updates on your complaints will show up here." />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {data.items.map((n) => (
            <li key={n.id}>
              <button
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                onClick={() => {
                  if (!n.read) markRead.mutate(n.id)
                  if (n.complaintCode) navigate(`/complaints/${n.complaintCode}`)
                }}
              >
                <span className={cn('mt-2 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} aria-label={n.read ? undefined : 'Unread'} />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm', !n.read && 'font-semibold')}>{n.title}</span>
                  <span className="block text-sm text-muted-foreground">{n.body}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
