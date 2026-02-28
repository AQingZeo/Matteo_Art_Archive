const MAP_SIZE = 128

function hash(x: number, y: number, seed: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 43758.5453) * 43758.5453
  return h - Math.floor(h)
}

function smoothNoise(x: number, y: number, freq: number, seed: number): number {
  const fx = x * freq
  const fy = y * freq
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const dx = fx - ix
  const dy = fy - iy
  const sx = dx * dx * (3 - 2 * dx)
  const sy = dy * dy * (3 - 2 * dy)

  const c00 = hash(ix, iy, seed)
  const c10 = hash(ix + 1, iy, seed)
  const c01 = hash(ix, iy + 1, seed)
  const c11 = hash(ix + 1, iy + 1, seed)

  const top = c00 + (c10 - c00) * sx
  const bot = c01 + (c11 - c01) * sx
  return top + (bot - top) * sy
}

/**
 * Pre-generate a dissolve map (MAP_SIZE × MAP_SIZE).
 * Each value ∈ [0,1] represents when that pixel disappears:
 * low values dissolve first (center), high values last (edges).
 * Smooth value noise gives irregular organic boundaries.
 */
export function generateDissolveMap(): Float32Array {
  const map = new Float32Array(MAP_SIZE * MAP_SIZE)
  const cx = MAP_SIZE / 2
  const cy = MAP_SIZE / 2
  const maxDist = Math.hypot(cx, cy)

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const nx = x / MAP_SIZE
      const ny = y / MAP_SIZE
      const dist = Math.hypot(x - cx, y - cy) / maxDist

      const n1 = smoothNoise(nx, ny, 6, 42) * 0.28
      const n2 = smoothNoise(nx, ny, 14, 13) * 0.14
      const n3 = smoothNoise(nx, ny, 28, 7) * 0.08

      map[y * MAP_SIZE + x] = Math.min(1, dist * 0.55 + n1 + n2 + n3)
    }
  }
  return map
}

/**
 * Render the dissolve mask to a canvas for the given progress.
 * Returns a data URL suitable for CSS mask-image.
 * progress 0 = fully visible, progress 1 = fully dissolved.
 */
export function renderDissolveMask(
  map: Float32Array,
  canvas: HTMLCanvasElement,
  progress: number,
): string {
  canvas.width = MAP_SIZE
  canvas.height = MAP_SIZE
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(MAP_SIZE, MAP_SIZE)
  const data = imageData.data
  const edge = 0.07

  for (let i = 0; i < map.length; i++) {
    const alpha = Math.min(1, Math.max(0, (map[i] - progress) / edge))
    const idx = i * 4
    data[idx] = 255
    data[idx + 1] = 255
    data[idx + 2] = 255
    data[idx + 3] = (alpha * 255) | 0
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL()
}
