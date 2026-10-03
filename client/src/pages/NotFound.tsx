import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
      <p className="text-5xl font-semibold text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">We can't find that page</h1>
      <p className="text-sm text-muted-foreground">The link may be old or mistyped. Head back to the start and try again.</p>
      <Button render={<Link to="/" />}>Go to the dashboard</Button>
    </div>
  )
}
