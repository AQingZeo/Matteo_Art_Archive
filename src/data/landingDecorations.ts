/**
 * Floating decoration config for the landing page.
 *
 * Items are auto-generated from images in public/landingMini/ (via Vite plugin).
 * Coordinates are in viewport-percent (0–100).
 * frequency is in radians-per-second; phaseOffset shifts the wave.
 * size is the CSS size string for the placeholder (ignored when imageSrc is set).
 */

import { LANDING_MINI_IMAGES } from 'virtual:landing-mini-images'

export interface DecorationItem {
  id: string
  /** Horizontal centre, vw% */
  baseX: number
  /** Vertical centre, vh% */
  baseY: number
  /** Horizontal swing, vw% */
  amplitudeX: number
  /** Vertical swing, vh% */
  amplitudeY: number
  /** Radians per second */
  frequency: number
  /** Wave phase offset (radians) */
  phaseOffset: number
  /** Optional image — leave undefined for placeholder shape */
  imageSrc?: string
  /** Placeholder diameter / image width (CSS value) */
  size?: string
}

/** Hotspot centre (vw/vh) for real-time “face the hotspot” rotation. */
export const HOTSPOT_CX = 70
export const HOTSPOT_CY = 65

/** Min distance from hotspot so items don’t overlap the tap area (vw/vh). */
const VIEW_MARGIN = 4
const MIN_RADIUS = 22
const SPREAD = 32

function clampBase(base: number, amplitude: number): number {
  return Math.max(VIEW_MARGIN + amplitude, Math.min(100 - VIEW_MARGIN - amplitude, base))
}
/** Place items in a ring above the hotspot only (baseY < HOTSPOT_CY) so they don’t overlap tap area. */
function itemForImage(filename: string, index: number): DecorationItem {
  const n = LANDING_MINI_IMAGES.length || 1
  // Upper semicircle only: angle in (-π, 0) so sin(angle) < 0 => baseY < HOTSPOT_CY
  const u = (index + 1) / (n + 2)
  const angle = -Math.PI + u * Math.PI
  const r = MIN_RADIUS + u * SPREAD
  const amplitudeX = 8 + (index % 4) * 2
  const amplitudeY = 4 + (index % 3) * 2
  const rawBaseX = HOTSPOT_CX + Math.cos(angle) * r
  const rawBaseY = HOTSPOT_CY + Math.sin(angle) * r * 0.9
  const baseX = clampBase(rawBaseX, amplitudeX)
  const baseY = clampBase(rawBaseY, amplitudeY)
  return {
    id: `landing-mini-${filename.replace(/\.[^.]+$/, '')}`,
    baseX,
    baseY,
    amplitudeX,
    amplitudeY,
    frequency: 0.2 + (index % 5) * 0.04,
    phaseOffset: (index / n) * Math.PI * 2,
    imageSrc: `/landingMini/${filename}`,
    size: '128px',
  }
}

export const FLOATING_DECORATIONS: DecorationItem[] = LANDING_MINI_IMAGES.map((filename, i) =>
  itemForImage(filename, i),
)
