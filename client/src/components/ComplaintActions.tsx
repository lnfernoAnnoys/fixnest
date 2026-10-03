import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Check, CheckCheck, Hammer, Loader2, RefreshCw, X } from '@/components/icons'
import { NativeSelect } from '@/components/NativeSelect'
import { NoteDialog } from '@/components/NoteDialog'
import { Button } from '@/components/ui/button'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { isManager, type Complaint, type Priority } from '@/lib/types'

const OPEN = ['submitted', 'assigned', 'in_progress']
const REOPEN_WINDOW_MS = 7 * 86_400_000

interface StaffMember {
  id: number
  name: string
  specialty: string | null
  openCount: number
}

function fields(note: string, photo: File | null, extra: Record<string, string> = {}) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(extra)) fd.set(k, v)
  fd.set('note', note)
  if (photo) fd.set('image', photo)
  return fd
}

/**
 * What the signed-in person can do next with this complaint. The server enforces every one of these
 * rules again; this only decides which buttons to offer.
 */
export function ComplaintActions({ complaint: c, onChanged }: { complaint: Complaint; onChanged: () => void }) {
  const { user } = useAuth()
  const [dialog, setDialog] = useState<'fixed' | 'reject' | 'reopen' | null>(null)
  const [staffId, setStaffId] = useState('')
  const [priority, setPriority] = useState<Priority>(c.priority)

  const role = user!.role
  const open = OPEN.includes(c.status)
  const isAdmin = isManager(role)
  const staffList = useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get<{ staff: StaffMember[] }>('/staff'),
    enabled: isAdmin && open,
  })

  const run = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(`/complaints/${c.code}/${path}`, body),
    onSuccess: (_d, v) => {
      toast.success(
        { acknowledge: 'Assignment acknowledged', status: 'Updated', assign: 'Complaint assigned', priority: 'Priority updated' }[v.path] ?? 'Done',
      )
      onChanged()
    },
    onError: (e) => toast.error(errorMessage(e, "That didn't go through. Check your connection and try again.")),
  })
  const busy = run.isPending

  const canReopen = role === 'student' && c.status === 'fixed' && !!c.resolvedAt && Date.now() - new Date(c.resolvedAt).getTime() < REOPEN_WINDOW_MS
  const staffCanWork = role === 'staff' || isAdmin

  const nothing = !(open && (role === 'staff' || isAdmin)) && !canReopen
  if (nothing) return null

  const btn = (label: string, icon: React.ReactNode, onClick: () => void, variant: 'default' | 'outline' | 'destructive' = 'default') => (
    <Button variant={variant} onClick={onClick} disabled={busy}>
      {busy && run.variables ? <Loader2 className="animate-spin" /> : icon} {label}
    </Button>
  )

  return (
    <section className="mb-6 rounded-xl border bg-card p-4 sm:p-5" aria-label="Actions">
      <h2 className="mb-3 text-sm font-semibold">Next step</h2>

      <div className="flex flex-wrap gap-2">
        {staffCanWork && c.status === 'assigned' && role === 'staff' && !c.acknowledgedAt && btn('Acknowledge', <CheckCheck />, () => run.mutate({ path: 'acknowledge' }), 'outline')}
        {staffCanWork && c.status === 'assigned' && btn('Start work', <Hammer />, () => run.mutate({ path: 'status', body: { status: 'in_progress' } }))}
        {staffCanWork && c.status === 'in_progress' && btn('Mark as fixed', <Check />, () => setDialog('fixed'))}
        {isAdmin && open && btn('Reject', <X />, () => setDialog('reject'), 'destructive')}
        {canReopen && btn('Not fixed? Reopen', <RefreshCw />, () => setDialog('reopen'), 'outline')}
      </div>
      {role === 'staff' && c.status === 'assigned' && !c.acknowledgedAt && (
        <p className="mt-2 text-xs text-muted-foreground">Acknowledge so the student knows you have seen it, then start work when you begin.</p>
      )}
      {canReopen && <p className="mt-2 text-xs text-muted-foreground">Still broken? You can reopen this for 7 days after it was marked fixed.</p>}

      {isAdmin && open && (
        <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div>
            <label htmlFor="assign" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {c.assignedStaff ? `Assigned to ${c.assignedStaff.name}` : 'Assign to'}
            </label>
            <div className="flex gap-2">
              <NativeSelect id="assign" value={staffId} onChange={(e) => setStaffId(e.target.value)} disabled={staffList.isPending}>
                <option value="">{staffList.isPending ? 'Loading staff...' : c.assignedStaff ? 'Move to...' : 'Choose staff'}</option>
                {staffList.data?.staff.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.id === c.assignedStaff?.id}>
                    {s.name}
                    {s.specialty ? ` (${s.specialty})` : ''} · {s.openCount} open
                  </option>
                ))}
              </NativeSelect>
              <Button disabled={!staffId || busy} onClick={() => run.mutate({ path: 'assign', body: { staffId: Number(staffId) } }, { onSuccess: () => setStaffId('') })}>
                Assign
              </Button>
            </div>
            {staffList.isError && <p className="mt-1 text-xs text-destructive">Couldn't load staff. Refresh and try again.</p>}
          </div>
          <div>
            <label htmlFor="priority" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Priority
            </label>
            <div className="flex gap-2">
              <NativeSelect id="priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </NativeSelect>
              <Button variant="outline" disabled={priority === c.priority || busy} onClick={() => run.mutate({ path: 'priority', body: { priority } })}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      <NoteDialog
        open={dialog === 'fixed'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Mark ${c.code} as fixed`}
        description="Tell the student what you did. A photo of the finished work helps."
        noteLabel="Describe what you did"
        placeholder="e.g. Replaced the fan capacitor and tested it for 10 minutes."
        confirmLabel="Mark as fixed"
        allowPhoto
        submit={async ({ note, photo }) => {
          await api.post(`/complaints/${c.code}/status`, fields(note, photo, { status: 'fixed' }))
          toast.success('Marked as fixed')
          onChanged()
        }}
      />
      <NoteDialog
        open={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Reject ${c.code}`}
        description="The student will see your reason."
        noteLabel="Give a reason"
        placeholder="e.g. This is a request for new furniture, not a repair."
        confirmLabel="Reject complaint"
        destructive
        submit={async ({ note }) => {
          await api.post(`/complaints/${c.code}/status`, fields(note, null, { status: 'rejected' }))
          toast.success('Complaint rejected')
          onChanged()
        }}
      />
      <NoteDialog
        open={dialog === 'reopen'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Reopen ${c.code}`}
        description="Tell us what is still wrong so it goes back to the same staff member."
        noteLabel="What is still wrong"
        placeholder="e.g. The fan works for a few minutes and then stops again."
        confirmLabel="Reopen"
        submit={async ({ note }) => {
          await api.post(`/complaints/${c.code}/reopen`, { note })
          toast.success('Complaint reopened')
          onChanged()
        }}
      />
    </section>
  )
}
