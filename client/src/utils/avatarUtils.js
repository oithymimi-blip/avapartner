/**
 * Client-side profile picture loader, smart auto-framing calculator, and canvas exporter.
 */

export async function loadImageFromFile(file) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('Please select a valid image file (JPG, PNG, or WEBP).')
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Image file must be under 15 MB.')
  }

  // Prefer createImageBitmap with EXIF orientation support when available
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      // Convert to an HTMLCanvasElement scaled down to max 1024px so repeated redraws are instant on mobile
      const maxDim = 1024
      const ratio = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
      const targetW = Math.max(1, Math.round(bitmap.width * ratio))
      const targetH = Math.max(1, Math.round(bitmap.height * ratio))

      const workCanvas = document.createElement('canvas')
      workCanvas.width = targetW
      workCanvas.height = targetH
      const ctx = workCanvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, targetW, targetH)
      bitmap.close?.()
      return workCanvas
    } catch (_) {
      // Fallback below
    }
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the selected image.'))
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Unsupported or corrupted image file.'))
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export async function loadImageFromDataUrl(dataUrl) {
  return await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image for adjustment.'))
    img.src = dataUrl
  })
}

export function getImageDimensions(source) {
  if (!source) return { width: 1, height: 1 }
  return {
    width: source.naturalWidth || source.videoWidth || source.width || 1,
    height: source.naturalHeight || source.videoHeight || source.height || 1
  }
}

/**
 * Computes smart initial offsets so portrait photos frame slightly towards upper-center
 * (keeping faces inside the circular crop automatically).
 */
export function computeAutoAdjustment(source, rotation = 0) {
  const { width, height } = getImageDimensions(source)
  const isQuarterTurn = rotation % 180 !== 0
  const effW = isQuarterTurn ? height : width
  const effH = isQuarterTurn ? width : height

  // If tall portrait image, nudge framing slightly upward toward likely face region
  if (effH > effW * 1.15) {
    const ratioOverflow = (effH / effW - 1) * 0.5
    const smartOffsetY = Math.min(0.22, ratioOverflow * 0.35)
    return { zoom: 1, offsetX: 0, offsetY: smartOffsetY, rotation }
  }

  return { zoom: 1, offsetX: 0, offsetY: 0, rotation }
}

/**
 * Clamps normalized offsets [-maxOffset, +maxOffset] so the square/circle never shows blank margins.
 */
export function clampAvatarOffsets(source, canvasSize, { zoom = 1, offsetX = 0, offsetY = 0, rotation = 0 } = {}) {
  const { width, height } = getImageDimensions(source)
  const isQuarterTurn = rotation % 180 !== 0
  const effW = isQuarterTurn ? height : width
  const effH = isQuarterTurn ? width : height

  const baseScale = Math.max(canvasSize / effW, canvasSize / effH)
  const scale = baseScale * zoom
  const drawnW = effW * scale
  const drawnH = effH * scale

  const maxOffsetX = Math.max(0, (drawnW - canvasSize) / (2 * canvasSize))
  const maxOffsetY = Math.max(0, (drawnH - canvasSize) / (2 * canvasSize))

  return {
    offsetX: Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX)),
    offsetY: Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY)),
    scale,
    drawnW,
    drawnH
  }
}

/**
 * Draws the adjusted image onto a square canvas. Used both for live WYSIWYG preview and final export.
 */
export function drawAvatarToCanvas(canvas, source, options = {}) {
  const { zoom = 1, offsetX = 0, offsetY = 0, rotation = 0 } = options
  const size = canvas.width
  const ctx = canvas.getContext('2d')
  if (!ctx || !source) return

  const { width, height } = getImageDimensions(source)
  const { offsetX: clampedX, offsetY: clampedY, scale } = clampAvatarOffsets(source, size, {
    zoom,
    offsetX,
    offsetY,
    rotation
  })

  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = '#0b0f13'
  ctx.fillRect(0, 0, size, size)

  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(size / 2 + clampedX * size, size / 2 + clampedY * size)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.scale(scale, scale)
  ctx.drawImage(source, -width / 2, -height / 2, width, height)
  ctx.restore()
}

/**
 * Exports a square 320x320 compressed WebP/JPEG data URL ready for DB & mobile display (~15-35 KB).
 */
export function exportAdjustedAvatar(source, options = {}, outputSize = 320) {
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  drawAvatarToCanvas(canvas, source, options)

  const webp = canvas.toDataURL('image/webp', 0.86)
  if (webp.startsWith('data:image/webp') && webp.length < 180_000) {
    return webp
  }
  return canvas.toDataURL('image/jpeg', 0.86)
}

/**
 * Converts a loaded image source into a reusable JPEG data URL (max 900px) so the user can re-adjust later.
 */
export function sourceToPreviewDataUrl(source, maxDim = 900) {
  const { width, height } = getImageDimensions(source)
  const ratio = Math.min(1, maxDim / Math.max(width, height))
  const w = Math.max(1, Math.round(width * ratio))
  const h = Math.max(1, Math.round(height * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0b0f13'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.9)
}
