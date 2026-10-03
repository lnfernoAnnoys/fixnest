/**
 * Turns any picture into a small square profile photo: the middle square, 512px, re-drawn as a JPEG
 * (so hidden camera data such as GPS is dropped). Throws if the browser cannot read the file.
 */
export async function avatarImage(file: File, size = 512): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.min(size, side)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('Could not process that picture.')
  return new File([blob], 'profile.jpg', { type: 'image/jpeg' })
}

/**
 * Prepares a photo for upload:
 *  - shrinks it (max 1600px) so submitting is fast on mobile data and stays well under the 5 MB server limit
 *  - re-draws it into a fresh JPEG, which drops all hidden camera data, including the GPS location that phones
 *    embed in photos. Only the picture itself is sent.
 * Falls back to the original file only if the browser cannot decode it.
 */
export async function compressImage(file: File, maxSize = 1600, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file) // applies the photo's rotation before we drop its metadata
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff' // transparent PNG areas would otherwise turn black in a JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
