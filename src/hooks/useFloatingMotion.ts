import { useRef, useEffect, useState, type CSSProperties } from 'react'

interface MotionConfig {
  baseX: number
  baseY: number
  amplitudeX: number
  amplitudeY: number
  frequency: number
  phaseOffset: number
}

/**
 * Drives a single floating element along a sin-wave path.
 * Returns a CSSProperties object (transform + position) that the
 * consumer applies to a wrapper div.
 */
export function useFloatingMotion(cfg: MotionConfig): CSSProperties {
  const raf = useRef(0)
  const [style, setStyle] = useState<CSSProperties>(() => pos(cfg, 0))

  useEffect(() => {
    const t0 = performance.now()
    function tick() {
      const t = (performance.now() - t0) / 1000
      setStyle(pos(cfg, t))
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [cfg.baseX, cfg.baseY, cfg.amplitudeX, cfg.amplitudeY, cfg.frequency, cfg.phaseOffset])

  return style
}

function pos(c: MotionConfig, t: number): CSSProperties {
  const x = c.baseX + c.amplitudeX * Math.sin(t * c.frequency + c.phaseOffset)
  const y = c.baseY + c.amplitudeY * Math.sin(t * c.frequency * 1.3 + c.phaseOffset + Math.PI / 4)
  return {
    position: 'absolute',
    left: `${x}vw`,
    top: `${y}vh`,
    willChange: 'left, top',
  }
}
