/**
 * Section page (/section/:id).
 * The live section view (FlipSurface + BoxScene) currently lives in MapCanvas.
 * This route is a placeholder for future standalone section navigation.
 */
import { useParams } from 'react-router-dom'

export function SectionPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="section-page" data-section-id={id}>
      {/* Standalone section route — not yet wired */}
    </div>
  )
}
