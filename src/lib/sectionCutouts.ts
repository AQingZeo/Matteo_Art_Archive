/**
 * Load cutouts by discovering all images in a section's folder under public/.
 * Convention: public/{sectionId}/{sectionId}-1.png, {sectionId}-2.png, ...
 * We probe until we get a 404 or hit the max count.
 */
import type { CutoutItem } from '@/types/section'

const MAX_CUTOUTS = 5

/** Max size of the longer side in world units; aspect ratio is preserved from image. */
const MAX_WORLD_SIZE = 0.5
/** Gap between cutouts in world units. */
const SPACING = 0.08

/** Resolve URL to absolute so it works from any base (e.g. SPA route). */
function toAbsoluteUrl(path: string): string {
  if (path.startsWith('http') || path.startsWith('//')) return path
  return new URL(path, window.location.origin).href
}

/** Load image and return dimensions if valid; null otherwise. */
function loadImageDimensions(
  url: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () =>
      resolve(
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : null,
      )
    img.onerror = () => resolve(null)
    img.src = toAbsoluteUrl(url)
  })
}

/**
 * Discover which cutout images exist in public/{sectionId}/ and their pixel dimensions.
 * Naming: {sectionId}-1.png, {sectionId}-2.png, ...
 */
async function discoverImages(
  sectionId: string,
): Promise<Array<{ n: number; width: number; height: number }>> {
  const folder = sectionId.replace(/^\/+/, '')
  const results = await Promise.all(
    Array.from({ length: MAX_CUTOUTS }, (_, i) => i + 1).map(async (n) => {
      const path = `/${folder}/${folder}-${n}.png`
      const dims = await loadImageDimensions(path)
      return dims ? { n, width: dims.width, height: dims.height } : null
    }),
  )
  const found = results.filter(
    (r): r is { n: number; width: number; height: number } => r !== null,
  )
  found.sort((a, b) => a.n - b.n)
  return found
}

/** World size from pixel dimensions: longer side = MAX_WORLD_SIZE, aspect preserved. */
function worldSizeFromPixels(pw: number, ph: number): { w: number; h: number } {
  if (pw <= 0 || ph <= 0) return { w: MAX_WORLD_SIZE, h: MAX_WORLD_SIZE }
  const max = Math.max(pw, ph)
  const scale = MAX_WORLD_SIZE / max
  return {
    w: pw * scale,
    h: ph * scale,
  }
}

/**
 * Load cutouts for a section: discover images, preserve aspect ratio, layout so all stay visible.
 */
export async function loadSectionCutouts(
  sectionId: string,
): Promise<Array<CutoutItem & { src: string }>> {
  const discovered = await discoverImages(sectionId)
  const folder = sectionId.replace(/^\/+/, '')

  if (discovered.length === 0) return []

  const items: Array<CutoutItem & { src: string }> = []
  const withWorldSize = discovered.map((d) => ({
    ...d,
    ...worldSizeFromPixels(d.width, d.height),
  }))

  const count = withWorldSize.length
  const perRow = count <= 3 ? count : Math.ceil(count / 2)
  const rows = Math.ceil(count / perRow)

  let index = 0
  for (let row = 0; row < rows; row++) {
    const inThisRow = Math.min(perRow, count - index)
    const totalWidth = withWorldSize
      .slice(index, index + inThisRow)
      .reduce((sum, c) => sum + c.w, 0)
    const gap = (inThisRow - 1) * SPACING
    const startX = -(totalWidth + gap) / 2 + withWorldSize[index].w / 2
    let x = startX
    const z = row * (MAX_WORLD_SIZE + SPACING)
    for (let col = 0; col < inThisRow && index < withWorldSize.length; col++) {
      const c = withWorldSize[index]
      const image = `${folder}-${c.n}.png`
      const src = `/${folder}/${image}`
      items.push({
        id: `cutout-${c.n}`,
        image,
        src,
        width: c.w,
        height: c.h,
        position: { x, y: 0.02, z },
        rotationY: 0,
      })
      x += c.w + SPACING
      index++
    }
  }

  return items
}
