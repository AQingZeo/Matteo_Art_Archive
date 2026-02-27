/**
 * Phase 5: 3D canvas layer. Load model when section has3D and flip passes threshold.
 * Three.js (or similar); resize with viewport; no UI chrome.
 */
interface Section3DCanvasProps {
  sectionId: string
}

export function Section3DCanvas({ sectionId }: Section3DCanvasProps) {
  return (
    <div className="section-3d-canvas" data-section-id={sectionId}>
      {/* WebGL canvas; load modelSrc when flip revealed */}
    </div>
  )
}
