import { Suspense } from 'react'
import { Bell, ClipboardList, LayoutDashboard, ListChecks, LogOut, PlusCircle, Settings, User, type LucideIcon } from '@/components/icons'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ListSkeleton } from '@/components/states'
import { Logo } from '@/components/Logo'
import { NotificationBell, useNotifications } from '@/components/NotificationBell'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserAvatar } from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/lib/auth'
import { isManager, type Role } from '@/lib/types'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  primary?: boolean
}

const NAV: Record<Role, NavItem[]> = {
  student: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/complaints', label: 'My complaints', icon: ListChecks },
    { to: '/new', label: 'Report a problem', icon: PlusCircle, primary: true },
    { to: '/notifications', label: 'Notifications', icon: Bell },
  ],
  staff: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/complaints', label: 'Assigned to me', icon: ClipboardList },
    { to: '/notifications', label: 'Notifications', icon: Bell },
  ],
  warden: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/complaints', label: 'Complaints', icon: ClipboardList },
    { to: '/people', label: 'People', icon: User },
    { to: '/notifications', label: 'Notifications', icon: Bell },
  ],
  admin: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/complaints', label: 'Complaints', icon: ClipboardList },
    { to: '/people', label: 'People', icon: User },
    { to: '/setup', label: 'Setup', icon: Settings },
    { to: '/notifications', label: 'Notifications', icon: Bell },
  ],
}

const ROLE_LABEL: Record<Role, string> = { student: 'Student', staff: 'Maintenance staff', warden: 'Warden', admin: 'Admin' }

function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button aria-label="Account menu" className="ml-1 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />}>
        <UserAvatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="space-y-0.5 py-2">
            <span className="block text-sm font-medium text-foreground">{user.name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
            <span className="block text-xs font-normal text-muted-foreground">{ROLE_LABEL[user.role]}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/settings')}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await logout()
            navigate('/login', { replace: true })
          }}
        >
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell() {
  const { user } = useAuth()
  const location = useLocation()
  const { data: notes } = useNotifications()
  if (!user) return null
  const items = NAV[user.role]
  const unread = notes?.unread ?? 0

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#main" className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="px-5 pb-4 pt-5">
          <Logo light />
          <p className="mt-1 pl-10 text-xs text-sidebar-foreground">Hostel maintenance</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Main">
          {items.map(({ to, label, icon: Icon, end, primary }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                  primary && !isActive && 'text-white',
                )
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{label}</span>
              {to === '/notifications' && unread > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{unread}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn('flex items-center gap-3 border-t border-sidebar-border p-4 outline-none transition-colors hover:bg-sidebar-accent/60 focus-visible:bg-sidebar-accent/60', isActive && 'bg-sidebar-accent')
          }
        >
          <UserAvatar user={user} className="size-9" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{user.name}</span>
            <span className="block truncate text-xs">{user.role === 'student' && user.hostelName ? `${user.hostelName} · Room ${user.roomNumber}` : ROLE_LABEL[user.role]}</span>
          </span>
          <Settings className="size-5 shrink-0" aria-hidden />
          <span className="sr-only">Settings</span>
        </NavLink>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <Logo className="lg:hidden" />
        <div className="flex-1" />
        <ThemeToggle />
        <NotificationBell />
        <UserMenu />
      </header>

      <main id="main" tabIndex={-1} key={location.pathname} className={cn("fx-rise mx-auto w-full px-4 pb-28 pt-6 sm:px-6 lg:pb-10", isManager(user.role) ? "max-w-7xl" : "max-w-5xl")}>
        <Suspense fallback={<ListSkeleton rows={3} />}>
          <Outlet />
        </Suspense>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Main"
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-around px-2">
          {items.map(({ to, label, icon: Icon, end, primary }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium outline-none transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                {primary ? (
                  <span className="-mt-5 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background">
                    <Icon className="size-5" aria-hidden />
                  </span>
                ) : (
                  <span className="relative">
                    <Icon className="size-5" aria-hidden />
                    {to === '/notifications' && unread > 0 && <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-primary" />}
                  </span>
                )}
                <span>{label.replace('Report a problem', 'Report').replace('My complaints', 'Complaints').replace('Notifications', 'Alerts').replace('Assigned to me', 'Assigned')}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

export function LogoutButton() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await logout()
        navigate('/login', { replace: true })
      }}
    >
      <LogOut /> Log out
    </Button>
  )
}
