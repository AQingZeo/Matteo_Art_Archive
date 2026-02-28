import { useCallback, useRef, useState, useEffect } from 'react'
import { usePanZoom, type Transform } from '@/hooks/usePanZoom'
import { useMediaPipeGestures, type CursorState } from '@/hooks/useMediaPipeGestures'
import { useHeadZoom } from '@/hooks/useHeadZoom'
import { SECTIONS } from '@/data/sections'
import { generateDissolveMap, renderDissolveMask } from '@/lib/dissolve'
import type { Section } from '@/types/section'

type Phase = 'exploring' | 'zooming' | 'transitioning' | 'section'

function sectionTransform(
  s: Section,
  vw: number,
  vh: number,
): Transform {
  const scale = Math.min(vw / s.rect.width, vh / s.rect.height) * 0.8
  return {
    x: vw / 2 - (s.rect.x + s.rect.width / 2) * scale,
    y: vh / 2 - (s.rect.y + s.rect.height / 2) * scale,
    scale,
  }
}

function hitTestSection(
  screenX: number,
  screenY: number,
  t: Transform,
): Section | null {
  const imgX = (screenX - t.x) / t.scale
  const imgY = (screenY - t.y) / t.scale
  for (const s of SECTIONS) {
    const { x, y, width, height } = s.rect
    if (imgX >= x && imgX <= x + width && imgY >= y && imgY <= y + height) {
      return s
    }
  }
  return null
}

