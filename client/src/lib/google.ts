/** Minimal typings for the parts of Google Identity Services we use. */
interface GoogleIdApi {
  initialize(config: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup' | 'redirect'; use_fedcm_for_prompt?: boolean }): void
  renderButton(
    el: HTMLElement,
    options: { type?: 'standard'; theme?: 'outline' | 'filled_blue' | 'filled_black'; size?: 'large' | 'medium' | 'small'; text?: 'signin_with' | 'signup_with' | 'continue_with'; shape?: 'rectangular' | 'pill'; width?: number; logo_alignment?: 'left' | 'center' },
  ): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } }
  }
}

let loading: Promise<GoogleIdApi> | null = null

/** Loads Google's sign-in script once and resolves with its API. Rejects if it is blocked or offline. */
export function loadGoogleIdentity(): Promise<GoogleIdApi> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id)
  loading ??= new Promise<GoogleIdApi>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => (window.google?.accounts.id ? resolve(window.google.accounts.id) : reject(new Error('Google script missing')))
    s.onerror = () => {
      loading = null // allow a retry later
      reject(new Error('Google script failed to load'))
    }
    document.head.appendChild(s)
  })
  return loading
}
