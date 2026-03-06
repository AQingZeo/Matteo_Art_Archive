import { useCallback, useRef, useState, useEffect, useContext } from 'react'
import { usePanZoom, type Transform } from '@/hooks/usePanZoom'
import { useMediaPipeGestures, type CursorState } from '@/hooks/useMediaPipeGestures'
import { useHeadZoom } from '@/hooks/useHeadZoom'
import { SECTIONS } from '@/data/sections'
import { generateDissolveMap, renderDissolveMask } from '@/lib/dissolve'
import { FlipSurface, type FlipSurfaceHandle } from '@/components/FlipSurface'
import { BoxScene } from '@/components/BoxScene'
import { IntroDissolveContext } from '@/app/AppLayout'
import type { BoxSceneHandle } from '@/lib/boxScene'
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
  const introDissolve = useContext(IntroDissolveContext)
  const {
    containerRef, contentRef, zoom, pan, reset,
    centerContent, animateTo, getTransform,
  } = usePanZoom()

  const [gestures, setGestures] = useState(false)
  const [headZoom, setHeadZoom] = useState(false)
  const cursorRef = useRef<HTMLDivElement>(null)
  const cursorStateRef = useRef<CursorState>('hidden')
  const headResetRef = useRef<() => void>(() => {})
  const boxSceneRef = useRef<BoxSceneHandle | null>(null)
  const flipRef = useRef<FlipSurfaceHandle | null>(null)
  const cursorPosRef = useRef({ x: 0, y: 0 })
  const cursorSensitivityRef = useRef(1)
  const cutoutDragActiveRef = useRef(false)
  const sectionViewRef = useRef<HTMLDivElement>(null)
  const pinchDragEnabledRef = useRef(false)

  const [phase, setPhase] = useState<Phase>('exploring')
  const [focused, setFocused] = useState<Section | null>(null)
  const [sectionScreenRect, setSectionScreenRect] = useState<{
    x: number; y: number; w: number; h: number
  } | null>(null)
  const [flipCompleted, setFlipCompleted] = useState(false)

  cursorSensitivityRef.current = phase === 'section' ? 0.85 : 1
  pinchDragEnabledRef.current = phase === 'section'

  const dissolveMapRef = useRef<Float32Array | null>(null)
  const dissolveCvsRef = useRef<HTMLCanvasElement | null>(null)
  if (!dissolveMapRef.current) dissolveMapRef.current = generateDissolveMap()
  if (!dissolveCvsRef.current && typeof document !== 'undefined') {
    dissolveCvsRef.current = document.createElement('canvas')
  }

  const introRunning = useRef(false)
  useEffect(() => {
    if (!introDissolve || introRunning.current) return
    introRunning.current = true

    const el = contentRef.current
    const map = dissolveMapRef.current
    const cvs = dissolveCvsRef.current
    if (!el || !map || !cvs) return

    const duration = 1400
    const t0 = performance.now()
    let raf = 0
    const step = () => {
      const p = 1 - Math.min(1, (performance.now() - t0) / duration)
      const maskUrl = renderDissolveMask(map, cvs, p)
      el.style.maskImage = `url(${maskUrl})`
      el.style.maskSize = '100% 100%'
      el.style.webkitMaskImage = `url(${maskUrl})`
      el.style.webkitMaskSize = '100% 100%'

      if (p > 0) {
        raf = requestAnimationFrame(step)
      } else {
        el.style.maskImage = ''
        el.style.webkitMaskImage = ''
        introRunning.current = false
      }
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      if (el) {
        el.style.maskImage = ''
        el.style.webkitMaskImage = ''
      }
      introRunning.current = false
    }
  }, [introDissolve, contentRef])

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
    setFlipCompleted(false)
    const el = contentRef.current
    if (el) {
      el.style.maskImage = ''
      el.style.webkitMaskImage = ''
    }
    reset()
    headResetRef.current()
  }, [reset, contentRef])

  const handleFlipComplete = useCallback(() => {
    setFlipCompleted(true)
  }, [])

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

  const cursorToViewport = useCallback((cx: number, cy: number) => {
    const el = containerRef.current
    if (!el) return { x: cx, y: cy }
    const r = el.getBoundingClientRect()
    return { x: r.left + cx, y: r.top + cy }
  }, [])

  const handleDragStart = useCallback(
    (x: number, y: number) => {
      if (phase !== 'section') return
      cursorPosRef.current = { x, y }
      const { x: screenX, y: screenY } = cursorToViewport(x, y)
      const cutoutIndex = boxSceneRef.current?.pickCutoutAt(screenX, screenY) ?? null
      if (cutoutIndex !== null) {
        cutoutDragActiveRef.current = true
        boxSceneRef.current?.startDragCutout(cutoutIndex)
        return
      }
      if (flipRef.current && sectionScreenRect) {
        flipRef.current.startDrag(x - sectionScreenRect.x, y - sectionScreenRect.y)
      }
    },
    [phase, sectionScreenRect, cursorToViewport],
  )

  const handleDrag = useCallback(
    (dx: number, dy: number) => {
      if (phase === 'exploring') {
        pan(dx, dy)
        return
      }
      if (phase === 'section') {
        const { x: cx, y: cy } = cursorPosRef.current
        if (cutoutDragActiveRef.current) {
          const { x: screenX, y: screenY } = cursorToViewport(cx, cy)
          boxSceneRef.current?.moveDragCutout(screenX, screenY)
          return
        }
        if (flipRef.current && sectionScreenRect) {
          flipRef.current.moveDrag(cx - sectionScreenRect.x, cy - sectionScreenRect.y)
        }
      }
    },
    [pan, phase, sectionScreenRect, cursorToViewport],
  )

  const handleDragEnd = useCallback(() => {
    if (phase === 'section') {
      if (cutoutDragActiveRef.current) {
        cutoutDragActiveRef.current = false
        boxSceneRef.current?.endDragCutout()
        return
      }
      if (flipRef.current) {
        flipRef.current.endDrag()
      }
    }
  }, [phase])

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

  const handleSectionPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (phase !== 'section' || !flipCompleted || !sectionViewRef.current) return
      const cutoutIndex = boxSceneRef.current?.pickCutoutAt(e.clientX, e.clientY) ?? null
      if (cutoutIndex !== null) {
        e.preventDefault()
        cutoutDragActiveRef.current = true
        boxSceneRef.current?.startDragCutout(cutoutIndex)
        sectionViewRef.current.setPointerCapture(e.pointerId)
      }
    },
    [phase, flipCompleted],
  )

  const handleSectionPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (cutoutDragActiveRef.current) {
        boxSceneRef.current?.moveDragCutout(e.clientX, e.clientY)
      }
    },
    [],
  )

  const handleSectionPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (cutoutDragActiveRef.current) {
        cutoutDragActiveRef.current = false
        boxSceneRef.current?.endDragCutout()
        sectionViewRef.current?.releasePointerCapture(e.pointerId)
      }
    },
    [],
  )

  const handleCursorMove = useCallback((x: number, y: number, state: CursorState) => {
    cursorPosRef.current = { x, y }
    if (phase === 'section') {
      const { x: screenX, y: screenY } = cursorToViewport(x, y)
      boxSceneRef.current?.setCursorPosition(screenX, screenY)
    }
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
  }, [phase, cursorToViewport])

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

  const handleHeadParallax = useCallback(
    (dx: number, dy: number) => {
      if (phase === 'section') {
        boxSceneRef.current?.setCameraOffset(dx, dy)
      }
    },
    [phase],
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
    onDragStart: handleDragStart,
    onDrag: handleDrag,
    onDragEnd: handleDragEnd,
    onDoubleTap: handleDoubleTap,
    onReset: handleReset,
    onCursorMove: handleCursorMove,
    containerRef,
    cursorSensitivityRef,
    pinchDragEnabledRef,
    enabled: gestures,
  })

  const { canvasRef: faceCanvasRef, resetBaseline: resetHeadBaseline } = useHeadZoom({
    onZoom: handleHeadZoom,
    onParallax: handleHeadParallax,
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
        <div
          ref={sectionViewRef}
          className="section-view"
          onPointerDown={handleSectionPointerDown}
          onPointerMove={handleSectionPointerMove}
          onPointerUp={handleSectionPointerUp}
          onPointerCancel={handleSectionPointerUp}
        >
          {phase === 'transitioning' && (
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
          )}
          {phase === 'section' && (
            <>
              <BoxScene
                section={focused}
                screenRect={sectionScreenRect}
                sceneRef={boxSceneRef}
              />
              {!flipCompleted && (
                <FlipSurface
                  ref={flipRef}
                  section={focused}
                  screenRect={sectionScreenRect}
                  onFlipComplete={handleFlipComplete}
                />
              )}
              <button
                type="button"
                className="section-back-btn"
                onClick={backToMap}
              >
                Back to map
              </button>
            </>
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
            src="/alphabetMap.png"
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

      {headZoom && (
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
