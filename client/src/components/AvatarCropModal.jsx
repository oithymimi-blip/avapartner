import { useEffect, useRef, useState } from 'react'
import { RotateCw, Sparkles, X, ZoomIn, ZoomOut, Move } from 'lucide-react'
import {
  clampAvatarOffsets,
  computeAutoAdjustment,
  drawAvatarToCanvas,
  exportAdjustedAvatar
} from '../utils/avatarUtils'

export default function AvatarCropModal({
  open,
  sourceImage,
  initialSettings,
  saving = false,
  onClose,
  onSave
}) {
  const canvasRef = useRef(null)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 })

  const [zoom, setZoom] = useState(initialSettings?.zoom ?? 1)
  const [offsetX, setOffsetX] = useState(initialSettings?.offsetX ?? 0)
  const [offsetY, setOffsetY] = useState(initialSettings?.offsetY ?? 0)
  const [rotation, setRotation] = useState(initialSettings?.rotation ?? 0)

  useEffect(() => {
    if (!open) return
    setZoom(initialSettings?.zoom ?? 1)
    setOffsetX(initialSettings?.offsetX ?? 0)
    setOffsetY(initialSettings?.offsetY ?? 0)
    setRotation(initialSettings?.rotation ?? 0)
  }, [open, sourceImage, initialSettings])

  useEffect(() => {
    if (!open || !sourceImage || !canvasRef.current) return
    drawAvatarToCanvas(canvasRef.current, sourceImage, { zoom, offsetX, offsetY, rotation })
  }, [open, sourceImage, zoom, offsetX, offsetY, rotation])

  if (!open || !sourceImage) return null

  const updateOffsets = (nextX, nextY, nextZoom = zoom, nextRot = rotation) => {
    const clamped = clampAvatarOffsets(sourceImage, 560, {
      zoom: nextZoom,
      offsetX: nextX,
      offsetY: nextY,
      rotation: nextRot
    })
    setOffsetX(clamped.offsetX)
    setOffsetY(clamped.offsetY)
  }

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseX: offsetX,
      baseY: offsetY
    }
  }

  const handlePointerMove = (e) => {
    if (!dragRef.current.active) return
    const dx = (e.clientX - dragRef.current.startX) / 260
    const dy = (e.clientY - dragRef.current.startY) / 260
    updateOffsets(dragRef.current.baseX + dx, dragRef.current.baseY + dy)
  }

  const handlePointerUp = (e) => {
    dragRef.current.active = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  const handleRotate = () => {
    const nextRot = (rotation + 90) % 360
    const auto = computeAutoAdjustment(sourceImage, nextRot)
    setRotation(nextRot)
    setZoom(auto.zoom)
    setOffsetX(auto.offsetX)
    setOffsetY(auto.offsetY)
  }

  const handleAutoReset = () => {
    const auto = computeAutoAdjustment(sourceImage, 0)
    setRotation(0)
    setZoom(auto.zoom)
    setOffsetX(auto.offsetX)
    setOffsetY(auto.offsetY)
  }

  const handleZoomChange = (val) => {
    const nextZoom = Number(val)
    setZoom(nextZoom)
    updateOffsets(offsetX, offsetY, nextZoom, rotation)
  }

  const handleConfirm = () => {
    const settings = { zoom, offsetX, offsetY, rotation }
    const dataUrl = exportAdjustedAvatar(sourceImage, settings, 320)
    onSave(dataUrl, settings)
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="card w-full sm:max-w-md bg-[#0d1522] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Adjust Profile Picture</h3>
            <p className="text-xs text-white/60">Drag to reposition and pinch or slide to zoom</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
            aria-label="Close adjuster"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Circular Preview Area */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-[260px] h-[260px] rounded-2xl overflow-hidden bg-black/40 border border-white/10 shadow-inner">
            <canvas
              ref={canvasRef}
              width={560}
              height={560}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="w-full h-full touch-none select-none cursor-grab active:cursor-grabbing"
            />
            {/* Circular vignette mask overlay matching mobile avatar shape */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full ring-[999px] ring-black/60 border-2 border-brand shadow-[0_0_24px_rgba(0,223,154,0.35)]"
            />
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] text-white/60">
            <Move className="w-3.5 h-3.5 text-brand" />
            <span>Drag photo inside the circle to align your face</span>
          </div>
        </div>

        {/* Zoom Control */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5">
            <button
              type="button"
              onClick={() => handleZoomChange(Math.max(1, Number((zoom - 0.15).toFixed(2))))}
              className="text-white/60 hover:text-white p-1"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <input
              type="range"
              min="1"
              max="3"
              step="0.02"
              value={zoom}
              onChange={(e) => handleZoomChange(e.target.value)}
              className="w-full accent-emerald-400 cursor-pointer"
            />
            <button
              type="button"
              onClick={() => handleZoomChange(Math.min(3, Number((zoom + 0.15).toFixed(2))))}
              className="text-white/60 hover:text-white p-1"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-white/70 w-10 text-right">{zoom.toFixed(1)}x</span>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleRotate}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs font-semibold text-white transition"
            >
              <RotateCw className="w-3.5 h-3.5 text-brand" />
              <span>Rotate 90°</span>
            </button>
            <button
              type="button"
              onClick={handleAutoReset}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs font-semibold text-white transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-brand" />
              <span>Auto Adjust</span>
            </button>
          </div>
        </div>

        {/* Save / Cancel */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 py-3 text-sm font-semibold text-white transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="btn py-3 text-sm font-bold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Apply & Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
