import { useRef, useEffect, useLayoutEffect, useState, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import { createBoxScene, type BoxSceneHandle } from '@/lib/boxScene'
import { loadSectionCutouts } from '@/lib/sectionCutouts'
import type { Section } from '@/types/section'
import type { CutoutItem } from '@/types/section'

/** Use the largest size the browser reports (viewport + outer window) so the container can cover the full visible area. */
function getViewportSize(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: 0, h: 0 }
  const vp = window.visualViewport
  const doc = document.documentElement
  const w = Math.max(
    window.innerWidth ?? 0,
    window.outerWidth ?? 0,
    doc.clientWidth ?? 0,
    vp?.width ?? 0,
  )
  const h = Math.max(
    window.innerHeight ?? 0,
    window.outerHeight ?? 0,
    doc.clientHeight ?? 0,
    vp?.height ?? 0,
  )
  return { w: Math.round(w), h: Math.round(h) }
}

interface ScreenRect { x: number; y: number; w: number; h: number }

interface BoxSceneProps {
  section: Section
  screenRect: ScreenRect
  /** When canvas is full size, pass section aspect so the box geometry stays unchanged. */
  boxAspect?: number
  sceneRef?: MutableRefObject<BoxSceneHandle | null>
}

export function BoxScene({ section, screenRect, boxAspect, sceneRef }: BoxSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<BoxSceneHandle | null>(null)
  const rafRef = useRef(0)
  const [viewportSize, setViewportSize] = useState(getViewportSize)
  const [resolvedCutouts, setResolvedCutouts] = useState<Array<CutoutItem & { src: string }>>([])
  const [cutoutsReady, setCutoutsReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCutoutsReady(false)
    loadSectionCutouts(section.id).then((cutouts) => {
      if (!cancelled) {
        setResolvedCutouts(cutouts)
        setCutoutsReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [section.id])

  const isFullView = screenRect.x === 0 && screenRect.y === 0
  const intendedW = isFullView ? viewportSize.w || screenRect.w : screenRect.w
  const intendedH = isFullView ? viewportSize.h || screenRect.h : screenRect.h

  useEffect(() => {
    const el = containerRef.current
    if (!el || !cutoutsReady) {
      cancelAnimationFrame(rafRef.current)
      const h = handleRef.current
      if (h) {
        h.destroy()
        handleRef.current = null
        if (sceneRef) sceneRef.current = null
      }
      return
    }

    const w = Math.max(1, intendedW)
    const h = Math.max(1, intendedH)
    let cancelled = false
    createBoxScene(el, w, h, resolvedCutouts, boxAspect, section.id).then((handle) => {
      if (cancelled) {
        handle.destroy()
        return
      }
      handleRef.current = handle
      if (sceneRef) sceneRef.current = handle

      function loop() {
        handle.stepPhysics()
        handle.render()
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      const h = handleRef.current
      if (h) {
        h.destroy()
        handleRef.current = null
        if (sceneRef) sceneRef.current = null
      }
    }
  }, [boxAspect, resolvedCutouts, sceneRef, cutoutsReady])

  useEffect(() => {
    if (!handleRef.current) return
    const w = Math.max(1, intendedW)
    const h = Math.max(1, intendedH)
    handleRef.current.resize(w, h)
  }, [intendedW, intendedH])

  useEffect(() => {
    const update = () => setViewportSize(getViewportSize())
    window.addEventListener('resize', update)
    const vp = window.visualViewport
    if (vp) {
      vp.addEventListener('resize', update)
      vp.addEventListener('scroll', update)
    }
    return () => {
      window.removeEventListener('resize', update)
      if (vp) {
        vp.removeEventListener('resize', update)
        vp.removeEventListener('scroll', update)
      }
    }
  }, [])

  useLayoutEffect(() => {
    if (!isFullView) return
    setViewportSize(getViewportSize())
    const raf = requestAnimationFrame(() => setViewportSize(getViewportSize()))
    return () => cancelAnimationFrame(raf)
  }, [isFullView])

  // Container size is from viewport/screenRect only so it stays independent of the 3D box scale.
  const container = (
    <div
      ref={containerRef}
      className="box-scene"
      style={
        isFullView
          ? {
              position: 'fixed' as const,
              left: 0,
              top: 0,
              width: viewportSize.w || screenRect.w,
              height: viewportSize.h || screenRect.h,
              minWidth: viewportSize.w || screenRect.w,
              minHeight: viewportSize.h || screenRect.h,
              zIndex: 0,
            }
          : {
              position: 'absolute' as const,
              left: screenRect.x,
              top: screenRect.y,
              width: screenRect.w,
              height: screenRect.h,
            }
      }
    />
  )
  if (isFullView && typeof document !== 'undefined' && document.body) {
    return createPortal(container, document.body)
  }
  return container
}
