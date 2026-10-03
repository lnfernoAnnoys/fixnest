import { useInfiniteQuery } from '@tanstack/react-query'
import { PlusCircle, Search } from '@/components/icons'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ComplaintCard } from '@/components/ComplaintCard'
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Complaint, Page } from '@/lib/types'
import { cn } from '@/lib/utils'

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'fixed', label: 'Fixed' },
  { key: 'cancelled', label: 'Cancelled' },
]

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export default function Complaints() {
  const { user } = useAuth()
  const role = user!.role
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())

  const list = useInfiniteQuery({
    queryKey: ['complaints', 'list', status, q],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ page: String(pageParam), pageSize: '15', sort: 'newest' })
      if (status) p.set('status', status)
      if (q) p.set('q', q)
      return api.get<Page<Complaint>>(`/complaints?${p}`)
    },
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  })
  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const filtered = !!status || !!q

  return (
    <div>
      <PageHeader
        title={role === 'student' ? 'My complaints' : role === 'staff' ? 'Assigned to me' : 'Complaints'}
        description={list.data ? `${list.data.pages[0].total} ${list.data.pages[0].total === 1 ? 'complaint' : 'complaints'}` : undefined}
        actions={
          role === 'student' && (
            <Button render={<Link to="/new" />}>
              <PlusCircle /> New
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID, room, or problem" className="h-10 pl-9" aria-label="Search complaints" />
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              aria-pressed={status === f.key}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                status === f.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No matching complaints' : role === 'student' ? "You haven't reported anything yet" : 'No complaints here'}
          body={filtered ? 'Try a different search or filter.' : role === 'student' ? 'When something breaks in your room, report it here.' : undefined}
          action={
            filtered ? (
              <Button variant="outline" onClick={() => (setStatus(''), setSearch(''))}>
                Clear filters
              </Button>
            ) : role === 'student' ? (
              <Button render={<Link to="/new" />}>
                <PlusCircle /> Report a problem
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <ComplaintCard key={c.id} complaint={c} viewerRole={role} />
          ))}
          {list.hasNextPage && (
            <div className="pt-2 text-center">
              <Button variant="outline" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? 'Loading...' : 'Show more'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
