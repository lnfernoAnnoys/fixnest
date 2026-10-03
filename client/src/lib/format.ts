const dateTime = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const fullDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))
export const formatFull = (iso: string) => fullDate.format(new Date(iso))

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a date. */
export function timeAgo(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`
  return dateTime.format(new Date(iso))
}

export function locationLabel(l: { hostel: string; room: string | null; floor: number | null; note: string | null }) {
  const place = l.room ? `Room ${l.room}` : (l.note ?? 'Common area')
  return `${l.hostel} · ${place}`
}

/** 0.4 -> "24 min", 6 -> "6 h", 30 -> "30 h", 72 -> "3 days". */
export function formatDuration(hours: number | null) {
  if (hours == null) return 'No data'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`
  return `${Math.round((hours / 24) * 10) / 10} days`
}

/** "2026-09-29" -> "Sep 29" without shifting the day through time zones. */
export function shortDate(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
