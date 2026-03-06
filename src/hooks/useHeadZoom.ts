import { useCallback, useEffect, useRef } from 'react'
import { getFaceLandmarker, faceBboxArea } from '@/lib/mediapipe'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'

interface Options {
  onZoom: (factor: number) => void
  onParallax?: (dx: number, dy: number) => void
  enabled?: boolean
}

/**
 * Head-distance zoom: face bounding-box area is a proxy for camera distance.
 * Leaning in (larger bbox) → zoom in; leaning back (smaller bbox) → zoom out.
 *
 * Pipeline:
 *   1. FaceLandmarker → 468 normalized landmarks per frame
 *   2. Compute bounding-box area of all landmarks
 *   3. Heavy EMA smooth the area (alpha ~0.08) to kill jitter
 *   4. Compare smoothed area to previous frame → ratio = zoom factor
 *   5. Deadzone: ignore ratios very close to 1.0
 *   6. Sensitivity scales the deviation from 1.0
 */
// World-unit range so at full head tilt the bottom can shift to the visual edge of the top opening
const PARALLAX_RANGE = 2.2
const PARALLAX_ALPHA = 0.12
// When face is lost, hold parallax and decay to zero over this ms to prevent glitch
const PARALLAX_LOST_HOLD_MS = 350

export function useHeadZoom({ onZoom, onParallax, enabled = true }: Options) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onZoomRef = useRef(onZoom)
  onZoomRef.current = onZoom
  const onParallaxRef = useRef(onParallax)
  onParallaxRef.current = onParallax

  const smoothAreaRef = useRef<number | null>(null)
  const prevAreaRef = useRef<number | null>(null)
  const warmupRef = useRef(0)
  const smoothCxRef = useRef<number | null>(null)
  const smoothCyRef = useRef<number | null>(null)

  const resetBaseline = useCallback(() => {
    smoothAreaRef.current = null
    prevAreaRef.current = null
    warmupRef.current = 0
    smoothCxRef.current = null
    smoothCyRef.current = null
  }, [])

  useEffect(() => {
    if (!enabled) return

    let stream: MediaStream | null = null
    let video: HTMLVideoElement | null = null
    let raf = 0
    let landmarker: FaceLandmarker | null = null
    let cancelled = false

    smoothAreaRef.current = null
    prevAreaRef.current = null
    warmupRef.current = 0
    smoothCxRef.current = null
    smoothCyRef.current = null

    let lastParallaxDx = 0
    let lastParallaxDy = 0
    let faceLostAt: number | null = null

    const AREA_ALPHA = 0.08
    const DEADZONE = 0.006
    const SENSITIVITY = 1.8
    const WARMUP_FRAMES = 15

    function detect() {
      if (cancelled || !video || !landmarker || video.readyState < 2) {
        if (!cancelled) raf = requestAnimationFrame(detect)
        return
      }

      const results = landmarker.detectForVideo(video, performance.now())
      const canvas = canvasRef.current
      const faceLm = results.faceLandmarks?.[0]

      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(video, 0, 0)

          if (faceLm) {
            const w = canvas.width
            const h = canvas.height

            let minX = 1, maxX = 0, minY = 1, maxY = 0
            for (const pt of faceLm) {
              if (pt.x < minX) minX = pt.x
              if (pt.x > maxX) maxX = pt.x
              if (pt.y < minY) minY = pt.y
              if (pt.y > maxY) maxY = pt.y
            }

            ctx.strokeStyle = 'rgba(100,200,255,0.6)'
            ctx.lineWidth = 2
            ctx.strokeRect(
              minX * w, minY * h,
              (maxX - minX) * w, (maxY - minY) * h,
            )
          }
        }
      }

      if (faceLm) {
        const rawArea = faceBboxArea(faceLm)

        if (smoothAreaRef.current === null) {
          smoothAreaRef.current = rawArea
          warmupRef.current = 0
        } else {
          smoothAreaRef.current += AREA_ALPHA * (rawArea - smoothAreaRef.current)
        }

        warmupRef.current++

        if (warmupRef.current > WARMUP_FRAMES
            && prevAreaRef.current !== null
            && prevAreaRef.current > 0) {
          const ratio = smoothAreaRef.current / prevAreaRef.current
          const deviation = ratio - 1.0
          if (Math.abs(deviation) > DEADZONE) {
            const factor = 1 + deviation * SENSITIVITY
            onZoomRef.current(factor)
          }
        }

        prevAreaRef.current = smoothAreaRef.current

        // Parallax: face bbox center offset → camera XY
        let fMinX = 1, fMaxX = 0, fMinY = 1, fMaxY = 0
        for (const pt of faceLm) {
          if (pt.x < fMinX) fMinX = pt.x
          if (pt.x > fMaxX) fMaxX = pt.x
          if (pt.y < fMinY) fMinY = pt.y
          if (pt.y > fMaxY) fMaxY = pt.y
        }
        const cx = (fMinX + fMaxX) / 2
        const cy = (fMinY + fMaxY) / 2
        if (smoothCxRef.current === null) {
          smoothCxRef.current = cx
          smoothCyRef.current = cy
        } else {
          smoothCxRef.current += PARALLAX_ALPHA * (cx - smoothCxRef.current)
          smoothCyRef.current! += PARALLAX_ALPHA * (cy - smoothCyRef.current!)
        }
        const dx = (0.5 - smoothCxRef.current) * PARALLAX_RANGE
        const dy = (smoothCyRef.current! - 0.5) * PARALLAX_RANGE
        lastParallaxDx = dx
        lastParallaxDy = dy
        faceLostAt = null
        onParallaxRef.current?.(dx, dy)
      } else {
        smoothAreaRef.current = null
        prevAreaRef.current = null
        warmupRef.current = 0
        smoothCxRef.current = null
        smoothCyRef.current = null
        const now = performance.now()
        if (faceLostAt === null) faceLostAt = now
        const elapsed = now - faceLostAt
        if (elapsed >= PARALLAX_LOST_HOLD_MS) {
          onParallaxRef.current?.(0, 0)
        } else {
          const factor = 1 - elapsed / PARALLAX_LOST_HOLD_MS
          onParallaxRef.current?.(lastParallaxDx * factor, lastParallaxDy * factor)
        }
      }

      raf = requestAnimationFrame(detect)
    }

    async function start() {
      try {
        landmarker = await getFaceLandmarker()
        if (cancelled) return

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        video = document.createElement('video')
        video.srcObject = stream
        video.autoplay = true
        video.playsInline = true
        await video.play()
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        raf = requestAnimationFrame(detect)
      } catch (err) {
        console.warn('FaceLandmarker / camera unavailable:', err)
      }
    }

    start()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [enabled])

  return { canvasRef, resetBaseline }
}
