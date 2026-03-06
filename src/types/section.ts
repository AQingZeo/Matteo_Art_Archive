/**
 * Section data model. See .cursor/rules/section-data-model.mdc
 */
export interface SectionRect {
  x: number
  y: number
  width: number
  height: number
}


export interface Section {
  id: string
  rect: SectionRect
  cropSrc: string
  has3D: boolean
  modelSrc?: string
  // Future: matteo_line, echo_pool, rare_replies
}
