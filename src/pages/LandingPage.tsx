import { useRef, useCallback, useState, useLayoutEffect, useEffect } from 'react'
import { FloatingDecorations } from '@/components/FloatingDecorations'
import { useHeadZoom } from '@/hooks/useHeadZoom'
import textData from '@/data/text.json'

const germanQuote = textData.find(t => t.TextID === 'LandingGerman')!
const englishQuote = textData.find(t => t.TextID === 'LandingEnglish')!

const HOTSPOT = { left: 0.6, top: 0.45, width: 0.2, height: 0.4 }
const HOTSPOT_CENTER_X = HOTSPOT.left + HOTSPOT.width / 2
const HOTSPOT_CENTER_Y = HOTSPOT.top + HOTSPOT.height / 2
const LANDING_MAX_SCALE = 4
/** When head zoom reaches this scale (hotspot ~70% of screen), advance to main without transition. */
const ENTER_ZOOM_THRESHOLD = 2.2

interface LandingOverlayProps {
  onEnter: (options?: { skipTransition?: boolean }) => void
}

export function LandingOverlay({ onEnter }: LandingOverlayProps) {
  const pageRef = useRef<HTMLDivElement>(null)
  const zoomWrapRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const leaving = useRef(false)

  const [scale, setScale] = useState(1)
  const [origin, setOrigin] = useState({ x: 0, y: 0 })

  const updateOrigin = useCallback(() => {
    const page = pageRef.current
    const wrapper = wrapperRef.current
    if (!page || !wrapper) return
    const pr = page.getBoundingClientRect()
    const wr = wrapper.getBoundingClientRect()
    setOrigin({
      x: wr.left - pr.left + wr.width * HOTSPOT_CENTER_X,
      y: wr.top - pr.top + wr.height * HOTSPOT_CENTER_Y,
    })
  }, [])

  useLayoutEffect(() => {
    updateOrigin()
    window.addEventListener('resize', updateOrigin)
    return () => window.removeEventListener('resize', updateOrigin)
  }, [updateOrigin])

  const headEnterFiredRef = useRef(false)

  const handleHeadZoom = useCallback((factor: number) => {
    setScale((s) => Math.max(1, Math.min(LANDING_MAX_SCALE, s * factor)))
  }, [])

  useEffect(() => {
    if (scale >= ENTER_ZOOM_THRESHOLD && !headEnterFiredRef.current) {
      headEnterFiredRef.current = true
      pageRef.current?.classList.add('landing-head-fade')
      onEnter()
    }
  }, [scale, onEnter])

  const { canvasRef: faceCanvasRef } = useHeadZoom({
    onZoom: handleHeadZoom,
    enabled: true,
  })

  const enter = useCallback(() => {
    if (leaving.current) return
    leaving.current = true

    const page = pageRef.current
    const wrapper = wrapperRef.current
    if (page && wrapper) {
      const wr = wrapper.getBoundingClientRect()
      const pr = page.getBoundingClientRect()
      const cx = wr.left - pr.left + wr.width * HOTSPOT_CENTER_X
      const cy = wr.top - pr.top + wr.height * HOTSPOT_CENTER_Y
      page.style.transformOrigin = `${cx}px ${cy}px`
      page.classList.add('landing-zoom-out')
    }

    onEnter()
  }, [onEnter])

  return (
    <div ref={pageRef} className="landing-page landing-overlay">
      <canvas
        ref={faceCanvasRef}
        className="landing-face-canvas"
        aria-hidden
      />
      <div
        ref={zoomWrapRef}
        className="landing-zoom-wrap"
        style={{
          transformOrigin: `${origin.x}px ${origin.y}px`,
          transform: `scale(${scale})`,
        }}
      >
        <div className="landing-quote">
          <blockquote className="landing-quote-de">
            {germanQuote.Quote}
          </blockquote>
          <blockquote className="landing-quote-en">
            {englishQuote.Quote}
          </blockquote>
          <span className="landing-quote-author">— {germanQuote.QuoteAuthor}</span>
        </div>

        <div ref={wrapperRef} className="landing-image-wrapper">
          <img
            src="/landing.png"
            alt="Landing"
            className="landing-image"
            draggable={false}
          />

          <div
            className="landing-hotspot"
            role="button"
            tabIndex={0}
            onClick={enter}
            onKeyDown={(e) => { if (e.key === 'Enter') enter() }}
            style={{
              left: `${HOTSPOT.left * 100}%`,
              top: `${HOTSPOT.top * 100}%`,
              width: `${HOTSPOT.width * 100}%`,
              height: `${HOTSPOT.height * 100}%`,
            }}
          >
            <span className="landing-hotspot-label">Look closer</span>
          </div>
        </div>

        <FloatingDecorations />

        <span className="landing-art-credit">Art by Matteo Rederer</span>
      </div>
    </div>
  )
}
