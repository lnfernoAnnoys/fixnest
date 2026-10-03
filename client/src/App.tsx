import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Loader2 } from '@/components/icons'
import { useAuth } from '@/lib/auth'
import { isManager, type Role } from '@/lib/types'
// Sign-in pages load with the app; everything else is fetched when first visited (keeps the first load small).
import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'
import VerifyEmail from '@/pages/auth/VerifyEmail'

const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'))
const GoogleSignup = lazy(() => import('@/pages/auth/GoogleSignup'))
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'))
const ComplaintDetail = lazy(() => import('@/pages/ComplaintDetail'))
const Complaints = lazy(() => import('@/pages/Complaints'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const NewComplaint = lazy(() => import('@/pages/NewComplaint'))
const Notifications = lazy(() => import('@/pages/Notifications'))
const Privacy = lazy(() => import('@/pages/Privacy'))
const Terms = lazy(() => import('@/pages/Terms'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const Settings = lazy(() => import('@/pages/Settings'))
const AdminComplaints = lazy(() => import('@/pages/admin/AdminComplaints'))
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'))
const People = lazy(() => import('@/pages/admin/People'))
const Setup = lazy(() => import('@/pages/admin/Setup'))

function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

/** Sends signed-out visitors to /login and remembers where they were going. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return <>{children}</>
}

/** UI-level convenience only; the API enforces roles on its own. */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  return user && roles.includes(user.role) ? <>{children}</> : <Navigate to="/" replace />
}

/** The landing page depends on who you are. */
function Home() {
  const { user } = useAuth()
  return isManager(user?.role) ? <AdminDashboard /> : <Dashboard />
}

/** Wardens get the full table with filters; students and staff get the simple list. */
function ComplaintsRoute() {
  const { user } = useAuth()
  return isManager(user?.role) ? <AdminComplaints /> : <Complaints />
}

/** Keeps the browser tab title in step with the page, so tabs, history and screen readers say where you are. */
const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Dashboard'],
  [/^\/complaints\/([^/]+)$/, '$1'],
  [/^\/complaints$/, 'Complaints'],
  [/^\/new$/, 'Report a problem'],
  [/^\/notifications$/, 'Notifications'],
  [/^\/settings$/, 'Settings'],
  [/^\/people$/, 'People'],
  [/^\/setup$/, 'Setup'],
  [/^\/login$/, 'Log in'],
  [/^\/register$/, 'Sign up'],
  [/^\/verify$/, 'Verify your email'],
  [/^\/forgot-password$/, 'Forgot password'],
  [/^\/reset-password$/, 'Choose a new password'],
  [/^\/google-signup$/, 'Finish signing up'],
  [/^\/privacy$/, 'Privacy policy'],
  [/^\/terms$/, 'Terms of service'],
  [/^\/r\//, 'Report a problem'],
]
function TitleUpdater() {
  const { pathname } = useLocation()
  useEffect(() => {
    const hit = TITLES.find(([re]) => re.test(pathname))
    const title = hit ? pathname.replace(hit[0], hit[1]) : 'Page not found'
    document.title = `${title} · FixNest`
  }, [pathname])
  return null
}

export default function App() {
  return (
    <ErrorBoundary>
      <TitleUpdater />
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify" element={<VerifyEmail />} />
          <Route path="/google-signup" element={<GoogleSignup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Home />} />
            <Route path="complaints" element={<ComplaintsRoute />} />
            <Route path="complaints/:code" element={<ComplaintDetail />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
            <Route
              path="people"
              element={
                <RequireRole roles={['warden', 'admin']}>
                  <People />
                </RequireRole>
              }
            />
            <Route
              path="setup"
              element={
                <RequireRole roles={['admin']}>
                  <Setup />
                </RequireRole>
              }
            />
            <Route
              path="new"
              element={
                <RequireRole roles={['student']}>
                  <NewComplaint />
                </RequireRole>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
