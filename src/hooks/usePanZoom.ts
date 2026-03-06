import { useRef, useCallback, useEffect } from 'react'

export interface Transform {
  x: number
  y: number
  scale: number
}

const MAX_SCALE = 20
const WHEEL_FACTOR = 0.002
const FIT_RATIO = 0.85

export function usePanZoom() {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const t = useRef<Transform>({ x: 0, y: 0, scale: 1 })
  const home = useRef<Transform>({ x: 0, y: 0, scale: 1 })
  const minScale = useRef(0.01)
  const dragging = useRef(false)
  const lastPt = useRef({ x: 0, y: 0 })

  const apply = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    const { x, y, scale } = t.current
    el.style.transform = `translate(${x}px,${y}px) scale(${scale})`
  }, [])

  const centerContent = useCallback(() => {
    const c = containerRef.current
    const el = contentRef.current
    if (!c || !el) return
    const cRect = c.getBoundingClientRect()
    const img = el.querySelector('img')
    if (!img) return
    const w = img.naturalWidth || img.clientWidth
    const h = img.naturalHeight || img.clientHeight
    if (!w || !h) return
    const fitScale = Math.min(cRect.width / w, cRect.height / h) * FIT_RATIO
    const cx = (cRect.width - w * fitScale) / 2
    const cy = (cRect.height - h * fitScale) / 2
    minScale.current = fitScale
    home.current = { x: cx, y: cy, scale: fitScale }
    t.current = { ...home.current }
    apply()
  }, [apply])

  const zoom = useCallback(
    (factor: number, cx: number, cy: number) => {
      const cur = t.current
      const next = Math.min(MAX_SCALE, Math.max(minScale.current, cur.scale * factor))
      const r = next / cur.scale
      cur.x = cx - (cx - cur.x) * r
      cur.y = cy - (cy - cur.y) * r
      cur.scale = next
      apply()
    },
    [apply],
  )

  useEffect(() => {
    const c = containerRef.current
    if (!c) return

    apply()

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = c.getBoundingClientRect()
      const factor = 1 - e.deltaY * WHEEL_FACTOR
      zoom(factor, e.clientX - rect.left, e.clientY - rect.top)
    }

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      dragging.current = true
      lastPt.current = { x: e.clientX, y: e.clientY }
      c.style.cursor = 'grabbing'
    }

    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      t.current.x += e.clientX - lastPt.current.x
      t.current.y += e.clientY - lastPt.current.y
      lastPt.current = { x: e.clientX, y: e.clientY }
      apply()
    }

    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      c.style.cursor = 'grab'
    }

    // Touch: single-finger pan, two-finger pinch zoom
    let lastTouchDist = 0

    const touchDist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        dragging.current = true
        lastPt.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      } else if (e.touches.length === 2) {
        dragging.current = false
        lastTouchDist = touchDist(e.touches[0], e.touches[1])
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1 && dragging.current) {
        const dx = e.touches[0].clientX - lastPt.current.x
        const dy = e.touches[0].clientY - lastPt.current.y
        lastPt.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        t.current.x += dx
        t.current.y += dy
        apply()
      } else if (e.touches.length === 2) {
        const d = touchDist(e.touches[0], e.touches[1])
        const rect = c.getBoundingClientRect()
        const mid = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
        }
        if (lastTouchDist > 0) {
          zoom(d / lastTouchDist, mid.x, mid.y)
        }
        lastTouchDist = d
      }
    }

    const onTouchEnd = () => {
      dragging.current = false
      lastTouchDist = 0
    }

    c.style.cursor = 'grab'
    c.addEventListener('wheel', onWheel, { passive: false })
    c.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    c.addEventListener('touchstart', onTouchStart, { passive: true })
    c.addEventListener('touchmove', onTouchMove, { passive: false })
    c.addEventListener('touchend', onTouchEnd)

    return () => {
      c.removeEventListener('wheel', onWheel)
      c.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      c.removeEventListener('touchstart', onTouchStart)
      c.removeEventListener('touchmove', onTouchMove)
      c.removeEventListener('touchend', onTouchEnd)
    }
  }, [zoom, apply])

  const pan = useCallback(
    (dx: number, dy: number) => {
      t.current.x += dx
      t.current.y += dy
      apply()
    },
    [apply],
  )

  const reset = useCallback(() => {
    t.current = { ...home.current }
    apply()
  }, [apply])

  const animRef = useRef(0)

  const animateTo = useCallback(
    (target: Transform, duration = 400, onComplete?: () => void) => {
      cancelAnimationFrame(animRef.current)
      const start = { ...t.current }
      const t0 = performance.now()
      const step = () => {
        const elapsed = performance.now() - t0
        const p = Math.min(1, elapsed / duration)
        const ease = 1 - (1 - p) * (1 - p)
        t.current.x = start.x + (target.x - start.x) * ease
        t.current.y = start.y + (target.y - start.y) * ease
        t.current.scale = start.scale + (target.scale - start.scale) * ease
        apply()
        if (p < 1) {
          animRef.current = requestAnimationFrame(step)
        } else {
          onComplete?.()
        }
      }
      animRef.current = requestAnimationFrame(step)
    },
    [apply],
  )

  const getTransform = useCallback(() => ({ ...t.current }), [])

  return { containerRef, contentRef, zoom, pan, reset, centerContent, animateTo, getTransform }
}
