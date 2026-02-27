import { useCallback, useEffect, useRef } from 'react'
import { getFaceLandmarker, faceBboxArea } from '@/lib/mediapipe'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'

interface Options {
  onZoom: (factor: number) => void
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
export function useHeadZoom({ onZoom, enabled = true }: Options) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onZoomRef = useRef(onZoom)
  onZoomRef.current = onZoom

  const smoothAreaRef = useRef<number | null>(null)
  const prevAreaRef = useRef<number | null>(null)
  const warmupRef = useRef(0)

  const resetBaseline = useCallback(() => {
    smoothAreaRef.current = null
    prevAreaRef.current = null
    warmupRef.current = 0
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
      } else {
        smoothAreaRef.current = null
        prevAreaRef.current = null
        warmupRef.current = 0
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
