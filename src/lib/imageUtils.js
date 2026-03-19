/**
 * Client-side image compression before uploading to Supabase storage.
 * Reduces upload size ~60-80% with no visible quality loss at social media sizes.
 *
 * compressImage(file, opts) → Promise<File>
 */
export async function compressImage(file, {
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.82,
  mimeType = 'image/webp',  // webp = best compression; fallback to jpeg if unsupported
} = {}) {
  // Only compress images — pass other file types through unchanged
  if (!file.type.startsWith('image/')) return file
  // Don't re-compress GIFs (they'd lose animation)
  if (file.type === 'image/gif') return file

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)

      // Calculate new dimensions while keeping aspect ratio
      let { width, height } = img
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      // Try webp first, fall back to jpeg if browser doesn't support it
      const outputMime = canvas.toDataURL(mimeType).startsWith(`data:${mimeType}`)
        ? mimeType
        : 'image/jpeg'

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Image compression failed'))
          // Use compressed file only if it's actually smaller
          if (blob.size >= file.size) return resolve(file)
          const ext = outputMime === 'image/webp' ? 'webp' : 'jpg'
          const name = file.name.replace(/\.[^.]+$/, `.${ext}`)
          resolve(new File([blob], name, { type: outputMime }))
        },
        outputMime,
        quality
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
    img.src = url
  })
}