export function MapCanvas() {
  const {
    containerRef, contentRef, zoom, pan, reset,
    centerContent, animateTo, getTransform,
  } = usePanZoom()

  const [gestures, setGestures] = useState(false)
  const [headZoom, setHeadZoom] = useState(false)
  const cursorRef = useRef<HTMLDivElement>(null)
  const cursorStateRef = useRef<CursorState>('hidden')
  const headResetRef = useRef<() => void>(() => {})

  const [phase, setPhase] = useState<Phase>('exploring')
  const [focused, setFocused] = useState<Section | null>(null)
  const [sectionScreenRect, setSectionScreenRect] = useState<{
    x: number; y: number; w: number; h: number
  } | null>(null)

  const dissolveMapRef = useRef<Float32Array | null>(null)
  const dissolveCvsRef = useRef<HTMLCanvasElement | null>(null)
  if (!dissolveMapRef.current) dissolveMapRef.current = generateDissolveMap()
  if (!dissolveCvsRef.current && typeof document !== 'undefined') {
    dissolveCvsRef.current = document.createElement('canvas')
  }

  const selectSection = useCallback(
    (s: Section) => {
      if (phase !== 'exploring') return
      const c = containerRef.current
      if (!c) return
      const r = c.getBoundingClientRect()
      const target = sectionTransform(s, r.width, r.height)

      const sw = s.rect.width * target.scale
      const sh = s.rect.height * target.scale
      setSectionScreenRect({
        x: (r.width - sw) / 2,
        y: (r.height - sh) / 2,
        w: sw,
        h: sh,
      })

      setFocused(s)
      setPhase('zooming')
      animateTo(target, 500, () => {
        setPhase('transitioning')
      })
    },
    [phase, containerRef, animateTo],
  )

  useEffect(() => {
    if (phase !== 'transitioning') return
    const el = contentRef.current
    const map = dissolveMapRef.current
    const cvs = dissolveCvsRef.current
    if (!el || !map || !cvs) return

    const duration = 1800
    const t0 = performance.now()
    let raf = 0
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / duration)
      const maskUrl = renderDissolveMask(map, cvs, p)
      el.style.maskImage = `url(${maskUrl})`
      el.style.maskSize = '100% 100%'
      el.style.webkitMaskImage = `url(${maskUrl})`
      el.style.webkitMaskSize = '100% 100%'

      if (p < 1) {
        raf = requestAnimationFrame(step)
      } else {
        setPhase('section')
      }
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      if (el) {
        el.style.maskImage = ''
        el.style.webkitMaskImage = ''
      }
    }
  }, [phase, contentRef])

  const backToMap = useCallback(() => {
    setPhase('exploring')
    setFocused(null)
    setSectionScreenRect(null)
    const el = contentRef.current
    if (el) {
      el.style.maskImage = ''
      el.style.webkitMaskImage = ''
    }
    reset()
    headResetRef.current()
  }, [reset, contentRef])

  const handleSelect = useCallback(
    (screenX: number, screenY: number) => {
      if (phase === 'exploring') {
        const t = getTransform()
        const hit = hitTestSection(screenX, screenY, t)
        if (hit) selectSection(hit)
      }
    },
    [phase, getTransform, selectSection],
  )

  const handleGestureZoom = useCallback(
    (factor: number) => {
      if (phase !== 'exploring') return
      const c = containerRef.current
      if (!c) return
      const r = c.getBoundingClientRect()
      zoom(factor, r.width / 2, r.height / 2)
    },
    [containerRef, zoom, phase],
  )

  const handleDrag = useCallback(
    (dx: number, dy: number) => {
      if (phase !== 'exploring') return
      pan(dx, dy)
    },
    [pan, phase],
  )

  const handleDoubleTap = useCallback(
    (x: number, y: number) => {
      if (phase === 'exploring') {
        handleSelect(x, y)
        return
      }
      const el = document.elementFromPoint(x, y)
      if (el instanceof HTMLElement) el.click()
    },
    [phase, handleSelect],
  )

  const handleReset = useCallback(() => {
    if (phase === 'section' || phase === 'zooming' || phase === 'transitioning') {
      backToMap()
    } else {
      reset()
      headResetRef.current()
    }
  }, [phase, reset, backToMap])

  const handleCursorMove = useCallback((x: number, y: number, state: CursorState) => {
    const el = cursorRef.current
    if (!el) return
    cursorStateRef.current = state
    if (state === 'hidden') {
      el.style.opacity = '0'
      return
    }
    el.style.opacity = '1'
    el.style.transform = `translate(${x}px, ${y}px)`
    el.dataset.state = state
  }, [])

  const handleHeadZoom = useCallback(
    (factor: number) => {
      if (phase !== 'exploring') return
      const c = containerRef.current
      if (!c) return
      const r = c.getBoundingClientRect()
      zoom(factor, r.width / 2, r.height / 2)
    },
    [containerRef, zoom, phase],
  )

  const handleDblClick = useCallback(
    (e: React.MouseEvent) => {
      const c = containerRef.current
      if (!c) return
      const r = c.getBoundingClientRect()
      handleSelect(e.clientX - r.left, e.clientY - r.top)
    },
    [containerRef, handleSelect],
  )

  const { canvasRef: handCanvasRef } = useMediaPipeGestures({
    onZoom: handleGestureZoom,
    onDrag: handleDrag,
    onDoubleTap: handleDoubleTap,
    onReset: handleReset,
    onCursorMove: handleCursorMove,
    containerRef,
    enabled: gestures,
  })

  const { canvasRef: faceCanvasRef, resetBaseline: resetHeadBaseline } = useHeadZoom({
    onZoom: handleHeadZoom,
    enabled: headZoom,
  })
  headResetRef.current = resetHeadBaseline

  const showMaster = phase !== 'section'

  return (
    <div
      ref={containerRef}
      className="map-canvas"
      onDoubleClick={handleDblClick}
    >
      {/* Section view — mounted behind the master during transition, stays for section phase */}
      {(phase === 'transitioning' || phase === 'section') && focused && sectionScreenRect && (
        <div className="section-view">
          <img
            src={focused.cropSrc}
            alt={focused.id}
            className="section-image-placed"
            draggable={false}
            style={{
              position: 'absolute',
              left: sectionScreenRect.x,
              top: sectionScreenRect.y,
              width: sectionScreenRect.w,
              height: sectionScreenRect.h,
            }}
          />
          {phase === 'section' && (
            <button
              type="button"
              className="section-back-btn"
              onClick={backToMap}
            >
              Back to map
            </button>
          )}
        </div>
      )}

      {/* Master image layer — clips away during transition */}
      {showMaster && (
        <div
          ref={contentRef}
          className="map-content"
        >
          <img
            src="/test.png"
            alt=""
            className="master-image"
            draggable={false}
            onLoad={centerContent}
          />

          {phase === 'exploring' && SECTIONS.map((s) => (
            <div
              key={s.id}
              className="section-hotspot"
              style={{
                left: s.rect.x,
                top: s.rect.y,
                width: s.rect.width,
                height: s.rect.height,
              }}
            />
          ))}
        </div>
      )}

      {gestures && (
        <>
          <canvas ref={handCanvasRef} className="camera-preview" />
          <div ref={cursorRef} className="hand-cursor" data-state="hidden" />
        </>
      )}

      {headZoom && phase !== 'section' && (
        <canvas ref={faceCanvasRef} className="face-preview" />
      )}

      <div className="toggle-group">
        <button
          type="button"
          className="gesture-toggle"
          aria-pressed={gestures}
          aria-label={gestures ? 'Turn off hand gestures' : 'Turn on hand gestures'}
          onClick={() => setGestures((v) => !v)}
        >
          <span className="gesture-toggle-icon">{gestures ? '\u270B' : '\u2728'}</span>
          <span className="gesture-toggle-label">{gestures ? 'Hands on' : 'Hands'}</span>
        </button>

        <button
          type="button"
          className="gesture-toggle"
          aria-pressed={headZoom}
          aria-label={headZoom ? 'Turn off head zoom' : 'Turn on head zoom'}
          onClick={() => setHeadZoom((v) => !v)}
        >
          <span className="gesture-toggle-icon">{headZoom ? '\uD83D\uDC64' : '\uD83D\uDE10'}</span>
          <span className="gesture-toggle-label">{headZoom ? 'Head on' : 'Head'}</span>
        </button>
      </div>
    </div>
  )
}
