import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Last line of defence: if something throws while drawing a page (or a page file fails to download after an
 * update), show a calm message with a way out instead of a blank white screen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unexpected error while rendering:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">This page couldn't be shown. Reloading usually fixes it. If it keeps happening, tell the hostel office.</p>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Reload the page</Button>
          <Button variant="outline" onClick={() => window.location.assign('/')}>
            Go to the start
          </Button>
        </div>
      </div>
    )
  }
}
