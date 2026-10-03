import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'

/** Plain page shell for the public policy pages (no sign-in needed to read them). */
export function LegalLayout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-5 py-5">
        <Link to="/" aria-label="FixNest home" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto max-w-2xl px-5 pb-16 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="mt-8 space-y-4 text-[15px] leading-7 [&_a]:[color:var(--primary-text)] [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
          {children}
        </div>
        <nav aria-label="Policies" className="mt-12 flex gap-4 border-t pt-6 text-sm">
          <Link to="/privacy" className="text-primary underline underline-offset-2">
            Privacy policy
          </Link>
          <Link to="/terms" className="text-primary underline underline-offset-2">
            Terms of service
          </Link>
          <Link to="/login" className="ml-auto text-muted-foreground underline underline-offset-2">
            Back to FixNest
          </Link>
        </nav>
      </main>
    </div>
  )
}
