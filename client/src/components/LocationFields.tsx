import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { Field } from '@/components/Field'
import { NativeSelect } from '@/components/NativeSelect'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import type { Hostel } from '@/lib/types'

/** "Boys Hostel-1" and "boys hostel 1" are the same hostel (the server matches names the same way). */
const sameName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function useHostels() {
  return useQuery({ queryKey: ['hostels'], queryFn: () => api.get<{ hostels: Hostel[] }>('/hostels'), staleTime: 60_000 })
}

/** The dropdown of real hostels. A student can only pick one of these; only the admin can add a hostel. */
function HostelOptions({ hostels, value }: { hostels: Hostel[] | undefined; value: string }) {
  // Someone whose saved hostel is not (or no longer) in the list still sees it, rather than a blank box.
  const missing = value && hostels && !hostels.some((h) => sameName(h.name) === sameName(value))
  return (
    <>
      <option value="">{hostels ? 'Choose your hostel' : 'Loading...'}</option>
      {hostels?.map((h) => (
        <option key={h.id} value={h.name}>
          {h.name}
        </option>
      ))}
      {missing && <option value={value}>{value}</option>}
    </>
  )
}

/** One dropdown for choosing a hostel (used for a problem in a common area). */
export function HostelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hostels = useHostels()
  const picked = hostels.data?.hostels.find((h) => sameName(h.name) === sameName(value))
  return (
    <NativeSelect aria-label="Hostel" value={picked?.name ?? value} onChange={(e) => onChange(e.target.value)} disabled={hostels.isPending}>
      <HostelOptions hostels={hostels.data?.hostels} value={value} />
    </NativeSelect>
  )
}

/**
 * Choose the hostel from a list, then type the room number. As they type, the rooms that already exist in that hostel
 * are offered as suggestions, but any valid room number can be typed.
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
  const hostels = useHostels()
  const roomList = `${useId()}-rooms`
  const chosen = hostels.data?.hostels.find((h) => sameName(h.name) === sameName(hostel))
  const rooms = chosen?.rooms ?? []
  const none = hostels.data && hostels.data.hostels.length === 0

  const roomProps = { list: roomList, autoComplete: 'off', autoCapitalize: 'characters', maxLength: 10, placeholder: 'e.g. 302 or M423', value: room, onChange: (e: { target: { value: string } }) => onRoom(e.target.value) }
  const hostelValue = chosen?.name ?? hostel

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-3">
        {compact ? (
          <>
            <NativeSelect aria-label="Hostel" aria-invalid={!!errors?.hostel} value={hostelValue} onChange={(e) => onHostel(e.target.value)} disabled={hostels.isPending}>
              <HostelOptions hostels={hostels.data?.hostels} value={hostel} />
            </NativeSelect>
            <Input aria-label="Room number" aria-invalid={!!errors?.room} {...roomProps} />
          </>
        ) : (
          <>
            <Field label="Hostel" error={errors?.hostel}>
              {(p) => (
                <NativeSelect {...p} value={hostelValue} onChange={(e) => onHostel(e.target.value)} disabled={hostels.isPending}>
                  <HostelOptions hostels={hostels.data?.hostels} value={hostel} />
                </NativeSelect>
              )}
            </Field>
            <Field label="Room number" error={errors?.room}>
              {(p) => <Input {...p} {...roomProps} />}
            </Field>
          </>
        )}
      </div>
      {none && <p className="mt-2 text-xs text-destructive">No hostels have been set up yet. Please ask the hostel office.</p>}
      {hostels.isError && <p className="mt-2 text-xs text-destructive">Couldn't load the hostels. Refresh the page and try again.</p>}
      <datalist id={roomList}>
        {rooms.map((r) => (
          <option key={r.id} value={r.number} />
        ))}
      </datalist>
    </div>
  )
}

