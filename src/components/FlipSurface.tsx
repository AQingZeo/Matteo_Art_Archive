import { useRef, useCallback, useEffect } from 'react'
import type { Section } from '@/types/section'

interface ScreenRect { x: number; y: number; w: number; h: number }

interface FlipSurfaceProps {
  section: Section
  screenRect: ScreenRect
  onFlipComplete?: () => void
}

const MAX_CLAMP = 0.15
const SNAP_THRESHOLD = 0.45
const SPRING_MS = 400

/* ── Fold-line x+y=c intersected with a rectangle ── */

function foldHits(
  c: number, x0: number, y0: number, x1: number, y1: number,
): [number, number][] {
  const raw: [number, number][] = []
  const xTop = c - y0
  if (xTop >= x0 && xTop <= x1) raw.push([xTop, y0])
  const yRight = c - x1
  if (yRight >= y0 && yRight <= y1) raw.push([x1, yRight])
  const xBot = c - y1
  if (xBot >= x0 && xBot <= x1) raw.push([xBot, y1])
  const yLeft = c - x0
  if (yLeft >= y0 && yLeft <= y1) raw.push([x0, yLeft])
  const out: [number, number][] = []
  for (const p of raw)
    if (!out.some(q => Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01))
      out.push(p)
  return out
}

function sortedPoly(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
  return [...pts].sort((a, b) =>
    Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx),
  )
}

function clipPoly(ctx: CanvasRenderingContext2D, poly: [number, number][]) {
  if (poly.length < 3) return
  ctx.beginPath()
  ctx.moveTo(poly[0][0], poly[0][1])
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1])
  ctx.closePath()
  ctx.clip()
}

/*
 * Fold model (à la turn.js): fold line is x+y=c sweeping from
 * c=w+h (bottom-right, nothing folded) toward c≈0 (top-left, fully folded).
 *
 * Flat region  : x+y < c  (still lying on the surface)
 * Folded region: x+y > c  (reflected across x+y=c)
 *
 * Reflection of (x,y) across x+y=c  →  (c−y, c−x).
 * Canvas transform: ctx.transform(0, -1, -1, 0, c, c)
 *
 * The reflected fold content extends LEFT (by up to h px) and UP (by up to
 * w px) beyond the image rectangle, so the canvas is padded on those sides
 * and drawing is translated so coordinates stay image-relative.
 */

