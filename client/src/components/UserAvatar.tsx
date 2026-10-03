import { useEffect, useState } from 'react'
import type { User } from '@/lib/types'
import { cn } from '@/lib/utils'

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

/**
 * Profile picture: the Google photo when the person signed in with Google, otherwise their initials
 * on an accent circle. Falls back to initials if the photo fails to load.
 */
export function UserAvatar({ user, className }: { user: Pick<User, 'name' | 'avatarUrl'>; className?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [user.avatarUrl])
  return (
    <span
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-semibold text-primary-foreground',
        className,
      )}
    >
      {user.avatarUrl && !failed ? (
        // Google's image host rejects some requests that carry a Referer, so don't send one.
        <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials(user.name)}</span>
      )}
    </span>
  )
}
