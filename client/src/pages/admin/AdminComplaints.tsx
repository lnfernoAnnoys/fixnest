import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ComplaintCard } from '@/components/ComplaintCard'
import { Search } from '@/components/icons'
import { NativeSelect } from '@/components/NativeSelect'
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/states'
import { OverdueBadge, PriorityBadge, StatusBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import type { AdminCategory, Complaint, Hostel, Page } from '@/lib/types'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  ['', 'Any status'],
  ['open', 'Open (not closed)'],
  ['submitted', 'Submitted'],
  ['assigned', 'Assigned'],
  ['in_progress', 'In progress'],
  ['fixed', 'Fixed'],
  ['rejected', 'Rejected'],
  ['cancelled', 'Cancelled'],
]
const PRIORITY_OPTIONS = [
  ['', 'Any priority'],
  ['urgent', 'Urgent'],
  ['high,urgent', 'High and urgent'],
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
]
const SORT_OPTIONS = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['priority', 'Highest priority'],
  ['updated', 'Recently updated'],
]

/** The filters that live in the URL, so a filtered view can be linked to, bookmarked and reloaded. */
const KEYS = ['q', 'status', 'priority', 'category', 'hostel', 'staff', 'from', 'to', 'overdue', 'sort', 'page'] as const

export default function AdminComplaints() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const get = (k: (typeof KEYS)[number]) => params.get(k) ?? ''
  const [search, setSearch] = useState(get('q'))

  function set(changes: Partial<Record<(typeof KEYS)[number], string>>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k)
    if (!('page' in changes)) next.delete('page') // a new filter always starts from page 1
    setParams(next, { replace: true })
  }

  // Apply the search box a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => search.trim() !== get('q') && set({ q: search.trim() }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
  useEffect(() => setSearch(get('q')), [params.get('q')]) // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api.get<{ categories: AdminCategory[] }>('/admin/categories'), staleTime: 60_000 })
  const hostels = useQuery({ queryKey: ['hostels'], queryFn: () => api.get<{ hostels: Hostel[] }>('/hostels'), staleTime: 60_000 })
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.get<{ staff: { id: number; name: string }[] }>('/staff'), staleTime: 60_000 })

  const page = Math.max(1, Number(get('page')) || 1)
  const apiQuery = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort: get('sort') || 'newest' })
  for (const [urlKey, apiKey] of [['q', 'q'], ['status', 'status'], ['priority', 'priority'], ['category', 'categoryId'], ['hostel', 'hostelId'], ['staff', 'staffId'], ['from', 'from'], ['to', 'to'], ['overdue', 'overdue']] as const) {
    if (get(urlKey)) apiQuery.set(apiKey, get(urlKey))
  }

  const list = useQuery({
    queryKey: ['complaints', 'admin', apiQuery.toString()],
    queryFn: () => api.get<Page<Complaint>>(`/complaints?${apiQuery}`),
    placeholderData: keepPreviousData,
  })
  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const filtered = KEYS.some((k) => k !== 'sort' && k !== 'page' && get(k))
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(total, page * PAGE_SIZE)
  const stale = list.isFetching && list.isPlaceholderData

  return (
    <div>
      <PageHeader title="Complaints" description={list.data ? `${total} ${total === 1 ? 'complaint' : 'complaints'}${filtered ? ' match your filters' : ''}` : undefined} />

      <div className="mb-4 space-y-3 rounded-xl border bg-card p-3 sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID, student, room, hostel, category or problem" className="h-10 pl-9" aria-label="Search complaints" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <NativeSelect aria-label="Status" value={get('status')} onChange={(e) => set({ status: e.target.value })}>
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Priority" value={get('priority')} onChange={(e) => set({ priority: e.target.value })}>
            {PRIORITY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Category" value={get('category')} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Any category</option>
            {categories.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Hostel" value={get('hostel')} onChange={(e) => set({ hostel: e.target.value })}>
            <option value="">Any hostel</option>
            {hostels.data?.hostels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Assigned to" value={get('staff')} onChange={(e) => set({ staff: e.target.value })}>
            <option value="">Anyone assigned</option>
            {staff.data?.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Sort by" value={get('sort') || 'newest'} onChange={(e) => set({ sort: e.target.value === 'newest' ? '' : e.target.value })}>
            {SORT_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            From
            <Input type="date" value={get('from')} max={get('to') || undefined} onChange={(e) => set({ from: e.target.value })} className="h-9 w-auto" aria-label="Filed from" />
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            To
            <Input type="date" value={get('to')} min={get('from') || undefined} onChange={(e) => set({ to: e.target.value })} className="h-9 w-auto" aria-label="Filed until" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={get('overdue') === '1'} onChange={(e) => set({ overdue: e.target.checked ? '1' : '' })} />
            Overdue only
          </label>
          {filtered && (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => (setSearch(''), setParams({}, { replace: true }))}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {list.isPending ? (
        <ListSkeleton rows={5} />
      ) : list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No complaints match those filters' : 'No complaints yet'}
          body={filtered ? 'Try removing a filter or searching for something else.' : 'Complaints from students will appear here.'}
          action={
            filtered ? (
              <Button variant="outline" onClick={() => (setSearch(''), setParams({}, { replace: true }))}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cn('transition-opacity', stale && 'opacity-60')} aria-busy={stale}>
          {/* Wide screens: a real table */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card xl:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  {['ID', 'Problem', 'Location', 'Reported by', 'Status', 'Assigned to'].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap px-3 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/complaints/${c.code}`)} className="cursor-pointer transition-colors hover:bg-muted/40">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-medium">
                      <Link to={`/complaints/${c.code}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        {c.code}
                      </Link>
                    </td>
                    <td className="max-w-60 px-3 py-2.5">
                      <p className="truncate font-medium">{c.description}</p>
                      <p className="text-xs text-muted-foreground">{c.category.name}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="whitespace-nowrap">{c.location.room ? `Room ${c.location.room}` : (c.location.note ?? 'Common area')}</p>
                      <p className="whitespace-nowrap text-xs text-muted-foreground">{c.location.hostel}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="whitespace-nowrap">{c.student.name}</p>
                      <p className="whitespace-nowrap text-xs text-muted-foreground">{timeAgo(c.createdAt)}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={c.status} />
                        <div className="flex items-center gap-1.5">
                          <PriorityBadge priority={c.priority} />
                          {c.isOverdue && <OverdueBadge />}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">{c.assignedStaff?.name ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Narrower screens: cards */}
          <div className="grid gap-3 md:grid-cols-2 xl:hidden">
            {items.map((c) => (
              <ComplaintCard key={c.id} complaint={c} viewerRole="admin" />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {from}–{to} of {total}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={to >= total} onClick={() => set({ page: String(page + 1) })}>
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
