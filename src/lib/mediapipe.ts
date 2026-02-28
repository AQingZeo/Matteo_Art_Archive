import { HandLandmarker, FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

let handInstance: HandLandmarker | null = null
let handLoading: Promise<HandLandmarker> | null = null

export async function getHandLandmarker(): Promise<HandLandmarker> {
  if (handInstance) return handInstance
  if (handLoading) return handLoading

  handLoading = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
    const hl = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' },
      numHands: 1,
      runningMode: 'VIDEO',
    })
    handInstance = hl
    return hl
  })()

  return handLoading
}

let faceInstance: FaceLandmarker | null = null
let faceLoading: Promise<FaceLandmarker> | null = null

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceInstance) return faceInstance
  if (faceLoading) return faceLoading

  faceLoading = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
    const fl = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
      numFaces: 1,
      runningMode: 'VIDEO',
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    })
    faceInstance = fl
    return fl
  })()

  return faceLoading
}

export function faceBboxArea(landmarks: Point2D[]): number {
  let minX = 1, maxX = 0, minY = 1, maxY = 0
  for (const lm of landmarks) {
    if (lm.x < minX) minX = lm.x
    if (lm.x > maxX) maxX = lm.x
    if (lm.y < minY) minY = lm.y
    if (lm.y > maxY) maxY = lm.y
  }
  return (maxX - minX) * (maxY - minY)
}

export interface Point2D {
  x: number
  y: number
}

export function pinchDistance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

const TIP_INDICES = [4, 8, 12, 16, 20] as const

export function maxTipDistance(landmarks: Point2D[]): number {
  let max = 0
  for (let i = 0; i < TIP_INDICES.length; i++) {
    for (let j = i + 1; j < TIP_INDICES.length; j++) {
      max = Math.max(max, pinchDistance(landmarks[TIP_INDICES[i]], landmarks[TIP_INDICES[j]]))
    }
  }
  return max
}

export function minTipDistance(landmarks: Point2D[]): number {
  let min = Infinity
  for (let i = 0; i < TIP_INDICES.length; i++) {
    for (let j = i + 1; j < TIP_INDICES.length; j++) {
      min = Math.min(min, pinchDistance(landmarks[TIP_INDICES[i]], landmarks[TIP_INDICES[j]]))
    }
  }
  return min
}

/** Min distance from thumb tip (4) to each of index(8), middle(12), ring(16), pinky(20) */
export function thumbToFingersMinDist(landmarks: Point2D[]): number {
  const thumb = landmarks[4]
  let min = Infinity
  for (const idx of [8, 12, 16, 20]) {
    min = Math.min(min, pinchDistance(thumb, landmarks[idx]))
  }
  return min
}

/** Min distance from thumb tip (4) to index(8) or middle(12) — used for pinch detection */
export function thumbPinchMinDist(landmarks: Point2D[]): number {
  const thumb = landmarks[4]
  return Math.min(
    pinchDistance(thumb, landmarks[8]),
    pinchDistance(thumb, landmarks[12]),
  )
}

export function tipsCentroid(landmarks: Point2D[]): Point2D {
  let sx = 0
  let sy = 0
  for (const idx of TIP_INDICES) {
    sx += landmarks[idx].x
    sy += landmarks[idx].y
  }
  return { x: sx / TIP_INDICES.length, y: sy / TIP_INDICES.length }
}
