/**
 * Phase 4: Flip surface (cropped section image).
 * Drag from bottom-right → flip progress. has3D: complete flip and reveal 3D; !has3D: max ~20%, spring snap-back.
 */
interface FlipSurfaceProps {
  sectionId: string
}

export function FlipSurface({ sectionId }: FlipSurfaceProps) {
  return (
    <div className="flip-surface" data-section-id={sectionId}>
      {/* Cropped section image; flip transform driven by drag progress */}
    </div>
  )
}
