/**
 * App state machine.
 * States: MAIN_IDLE | MAIN_TRANSITION_OUT(sectionId) | SECTION_ENTER | SECTION_IDLE | SECTION_FLIP_ACTIVE(progress) | SECTION_EXIT
 * See .cursor/rules/state-and-routing.mdc
 */

export type AppState =
  | { phase: 'MAIN_IDLE' }
  | { phase: 'MAIN_TRANSITION_OUT'; sectionId: string }
  | { phase: 'SECTION_ENTER' }
  | { phase: 'SECTION_IDLE' }
  | { phase: 'SECTION_FLIP_ACTIVE'; progress: number }
  | { phase: 'SECTION_EXIT' }

export const initialState: AppState = { phase: 'MAIN_IDLE' }

// Transition helpers to be wired to UI and router (outline)
// - selectSection(sectionId) -> MAIN_TRANSITION_OUT
// - onRouteSection() -> SECTION_ENTER -> SECTION_IDLE
// - setFlipProgress(progress) -> SECTION_FLIP_ACTIVE
// - exitSection() -> SECTION_EXIT -> MAIN_IDLE
