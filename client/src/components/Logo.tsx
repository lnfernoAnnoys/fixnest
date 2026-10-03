import { Wrench } from '@/components/icons'
import { cn } from '@/lib/utils'

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Wrench className="size-4" aria-hidden />
      </span>
      <span className={light ? 'text-white' : undefined}>FixNest</span>
    </span>
  )
}
