/**
 * Section page (/section/:id). Phase 3: route + crop swap. Phase 4: flip. Phase 5: 3D.
 * Layer stack: background → 3D canvas → flip surface → (later: Matteo layer)
 */
import { useParams } from 'react-router-dom'
import { FlipSurface } from '@/components/FlipSurface'
import { Section3DCanvas } from '@/components/Section3DCanvas'

export function SectionPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="section-page">
      <Section3DCanvas sectionId={id ?? ''} />
      <FlipSurface sectionId={id ?? ''} />
    </div>
  )
}
