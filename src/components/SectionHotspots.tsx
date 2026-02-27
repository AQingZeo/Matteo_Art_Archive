/**
 * Phase 2: Invisible or subtle hotspots per section (rect).
 * Click or gesture-select → set selected section id → trigger auto frame.
 */
export function SectionHotspots() {
  // Load section metadata; render SVG or divs over rects
  // On select: MAIN_TRANSITION_OUT(sectionId) → animate camera to frame section → route to /section/:id
  return <div className="section-hotspots" aria-hidden />
}
