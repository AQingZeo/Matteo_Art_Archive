import { useRef, useEffect, useMemo, type MutableRefObject } from 'react'
import { createBoxScene, type BoxSceneHandle } from '@/lib/boxScene'
import type { Section, CutoutItem } from '@/types/section'

interface ScreenRect { x: number; y: number; w: number; h: number }

/** Resolve cutout image path: use src, or /{sectionId}/{image} when image is set. */
function resolveCutouts(sectionId: string, cutouts: CutoutItem[] = []): Array<CutoutItem & { src: string }> {
  return cutouts
    .map((c) => {
      const src = c.src ?? (c.image ? `/${sectionId}/${c.image}` : '')
      return src ? { ...c, src } : null
    })
    .filter((c): c is CutoutItem & { src: string } => c !== null)
}

interface BoxSceneProps {
  section: Section
  screenRect: ScreenRect
  sceneRef?: MutableRefObject<BoxSceneHandle | null>
}

export function BoxScene({ section, screenRect, sceneRef }: BoxSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<BoxSceneHandle | null>(null)
  const rafRef = useRef(0)
  const resolvedCutouts = useMemo(
    () => resolveCutouts(section.id, section.cutouts),
    [section.id, section.cutouts],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let cancelled = false
    createBoxScene(el, screenRect.w, screenRect.h, resolvedCutouts).then((handle) => {
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
  }, [screenRect.w, screenRect.h, resolvedCutouts, sceneRef])

  return (
    <div
      ref={containerRef}
      className="box-scene"
      style={{
        position: 'absolute',
        left: screenRect.x,
        top: screenRect.y,
        width: screenRect.w,
        height: screenRect.h,
      }}
    />
  )
}
