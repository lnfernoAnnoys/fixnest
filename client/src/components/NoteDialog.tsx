import { useState, type ReactNode } from 'react'
import { Loader2 } from '@/components/icons'
import { FormError } from '@/components/Field'
import { PhotoInput } from '@/components/PhotoInput'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/lib/api'

/**
 * A small form in a dialog: a required text note, an optional photo, and a confirm button.
 * Used for "mark as fixed", "reject" and "reopen". The caller receives ready-to-send form data.
 */
export function NoteDialog({
  open,
  onOpenChange,
  title,
  description,
  noteLabel,
  placeholder,
  confirmLabel,
  destructive,
  allowPhoto,
  minLength = 5,
  submit,
  extra,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  noteLabel: string
  placeholder: string
  confirmLabel: string
  destructive?: boolean
  allowPhoto?: boolean
  minLength?: number
  submit: (fields: { note: string; photo: File | null }) => Promise<void>
  extra?: ReactNode
}) {
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function close(next: boolean) {
    if (busy) return
    onOpenChange(next)
    if (!next) {
      setNote('')
      setPhoto(null)
      setError(null)
    }
  }

  async function onSubmit() {
    setError(null)
    if (note.trim().length < minLength) return setError(`${noteLabel} (at least ${minLength} characters).`)
    setBusy(true)
    try {
      await submit({ note: note.trim(), photo })
      close(false)
    } catch (e) {
      setError(errorMessage(e, "Couldn't save that. Check your connection and try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <FormError message={error} />
          {extra}
          <Textarea aria-label={noteLabel} rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} aria-invalid={!!error} autoFocus />
          {allowPhoto && <PhotoInput file={photo} onChange={setPhoto} label="Add a proof photo" />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onSubmit} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
