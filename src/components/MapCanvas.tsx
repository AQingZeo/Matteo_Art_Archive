import { useCallback, useRef, useState } from 'react'
import { usePanZoom } from '@/hooks/usePanZoom'
import { useMediaPipeGestures, type CursorState } from '@/hooks/useMediaPipeGestures'
import { useHeadZoom } from '@/hooks/useHeadZoom'

export function MapCanvas() {
  const { containerRef, contentRef, zoom, pan, reset, centerContent } = usePanZoom()
  const [gestures, setGestures] = useState(false)
  const [headZoom, setHeadZoom] = useState(false)
  const cursorRef = useRef<HTMLDivElement>(null)
  const cursorStateRef = useRef<CursorState>('hidden')
  const headResetRef = useRef<() => void>(() => {})

  const handleGestureZoom = useCallback(
    (factor: number) => {
      const c = containerRef.current
      if (!c) return
      const r = c.getBoundingClientRect()
      zoom(factor, r.width / 2, r.height / 2)
    },
    [containerRef, zoom],
  )

  const handleDrag = useCallback(
    (dx: number, dy: number) => pan(dx, dy),
    [pan],
  )

  const handleDoubleTap = useCallback((_x: number, _y: number) => {
  }, [])

  const handleReset = useCallback(() => {
    reset()
    headResetRef.current()
  }, [reset])

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
      const c = containerRef.current
      if (!c) return
      const r = c.getBoundingClientRect()
      zoom(factor, r.width / 2, r.height / 2)
    },
    [containerRef, zoom],
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

  return (
    <div ref={containerRef} className="map-canvas">
      <div ref={contentRef} className="map-content">
        <img src="/test.png" alt="" className="master-image" draggable={false} onLoad={centerContent} />
      </div>

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
