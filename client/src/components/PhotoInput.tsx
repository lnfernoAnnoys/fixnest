import { useEffect, useRef, useState } from 'react'
import { Camera, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { compressImage } from '@/lib/image'

/** Optional photo: opens the camera or gallery on phones, shrinks the picture, shows a preview. */
export function PhotoInput({ file, onChange, label = 'Add a photo' }: { file: File | null; onChange: (f: File | null) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={label}
        onChange={async (e) => {
          const picked = e.target.files?.[0]
          e.target.value = ''
          if (picked) onChange(await compressImage(picked))
        }}
      />
      {preview ? (
        <div className="relative inline-block">
          <img src={preview} alt="Selected photo preview" className="h-24 w-24 rounded-lg border object-cover" />
          <button type="button" onClick={() => onChange(null)} aria-label="Remove photo" className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow">
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => input.current?.click()}>
          <Camera /> {label}
        </Button>
      )}
    </div>
  )
}
