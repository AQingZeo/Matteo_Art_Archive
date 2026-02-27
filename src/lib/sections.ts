/**
 * Section metadata loader. Returns Section[] from config or API.
 * Preload crop on hover/selection; lazy-load.
 */
import type { Section } from '@/types/section'

export async function loadSections(): Promise<Section[]> {
  // TODO: fetch from /sections.json or API
  return []
}

export function getSectionById(id: string, sections: Section[]): Section | undefined {
  return sections.find((s) => s.id === id)
}
