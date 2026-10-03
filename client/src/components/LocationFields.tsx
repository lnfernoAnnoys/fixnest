import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import type { Hostel } from '@/lib/types'
import { cn } from '@/lib/utils'

/** "Boys Hostel-1" and "boys hostel 1" are the same hostel (the server matches names the same way). */
const sameName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** One box for a hostel name, with the existing hostels offered as suggestions. */
export function HostelInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hostels = useQuery({ queryKey: ['hostels'], queryFn: () => api.get<{ hostels: Hostel[] }>('/hostels'), staleTime: 60_000 })
  const list = `${useId()}-hostels`
  return (
    <>
      <Input aria-label="Hostel name" list={list} autoComplete="off" autoCapitalize="words" maxLength={60} placeholder="Hostel name, e.g. Boys Hostel 1" value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={list}>
        {hostels.data?.hostels.map((h) => (
          <option key={h.id} value={h.name} />
        ))}
      </datalist>
    </>
  )
}

/**
 * Two boxes where a student types their hostel name and room number. As they type, the names of hostels (and the
 * rooms in that hostel) that already exist are offered as suggestions, but anything can be typed.
 */
export function LocationFields({
  hostel,
  room,
  onHostel,
  onRoom,
  errors,
  compact = false,
  className,
}: {
  hostel: string
  room: string
  onHostel: (v: string) => void
  onRoom: (v: string) => void
  errors?: { hostel?: string; room?: string }
  /** No visible labels (for tight spots like the complaint form). */
  compact?: boolean
  className?: string
}) {
  const hostels = useQuery({ queryKey: ['hostels'], queryFn: () => api.get<{ hostels: Hostel[] }>('/hostels'), staleTime: 60_000 })
  const id = useId()
  const hostelList = `${id}-hostels`
  const roomList = `${id}-rooms`
  const typed = sameName(hostel)
  const rooms = (typed && hostels.data?.hostels.find((h) => sameName(h.name) === typed)?.rooms) || []

  const hostelProps = { list: hostelList, autoComplete: 'off', autoCapitalize: 'words', maxLength: 60, placeholder: 'e.g. Boys Hostel 1', value: hostel, onChange: (e: { target: { value: string } }) => onHostel(e.target.value) }
  const roomProps = { list: roomList, autoComplete: 'off', autoCapitalize: 'characters', maxLength: 10, placeholder: 'e.g. 302 or M423', value: room, onChange: (e: { target: { value: string } }) => onRoom(e.target.value) }

  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      {compact ? (
        <>
          <Input aria-label="Hostel name" aria-invalid={!!errors?.hostel} {...hostelProps} />
          <Input aria-label="Room number" aria-invalid={!!errors?.room} {...roomProps} />
        </>
      ) : (
        <>
          <Field label="Hostel name" error={errors?.hostel}>
            {(p) => <Input {...p} {...hostelProps} />}
          </Field>
          <Field label="Room number" error={errors?.room}>
            {(p) => <Input {...p} {...roomProps} />}
          </Field>
        </>
      )}
      <datalist id={hostelList}>
        {hostels.data?.hostels.map((h) => (
          <option key={h.id} value={h.name} />
        ))}
      </datalist>
      <datalist id={roomList}>
        {rooms.map((r) => (
          <option key={r.id} value={r.number} />
        ))}
      </datalist>
    </div>
  )
}
