import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { FormError } from '@/components/Field'
import { Loader2 } from '@/components/icons'
import { LocationFields } from '@/components/LocationFields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { User } from '@/lib/types'

/** A student types their new hostel name and room number. The server enforces the waiting period. */
export function ChangeRoomDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, setUser } = useAuth()
  const [hostelName, setHostelName] = useState(user?.hostelName ?? '')
  const [roomNumber, setRoomNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (hostelName.trim().length < 2 || !/^[A-Za-z0-9-]{1,10}$/.test(roomNumber.replace(/\s+/g, ''))) return setError('Type your hostel name and room number, like Boys Hostel 1 and M423.')
    setBusy(true)
    setError(null)
    try {
      const { user: updated } = await api.patch<{ user: User }>('/profile/location', { hostelName: hostelName.trim(), roomNumber: roomNumber.trim() })
      setUser(updated)
      toast.success(`Your room is now ${updated.hostelName} · ${updated.roomNumber}`)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change your room</DialogTitle>
          <DialogDescription>
            You can do this once every 30 days. Complaints you already filed stay with the room they were filed for.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError message={error} />
          <LocationFields hostel={hostelName} room={roomNumber} onHostel={setHostelName} onRoom={setRoomNumber} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Change room
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
