import { useRef, useCallback } from 'react'
import { FloatingDecorations } from '@/components/FloatingDecorations'

const HOTSPOT = { left: 0.6, top: 0.45, width: 0.2, height: 0.4 }

interface LandingOverlayProps {
  onEnter: () => void
}

export function LandingOverlay({ onEnter }: LandingOverlayProps) {
  const pageRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const leaving = useRef(false)

  const enter = useCallback(() => {
    if (leaving.current) return
    leaving.current = true

    const page = pageRef.current
    const wrapper = wrapperRef.current
    if (page && wrapper) {
      const wr = wrapper.getBoundingClientRect()
      const pr = page.getBoundingClientRect()
      const cx = wr.left - pr.left + wr.width * (HOTSPOT.left + HOTSPOT.width / 2)
      const cy = wr.top - pr.top + wr.height * (HOTSPOT.top + HOTSPOT.height / 2)
      page.style.transformOrigin = `${cx}px ${cy}px`
      page.classList.add('landing-zoom-out')
    }

    onEnter()
  }, [onEnter])

  return (
    <div ref={pageRef} className="landing-page landing-overlay">
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
        />
      </div>

      <FloatingDecorations />
    </div>
  )
}
