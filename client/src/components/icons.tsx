/**
 * Icons8 icon set (iOS 27 Outlined style).
 *
 * Each icon is an Icons8 SVG from src/assets/icons8/, embedded directly in the page so it stays
 * perfectly sharp at any size and screen density, and follows the surrounding text color
 * (hover states, light/dark mode) through `currentColor`.
 *
 * Icons by Icons8 (https://icons8.com).
 */
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const sources = import.meta.glob('/src/assets/icons8/*.svg', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

/** name -> SVG markup, sized to fill its box and colored by the current text color. */
const svgs: Record<string, string> = {}
for (const [path, src] of Object.entries(sources)) {
  const name = path.slice(path.lastIndexOf('/') + 1, -'.svg'.length)
  svgs[name] = src.replace(
    /<svg([^>]*?)>/,
    (_match, attrs: string) =>
      // The outline icons are drawn only 1-2 units thick on a 50-unit grid, which is under one pixel wide at
      // small sizes. A thin stroke of constant on-screen width (non-scaling) keeps every line crisp.
      `<svg${attrs.replace(/\s(?:width|height)="[^"]*"/g, '')} width="100%" height="100%" fill="currentColor" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true" focusable="false">`,
  )
}

export const hasIcon = (name: string) => name in svgs

export type IconProps = Omit<ComponentProps<'span'>, 'children'>

export function Icon({ name, className, ...props }: IconProps & { name: string }) {
  const markup = svgs[name]
  return (
    <span
      aria-hidden={props['aria-label'] ? undefined : true}
      role={props['aria-label'] ? 'img' : undefined}
      className={cn('pointer-events-none inline-block size-4 shrink-0 align-middle [&>svg]:block [&_svg_*]:[vector-effect:non-scaling-stroke]', className)}
      dangerouslySetInnerHTML={markup ? { __html: markup } : undefined}
      {...props}
    />
  )
}

const make = (name: string) => {
  const C = (props: IconProps) => <Icon name={name} {...props} />
  C.displayName = `Icon(${name})`
  return C
}

export type LucideIcon = (props: IconProps) => React.ReactNode

// Names below match the identifiers used across the app.
export const Armchair = make('armchair')
export const ArrowLeft = make('arrowLeft')
export const ArrowRight = make('arrowRight')
export const Bell = make('bell')
export const Building2 = make('building')
export const Camera = make('camera')
export const CameraOff = make('cameraOff')
export const Check = make('check')
export const CheckIcon = Check
export const CheckCheck = make('doubleCheck')
export const CheckCircle2 = Check
export const CircleCheckIcon = Check
export const ChevronDown = make('chevronDown')
export const ChevronDownIcon = ChevronDown
export const ChevronRight = make('chevronRight')
export const ChevronRightIcon = ChevronRight
export const ChevronUpIcon = (props: IconProps) => <Icon name="chevronDown" {...props} className={cn('rotate-180', props.className)} />
export const ClipboardList = make('clipboard')
export const Clock = make('clock')
export const Droplet = make('water')
export const Ellipsis = make('ellipsis')
export const Eye = make('eye')
export const EyeOff = make('eyeOff')
export const Hammer = make('hammer')
export const ImageIcon = make('picture')
export const Inbox = make('inbox')
export const InfoIcon = make('info')
export const LayoutDashboard = make('home')
export const ListChecks = make('tasks')
export const Loader2 = make('spinner')
export const Loader2Icon = Loader2
export const LogOut = make('logout')
export const MapPin = make('pin')
export const MessageSquare = make('chat')
export const Monitor = make('monitor')
export const Moon = make('moon')
export const OctagonXIcon = make('alert')
export const PlusCircle = make('plus')
export const RefreshCw = make('refresh')
export const Search = make('search')
export const Send = make('send')
/** Uses a gear icon once `settings.svg` is added; the person icon until then. */
export const Settings = make(hasIcon('settings') ? 'settings' : 'user')
export const Sparkles = make('broom')
export const Sun = make('sun')
export const AlertCircle = make('alert')
export const AlertTriangle = AlertCircle
export const TriangleAlert = AlertCircle
export const TriangleAlertIcon = AlertCircle
export const User = make('user')
export const UserCog = make('worker')
export const Wifi = make('wifi')
export const Wrench = make('wrench')
export const X = make('close')
export const XIcon = X
export const Zap = make('bolt')
