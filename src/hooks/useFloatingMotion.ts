import { useRef, useEffect, useState, type CSSProperties } from 'react'

interface MotionConfig {
  baseX: number
  baseY: number
  amplitudeX: number
  amplitudeY: number
  frequency: number
  phaseOffset: number
}

export interface FloatingMotionResult {
  style: CSSProperties
  /** Current x position in vw (0–100). */
  x: number
  /** Current y position in vh (0–100). */
  y: number
}

const VIEW_MARGIN = 4

/** Position on curve at time t (same formula as in landingDecorations so rotation is predefined). */
function curvePos(c: MotionConfig, t: number): { x: number; y: number } {
  const x = c.baseX + c.amplitudeX * Math.sin(t * c.frequency + c.phaseOffset)
  const y = c.baseY + c.amplitudeY * Math.sin(t * c.frequency * 1.15 + c.phaseOffset + Math.PI / 4)
  return { x, y }
}

function clamp(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(VIEW_MARGIN, Math.min(100 - VIEW_MARGIN, x)),
    y: Math.max(VIEW_MARGIN, Math.min(100 - VIEW_MARGIN, y)),
  }
}

/**
 * Drives a single floating element along a deterministic sin curve.
 * Position and returned (x,y) both come from the same curve so rotation can be predefined with no glitch.
 */
export function useFloatingMotion(cfg: MotionConfig): FloatingMotionResult {
  const raf = useRef(0)

  const [state, setState] = useState<FloatingMotionResult>(() => {
    const raw = curvePos(cfg, 0)
    const { x, y } = clamp(raw.x, raw.y)
    return {
      style: {
        position: 'absolute',
        left: `${x}vw`,
        top: `${y}vh`,
        willChange: 'left, top',
      },
      x,
      y,
    }
  })

  useEffect(() => {
    const t0 = performance.now()
    function tick() {
      const t = (performance.now() - t0) / 1000
      const raw = curvePos(cfg, t)
      const { x, y } = clamp(raw.x, raw.y)
      setState({
        style: {
          position: 'absolute',
          left: `${x}vw`,
          top: `${y}vh`,
          willChange: 'left, top',
        },
        x,
        y,
      })
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [cfg.baseX, cfg.baseY, cfg.amplitudeX, cfg.amplitudeY, cfg.frequency, cfg.phaseOffset])

  return state
}
