/**
 * Section data model. See .cursor/rules/section-data-model.mdc
 */
export interface SectionRect {
  x: number
  y: number
  width: number
  height: number
}

/** Cutout item placed inside the box. Sizes in world units. */
export interface CutoutItem {
  id: string
  /** Full image URL (e.g. /section-a/photo.png). If omitted, use image + section id. */
  src?: string
  /** Filename in the section folder; path becomes /{sectionId}/{image}. Use when image lives in public/{sectionId}/. */
  image?: string
  width: number
  height: number
  /** Position in box space (x, y, z). y is height above bottom. */
  position?: { x: number; y: number; z: number }
  /** Rotation around Y (up) in radians. */
  rotationY?: number
}

export interface Section {
  id: string
  rect: SectionRect
  cropSrc: string
  has3D: boolean
  modelSrc?: string
  /** Cutouts are loaded from public/{id}/ (all images {id}-1.png, {id}-2.png, …). */
}
