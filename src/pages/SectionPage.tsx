/**
 * Section page (/section/:id). Phase 3: route + crop swap. Phase 4: flip. Phase 5: 3D.
 * The live section view (with FlipSurface) currently lives in MapCanvas.
 * This route is a placeholder for future standalone section navigation.
 */
import { useParams } from 'react-router-dom'
import { Section3DCanvas } from '@/components/Section3DCanvas'

export function SectionPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="section-page">
      <Section3DCanvas sectionId={id ?? ''} />
    </div>
  )
}
