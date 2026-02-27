import { useEffect, useRef, type RefObject } from 'react'
import {
  getHandLandmarker,
  maxTipDistance,
  minTipDistance,
  thumbPinchMinDist,
  tipsCentroid,
  type Point2D,
} from '@/lib/mediapipe'
import type { HandLandmarker } from '@mediapipe/tasks-vision'

export type CursorState = 'idle' | 'grasp' | 'spread' | 'pinch' | 'hidden'

interface Options {
  onZoom: (factor: number) => void
  onDragStart?: (x: number, y: number) => void
  onDrag?: (dx: number, dy: number) => void
  onDragEnd?: () => void
  onDoubleTap?: (x: number, y: number) => void
  onReset?: () => void
  onCursorMove?: (x: number, y: number, state: CursorState) => void
  containerRef?: RefObject<HTMLElement | null>
  enabled?: boolean
}

const TIP_INDICES = [4, 8, 12, 16, 20]

export function useMediaPipeGestures({
  onZoom,
  onDragStart,
  onDrag,
  onDragEnd,
  onDoubleTap,
  onReset,
  onCursorMove,
  containerRef,
  enabled = true,
}: Options) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onZoomRef = useRef(onZoom)
  const onDragStartRef = useRef(onDragStart)
  const onDragRef = useRef(onDrag)
  const onDragEndRef = useRef(onDragEnd)
  const onDoubleTapRef = useRef(onDoubleTap)
  const onResetRef = useRef(onReset)
  const onCursorMoveRef = useRef(onCursorMove)
  const containerRefStable = useRef(containerRef)
  onZoomRef.current = onZoom
  onDragStartRef.current = onDragStart
  onDragRef.current = onDrag
  onDragEndRef.current = onDragEnd
  onDoubleTapRef.current = onDoubleTap
  onResetRef.current = onReset
  onCursorMoveRef.current = onCursorMove
  containerRefStable.current = containerRef

  useEffect(() => {
    if (!enabled) return

    let stream: MediaStream | null = null
    let video: HTMLVideoElement | null = null
    let raf = 0
    let landmarker: HandLandmarker | null = null
    let cancelled = false

    // ── Zoom state (temporarily disabled) ──
    // let zoomActive = false
    // let smoothDist: number | null = null
    // let prevSmoothDist: number | null = null
    // let smoothFactor = 1.0
    // const ACTIVATE_DIST = 0.10
    // const DEACTIVATE_DIST = 0.30
    // const DIST_ALPHA = 0.18
    // const FACTOR_ALPHA = 0.25
    // const SENSITIVITY = 2.2
    // const DEADZONE = 0.0008
    // const IDLE_SNAP = 0.0003
    const zoomActive = false

    // ── Grasp state ──
    let graspActive = false
    let smoothGraspDist: number | null = null
    let prevScreenPos: Point2D | null = null
    let smoothCentroid: Point2D | null = null

    const GRASP_ACTIVATE = 0.12
    const GRASP_DEACTIVATE = 0.18
    const GRASP_DIST_ALPHA = 0.20
    const CURSOR_ALPHA = 0.30

    // ── Movement-relative virtual cursor ──
    let cursorPos: Point2D | null = null
    let prevSmooth: Point2D | null = null
    const CURSOR_SPEED = 1.0

    // ── Double-pinch state ──
    let pinchDown = false
    let lastPinchReleaseTime = 0
    let smoothPinchDist: number | null = null

    const DPINCH_DOWN_DIST = 0.06
    const DPINCH_UP_DIST = 0.12
    const DPINCH_ALPHA = 0.25
    const DPINCH_WINDOW_MS = 500
    const DPINCH_MIN_SPREAD = 0.13

    // ── Spread-shake reset state ──
    let spreadResetFired = false

    const SPREAD_ALL_MIN_DIST = 0.08
    const SPREAD_ALPHA = 0.20
    let smoothAllMinDist: number | null = null

    // Shake detection: buffer raw centroid-X while spread, fire if range > 1/4 screen
    const SHAKE_BUF_SIZE = 15
    const SHAKE_RANGE_THRESHOLD = 0.25
    const shakeBuf: number[] = []

    function getContainerSize(): { w: number; h: number } {
      const el = containerRefStable.current?.current
      if (!el) return { w: 0, h: 0 }
      const rect = el.getBoundingClientRect()
      return { w: rect.width, h: rect.height }
    }

    function updateCursorPos() {
      if (!smoothCentroid) return
      const { w, h } = getContainerSize()
      if (prevSmooth !== null && cursorPos !== null) {
        const dx = smoothCentroid.x - prevSmooth.x
        const dy = smoothCentroid.y - prevSmooth.y
        cursorPos.x += -dx * w * CURSOR_SPEED
        cursorPos.y += dy * h * CURSOR_SPEED
      } else if (cursorPos === null) {
        cursorPos = { x: w / 2, y: h / 2 }
      }
      prevSmooth = { x: smoothCentroid.x, y: smoothCentroid.y }
    }

    function detect() {
      if (cancelled || !video || !landmarker || video.readyState < 2) {
        if (!cancelled) raf = requestAnimationFrame(detect)
        return
      }

      const results = landmarker.detectForVideo(video, performance.now())
      const canvas = canvasRef.current
      const lm = results.landmarks?.[0]

      // ── Camera preview drawing ──
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(video, 0, 0)

          if (lm) {
            const w = canvas.width
            const h = canvas.height

            const tipColors = [
              'rgba(255,100,100,0.85)',
              'rgba(100,100,255,0.85)',
              'rgba(255,200,50,0.85)',
              'rgba(50,220,150,0.85)',
              'rgba(200,100,255,0.85)',
            ]
            for (let i = 0; i < TIP_INDICES.length; i++) {
              const tip = lm[TIP_INDICES[i]]
              ctx.fillStyle = tipColors[i]
              ctx.beginPath()
              ctx.arc(tip.x * w, tip.y * h, 4, 0, Math.PI * 2)
              ctx.fill()
            }

            ctx.strokeStyle = zoomActive
              ? 'rgba(100,255,100,0.7)'
              : 'rgba(255,255,255,0.35)'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(lm[4].x * w, lm[4].y * h)
            ctx.lineTo(lm[8].x * w, lm[8].y * h)
            ctx.stroke()

            if (graspActive) {
              const cent = tipsCentroid(lm)
              const maxR = maxTipDistance(lm)
              ctx.strokeStyle = 'rgba(255,220,50,0.8)'
              ctx.lineWidth = 2
              ctx.beginPath()
              ctx.arc(cent.x * w, cent.y * h, maxR * w * 0.6, 0, Math.PI * 2)
              ctx.stroke()
            }

            // Shake-reset progress ring
            if (shakeBuf.length > 2 && !spreadResetFired) {
              let lo = shakeBuf[0], hi = shakeBuf[0]
              for (let i = 1; i < shakeBuf.length; i++) {
                if (shakeBuf[i] < lo) lo = shakeBuf[i]
                if (shakeBuf[i] > hi) hi = shakeBuf[i]
              }
              const progress = Math.min(1, (hi - lo) / SHAKE_RANGE_THRESHOLD)
              if (progress > 0.1) {
                const cent = tipsCentroid(lm)
                ctx.strokeStyle = 'rgba(100,200,255,0.8)'
                ctx.lineWidth = 3
                ctx.beginPath()
                ctx.arc(
                  cent.x * w, cent.y * h, 20,
                  -Math.PI / 2,
                  -Math.PI / 2 + progress * Math.PI * 2,
                )
                ctx.stroke()
              }
            }
          }
        }
      }

      // ── Gesture logic ──
      if (lm) {
        const rawGraspDist = maxTipDistance(lm)
        const rawPinchDist = thumbPinchMinDist(lm)
        const rawAllMinDist = minTipDistance(lm)
        const centroid = tipsCentroid(lm)

        // Smooth grasp distance
        if (smoothGraspDist === null) {
          smoothGraspDist = rawGraspDist
        } else {
          smoothGraspDist += GRASP_DIST_ALPHA * (rawGraspDist - smoothGraspDist)
        }

        // Smooth centroid for cursor
        if (smoothCentroid === null) {
          smoothCentroid = { x: centroid.x, y: centroid.y }
        } else {
          smoothCentroid.x += CURSOR_ALPHA * (centroid.x - smoothCentroid.x)
          smoothCentroid.y += CURSOR_ALPHA * (centroid.y - smoothCentroid.y)
        }

        // Smooth pinch distance for double-pinch (thumb to closest of index/middle/ring)
        if (smoothPinchDist === null) {
          smoothPinchDist = rawPinchDist
        } else {
          smoothPinchDist += DPINCH_ALPHA * (rawPinchDist - smoothPinchDist)
        }

        // Smooth min-of-all-pairs distance for spread detection
        if (smoothAllMinDist === null) {
          smoothAllMinDist = rawAllMinDist
        } else {
          smoothAllMinDist += SPREAD_ALPHA * (rawAllMinDist - smoothAllMinDist)
        }

        // Determine cursor state for this frame
        let cursorState: CursorState = 'idle'

        // ─── 0. Spread + shake reset detection (highest priority) ───
        // ALL 5 fingertips must be far from each other (min pairwise > threshold)
        const isSpread = smoothAllMinDist > SPREAD_ALL_MIN_DIST
        if (isSpread && !graspActive && !zoomActive) {
          cursorState = 'spread'

          shakeBuf.push(centroid.x)
          if (shakeBuf.length > SHAKE_BUF_SIZE) shakeBuf.shift()

          if (shakeBuf.length >= SHAKE_BUF_SIZE && !spreadResetFired) {
            let lo = shakeBuf[0], hi = shakeBuf[0]
            for (let i = 1; i < shakeBuf.length; i++) {
              if (shakeBuf[i] < lo) lo = shakeBuf[i]
              if (shakeBuf[i] > hi) hi = shakeBuf[i]
            }
            if (hi - lo > SHAKE_RANGE_THRESHOLD) {
              spreadResetFired = true
              const { w, h } = getContainerSize()
              cursorPos = { x: w / 2, y: h / 2 }
              prevSmooth = null
              onResetRef.current?.()
            }
          }
        } else {
          shakeBuf.length = 0
          spreadResetFired = false
        }

        // ─── 1. Grasp detection ───
        if (!isSpread) {
          if (!graspActive && smoothGraspDist < GRASP_ACTIVATE) {
            graspActive = true
            prevScreenPos = cursorPos ? { ...cursorPos } : null
            if (cursorPos) onDragStartRef.current?.(cursorPos.x, cursorPos.y)
          }

          if (graspActive && cursorPos) {
            cursorState = 'grasp'
            if (prevScreenPos) {
              const dx = cursorPos.x - prevScreenPos.x
              const dy = cursorPos.y - prevScreenPos.y
              if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                onDragRef.current?.(dx, dy)
              }
            }
            prevScreenPos = { ...cursorPos }

            if (smoothGraspDist > GRASP_DEACTIVATE) {
              graspActive = false
              prevScreenPos = null
              onDragEndRef.current?.()
            }
          }
        } else if (graspActive) {
          graspActive = false
          prevScreenPos = null
          onDragEndRef.current?.()
        }

        // ─── 2. Double-pinch detection ───
        // Only when: not grasping, not spread, and other fingers are still extended
        const isPinchEligible = !graspActive && !isSpread
          && smoothGraspDist !== null && smoothGraspDist > DPINCH_MIN_SPREAD
        if (isPinchEligible) {
          if (!pinchDown && smoothPinchDist < DPINCH_DOWN_DIST) {
            pinchDown = true
          }
          if (pinchDown && smoothPinchDist > DPINCH_UP_DIST) {
            pinchDown = false
            const now = performance.now()
            if (now - lastPinchReleaseTime < DPINCH_WINDOW_MS) {
              if (cursorPos) onDoubleTapRef.current?.(cursorPos.x, cursorPos.y)
              lastPinchReleaseTime = 0
            } else {
              lastPinchReleaseTime = now
            }
          }

          const isSecondPinch = pinchDown
            && lastPinchReleaseTime > 0
            && performance.now() - lastPinchReleaseTime < DPINCH_WINDOW_MS
          if (isSecondPinch) cursorState = 'pinch'
        } else {
          pinchDown = false
        }

        // ─── 3. Hand zoom temporarily disabled ───

        // ─── Update movement-relative cursor and report ───
        updateCursorPos()
        if (cursorPos) {
          onCursorMoveRef.current?.(cursorPos.x, cursorPos.y, cursorState)
        }

      } else {
        // Hand lost — reset cursor to center, clear tracking state
        if (graspActive) {
          graspActive = false
          prevScreenPos = null
          onDragEndRef.current?.()
        }
        smoothGraspDist = null
        smoothCentroid = null
        smoothPinchDist = null
        smoothAllMinDist = null
        pinchDown = false
        shakeBuf.length = 0
        spreadResetFired = false
        prevSmooth = null

        const { w, h } = getContainerSize()
        cursorPos = { x: w / 2, y: h / 2 }
        onCursorMoveRef.current?.(cursorPos.x, cursorPos.y, 'idle')
      }

      raf = requestAnimationFrame(detect)
    }

    async function start() {
      try {
        landmarker = await getHandLandmarker()
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
        console.warn('MediaPipe / camera unavailable:', err)
      }
    }

    start()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [enabled])

  return { canvasRef }
}
