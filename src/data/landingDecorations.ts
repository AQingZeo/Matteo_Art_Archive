/**
 * Floating decoration config for the landing page.
 *
 * Add / remove entries here — no changes to component or hook code needed.
 *
 * Coordinates are in viewport-percent (0–100).
 * frequency is in radians-per-second; phaseOffset shifts the wave.
 * size is the CSS size string for the placeholder (ignored when imageSrc is set).
 */

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

export const FLOATING_DECORATIONS: DecorationItem[] = [
  {
    id: 'fish-1',
    baseX: 20,
    baseY: 25,
    amplitudeX: 6,
    amplitudeY: 2,
    frequency: 0.8,
    phaseOffset: 0,
    size: '28px',
  },
  {
    id: 'fish-2',
    baseX: 70,
    baseY: 18,
    amplitudeX: 5,
    amplitudeY: 3,
    frequency: 0.6,
    phaseOffset: Math.PI * 0.7,
    size: '22px',
  },
  {
    id: 'fish-3',
    baseX: 45,
    baseY: 35,
    amplitudeX: 8,
    amplitudeY: 1.5,
    frequency: 1.0,
    phaseOffset: Math.PI * 1.3,
    size: '18px',
  },
]
