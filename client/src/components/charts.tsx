import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/*
 * Charts for the warden's dashboard. Built to the FixNest data-viz rules:
 *  - one axis, thin marks (bars <= 24px with a 4px rounded end, 2px lines), hairline solid gridlines
 *  - colors come from the validated --viz-* tokens (light and dark), never from a value ramp
 *  - a legend whenever there are 2+ series, selective direct labels, a tooltip on hover AND keyboard focus
 *  - every chart has a table twin, so no value is only reachable through hover
 */

/** Measures an element's width, updating when it resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

export interface TableData {
  head: string[]
  rows: (string | number)[][]
}

/** A titled card with a Chart / Table switch. While `busy`, the previous render stays put, dimmed. */
export function ChartCard({ title, description, table, busy, children, className }: { title: string; description?: string; table: TableData; busy?: boolean; children: ReactNode; className?: string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <section className={cn('rounded-xl border bg-card p-4 sm:p-5', className)} aria-busy={busy}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5 text-xs" role="group" aria-label={`${title}: view`}>
          {(['chart', 'table'] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn('rounded-md px-2.5 py-1.5 font-medium capitalize transition-colors', view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className={cn('transition-opacity', busy && 'opacity-60')}>
        {view === 'chart' ? (
          children
        ) : (
          <div className="max-h-72 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 text-left text-xs text-muted-foreground backdrop-blur">
                <tr>
                  {table.head.map((h, i) => (
                    <th key={h} className={cn('px-3 py-2 font-medium', i > 0 && 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j} className={cn('px-3 py-1.5', j > 0 && 'text-right tabular-nums')}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

// ---- horizontal bars ---------------------------------------------------------------------------

/** One series, ranked. Same color for every bar: the categories have no order, so color adds nothing. */
export function HBarChart({ rows, unit = 'complaints', max = 10 }: { rows: { name: string; count: number }[]; unit?: string; max?: number }) {
  const [active, setActive] = useState<number | null>(null)
  // Fold the long tail into "Other" instead of growing the chart.
  const rest = rows.slice(max - 1)
  const shown = rows.length > max ? [...rows.slice(0, max - 1), { name: `${rest.length} more`, count: rest.reduce((a, r) => a + r.count, 0) }] : rows
  const total = shown.reduce((a, r) => a + r.count, 0)
  const top = Math.max(1, ...shown.map((r) => r.count))

  if (total === 0) return <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No complaints in this period.</p>

  return (
    <ul className="space-y-2.5" onPointerLeave={() => setActive(null)}>
      {shown.map((r, i) => {
        const pct = (r.count / top) * 86 // leave room at the right for the value
        const share = Math.round((r.count / total) * 100)
        return (
          <li
            key={r.name}
            tabIndex={0}
            onPointerEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="group relative grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:grid-cols-[9rem_1fr]"
            aria-label={`${r.name}: ${r.count} ${unit}, ${share}%`}
          >
            <span className="truncate text-sm text-muted-foreground group-hover:text-foreground">{r.name}</span>
            <div className="relative h-6">
              <div
                className="absolute inset-y-0.5 left-0 rounded-r-[4px] motion-safe:transition-[width,opacity] motion-safe:duration-500"
                style={{ width: `max(${pct}%, 4px)`, background: 'var(--viz-1)', opacity: active === null || active === i ? 1 : 0.55 }}
              />
              <span className="absolute top-1/2 -translate-y-1/2 text-sm font-medium tabular-nums" style={{ left: `calc(max(${pct}%, 4px) + 8px)` }}>
                {r.count}
              </span>
              {active === i && (
                <div role="tooltip" className="pointer-events-none absolute -top-9 z-10 whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md" style={{ left: `min(${pct}%, 60%)` }}>
                  <span className="font-semibold text-popover-foreground">{r.count}</span> <span className="text-muted-foreground">{unit} · {share}% · {r.name}</span>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ---- trend line --------------------------------------------------------------------------------

const SERIES = [
  { key: 'opened' as const, label: 'Opened', color: 'var(--viz-1)' },
  { key: 'fixed' as const, label: 'Fixed', color: 'var(--viz-2)' },
]

/** A "nice" y-axis: whole-number ticks, at most 4 steps, always starting at zero. */
function niceScale(max: number) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]
  const step = steps.find((s) => Math.ceil(Math.max(1, max) / s) <= 4) ?? 10000
  const top = Math.ceil(Math.max(1, max) / step) * step
  return { step, top, ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step) }
}

export function TrendChart({ data }: { data: { date: string; opened: number; fixed: number }[] }) {
  const [wrap, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 240
  const m = { top: 12, right: 52, bottom: 28, left: 30 }
  const n = data.length
  const plotW = Math.max(0, width - m.left - m.right)
  const plotH = H - m.top - m.bottom
  const { top, ticks } = niceScale(Math.max(...data.flatMap((d) => [d.opened, d.fixed])))
  const x = (i: number) => m.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v: number) => m.top + plotH - (v / top) * plotH
  const path = (key: 'opened' | 'fixed') => data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ')

  const tickCount = Math.max(2, Math.min(6, Math.floor(plotW / 80)))
  const xTicks = Array.from(new Set(Array.from({ length: tickCount }, (_, i) => Math.round((i / (tickCount - 1)) * (n - 1)))))

  const nearest = (clientX: number, el: Element) => {
    const rect = el.getBoundingClientRect()
    const i = Math.round(((clientX - rect.left - m.left) / Math.max(1, plotW)) * (n - 1))
    return Math.min(n - 1, Math.max(0, i))
  }
  const onKey = (e: KeyboardEvent) => {
    const at = hover ?? n - 1
    const next = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: n - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    setHover(Math.min(n - 1, Math.max(0, next)))
  }

  const empty = data.every((d) => d.opened === 0 && d.fixed === 0)
  const last = data[n - 1]
  // Direct end labels only when the two lines end far enough apart not to collide.
  const endLabelsFit = last && Math.abs(y(last.opened) - y(last.fixed)) >= 14
  const point = hover === null ? null : data[hover]
  const flip = hover !== null && x(hover) > width * 0.6

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs" aria-label="Legend">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={wrap} className="relative" style={{ height: H }}>
        {width > 0 && (
          <>
            <svg
              width={width}
              height={H}
              role="img"
              tabIndex={0}
              aria-label={`Daily complaints opened and fixed over the last ${n} days. Use the left and right arrow keys to read each day.`}
              className="block touch-pan-y select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onPointerMove={(e: PointerEvent) => setHover(nearest(e.clientX, e.currentTarget))}
              onPointerLeave={() => setHover(null)}
              onFocus={() => hover === null && setHover(n - 1)}
              onBlur={() => setHover(null)}
              onKeyDown={onKey}
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} />
                  <text x={m.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--viz-muted)" className="tabular-nums">
                    {t}
                  </text>
                </g>
              ))}
              {xTicks.map((i) => (
                <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize={11} fill="var(--viz-muted)">
                  {shortDate(data[i].date)}
                </text>
              ))}

              {SERIES.map((s) => (
                <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ))}

              {/* End markers with a 2px surface ring, and a direct label when there is room. */}
              {last &&
                SERIES.map((s) => (
                  <g key={s.key}>
                    <circle cx={x(n - 1)} cy={y(last[s.key])} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                    {endLabelsFit && (
                      <text x={x(n - 1) + 10} y={y(last[s.key])} dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">
                        {s.label}
                      </text>
                    )}
                  </g>
                ))}

              {hover !== null && point && (
                <g pointerEvents="none">
                  <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + plotH} stroke="var(--viz-axis)" strokeWidth={1} />
                  {SERIES.map((s) => (
                    <circle key={s.key} cx={x(hover)} cy={y(point[s.key])} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                  ))}
                </g>
              )}
            </svg>

            {point && hover !== null && (
              <div
                role="status"
                className="pointer-events-none absolute z-10 min-w-32 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
                style={{ left: x(hover) + (flip ? -12 : 12), top: m.top, transform: flip ? 'translateX(-100%)' : undefined }}
              >
                <p className="mb-1 text-muted-foreground">{shortDate(point.date)}</p>
                {SERIES.map((s) => (
                  <p key={s.key} className="flex items-center gap-2">
                    <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden />
                    <span className="font-semibold tabular-nums text-popover-foreground">{point[s.key]}</span>
                    <span className="text-muted-foreground">{s.label.toLowerCase()}</span>
                  </p>
                ))}
              </div>
            )}
            {empty && <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted-foreground">No activity in this period.</p>}
          </>
        )}
      </div>
    </div>
  )
}
