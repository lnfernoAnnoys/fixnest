import { AlertTriangle } from '@/components/icons'
import { cn } from '@/lib/utils'
import type { Priority, Status } from '@/lib/types'

export const STATUS_META: Record<Status, { label: string; className: string; dot: string }> = {
  submitted: { label: 'Submitted', className: 'bg-slate-100 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300', dot: 'bg-slate-400' },
  assigned: { label: 'Assigned', className: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300', dot: 'bg-violet-500' },
  in_progress: { label: 'In progress', className: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300', dot: 'bg-sky-500' },
  fixed: { label: 'Fixed', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', className: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300', dot: 'bg-rose-500' },
  cancelled: { label: 'Cancelled', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-400/15 dark:text-zinc-400', dot: 'bg-zinc-400' },
}

export const PRIORITY_META: Record<Priority, { label: string; className: string; dot: string }> = {
  low: { label: 'Low', className: 'bg-slate-100 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300', dot: 'bg-slate-400' },
  medium: { label: 'Medium', className: 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300', dot: 'bg-blue-500' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300', dot: 'bg-orange-500' },
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300', dot: 'bg-red-500' },
}

const pill = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium'

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const m = STATUS_META[status]
  return (
    <span className={cn(pill, m.className, className)}>
      <span className={cn('size-1.5 rounded-full', m.dot)} aria-hidden />
      {m.label}
    </span>
  )
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const m = PRIORITY_META[priority]
  return (
    <span className={cn(pill, m.className, className)}>
      <span className={cn('size-1.5 rounded-full', m.dot)} aria-hidden />
      {m.label}
    </span>
  )
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <span className={cn(pill, 'bg-red-600 text-white dark:bg-red-500', className)}>
      <AlertTriangle className="size-3" aria-hidden />
      Overdue
    </span>
  )
}