function paintCurl(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number, h: number,
  padL: number, padT: number,
  progress: number,
) {
  const cW = w + padL
  const cH = h + padT
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cW, cH)
  ctx.translate(padL, padT)

  if (progress < 0.002) {
    ctx.drawImage(img, 0, 0, w, h)
    return
  }

  const maxC = w + h
  const c = maxC * (1 - progress)

  /* Image-bounds fold hits */
  const imgHits = foldHits(c, 0, 0, w, h)
  if (imgHits.length < 2) {
    if (c >= maxC) ctx.drawImage(img, 0, 0, w, h)
    return
  }

  /* Image-bounds flat polygon (for drawing the still-flat portion) */
  const corners: [number, number][] = [[0, 0], [w, 0], [w, h], [0, h]]
  const cc = [0, w, w + h, h]
  const flatCorners = corners.filter((_, i) => cc[i] < c - 0.01)
  const flatPoly = sortedPoly([...imgHits, ...flatCorners])

  /*
   * Extended flat polygon — the half-plane x+y<c within the full canvas
   * bounds [-padL, w] × [-padT, h].  For 0 < c < w+h the fold line
   * always hits the extended boundary at (w, c−w) and (c−h, h), and the
   * three canvas corners (-padL,-padT), (w,-padT), (-padL,h) are all on
   * the flat side.  This polygon lets the reflected fold content extend
   * beyond the image rectangle without being clipped.
   */
  const extHits: [number, number][] = [[w, c - w], [c - h, h]]
  const extCorners: [number, number][] = [[-padL, -padT], [w, -padT], [-padL, h]]
  const extFlatPoly = sortedPoly([...extHits, ...extCorners])

  const INV_S2 = 1 / Math.SQRT2
  const fmx = (imgHits[0][0] + imgHits[1][0]) / 2
  const fmy = (imgHits[0][1] + imgHits[1][1]) / 2

  /* 1. Flat portion (clipped to image bounds) */
  if (flatPoly.length >= 3) {
    ctx.save()
    clipPoly(ctx, flatPoly)
    ctx.drawImage(img, 0, 0, w, h)
    ctx.restore()
  }

  /* 2. Shadow cast by fold onto flat page */
  if (flatPoly.length >= 3) {
    ctx.save()
    clipPoly(ctx, flatPoly)
    const sw = Math.min(progress * 70, 55)
    const sa = Math.min(progress * 0.5, 0.35)
    const g = ctx.createLinearGradient(
      fmx, fmy,
      fmx - INV_S2 * sw, fmy - INV_S2 * sw,
    )
    g.addColorStop(0, `rgba(0,0,0,${sa})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  /* 3. Folded portion — reflected across x+y=c, clipped to extended
   *    flat polygon so the overhang past image bounds is visible. */
  if (extFlatPoly.length >= 3) {
    ctx.save()
    clipPoly(ctx, extFlatPoly)
    const dim = 1 - (0.06 + progress * 0.05)
    ctx.filter = `brightness(${dim.toFixed(3)})`
    ctx.transform(0, -1, -1, 0, c, c)
    ctx.drawImage(img, 0, 0, w, h)
    ctx.filter = 'none'
    ctx.restore()
  }

  /* 4. Fold-edge highlight (paper thickness catching light) */
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(imgHits[0][0], imgHits[0][1])
  ctx.lineTo(imgHits[1][0], imgHits[1][1])
  ctx.strokeStyle = `rgba(255,255,255,${Math.min(progress * 0.35, 0.22).toFixed(3)})`
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

/* ── Component ── */

export function FlipSurface({ section, screenRect, onFlipComplete }: FlipSurfaceProps) {
  const { w, h } = screenRect
  const padL = h
  const padT = w
  const cW = w + padL
  const cH = h + padT

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const progRef = useRef(0)
  const dragRef = useRef(false)
  const startPt = useRef({ x: 0, y: 0 })
  const startProg = useRef(0)
  const animRef = useRef(0)
  const cbRef = useRef(onFlipComplete)
  cbRef.current = onFlipComplete
  const wRef = useRef(w); wRef.current = w
  const hRef = useRef(h); hRef.current = h
  const padLRef = useRef(padL); padLRef.current = padL
  const padTRef = useRef(padT); padTRef.current = padT

  const diag = Math.hypot(w, h)

  const paint = useCallback(() => {
    const cvs = canvasRef.current
    const img = imgRef.current
    if (!cvs || !img) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return
    paintCurl(ctx, img, wRef.current, hRef.current, padLRef.current, padTRef.current, progRef.current)
  }, [])

  useEffect(() => {
    const img = new Image()
    img.src = section.cropSrc
    img.onload = () => { imgRef.current = img; paint() }
    return () => { img.onload = null }
  }, [section.cropSrc, paint])

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const dpr = window.devicePixelRatio || 1
    cvs.width = cW * dpr
    cvs.height = cH * dpr
    paint()
  }, [cW, cH, paint])

  useEffect(() => () => cancelAnimationFrame(animRef.current), [])

  const springTo = useCallback((target: number) => {
    cancelAnimationFrame(animRef.current)
    const start = progRef.current
    const t0 = performance.now()
    function tick(now: number) {
      const elapsed = now - t0
      const frac = Math.min(elapsed / SPRING_MS, 1)
      const eased = 1 - Math.pow(1 - frac, 3)
      progRef.current = start + (target - start) * eased
      paint()
      if (frac < 1) {
        animRef.current = requestAnimationFrame(tick)
      } else if (target >= 1) {
        setTimeout(() => cbRef.current?.(), 50)
      }
    }
    animRef.current = requestAnimationFrame(tick)
  }, [paint])

  const onDown = useCallback((e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if ((e.clientX - r.left) / r.width < 0.5 || (e.clientY - r.top) / r.height < 0.5) return
    cancelAnimationFrame(animRef.current)
    dragRef.current = true
    startPt.current = { x: e.clientX, y: e.clientY }
    startProg.current = progRef.current
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = startPt.current.x - e.clientX
    const dy = startPt.current.y - e.clientY
    let p = startProg.current + (dx + dy) / diag
    p = section.has3D ? Math.max(0, Math.min(1, p)) : Math.max(0, Math.min(MAX_CLAMP, p))
    progRef.current = p
    paint()
  }, [diag, section.has3D, paint])

  const onUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = false
    if (!section.has3D) springTo(0)
    else springTo(progRef.current >= SNAP_THRESHOLD ? 1 : 0)
  }, [section.has3D, springTo])

  return (
    <div
      className="flip-surface"
      style={{
        position: 'absolute',
        left: screenRect.x,
        top: screenRect.y,
        width: w,
        height: h,
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <canvas
        ref={canvasRef}
        className="flip-canvas"
        style={{
          position: 'absolute',
          left: -padL,
          top: -padT,
          width: cW,
          height: cH,
        }}
      />
    </div>
  )
}
