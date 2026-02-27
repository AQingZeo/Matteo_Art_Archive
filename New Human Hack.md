# New Human Hack

# 1. High-Level Concept

The website presents Matteo’s full drawing as a navigable map.

Users can zoom, explore, and select irregular sections.

Each section becomes an independent interaction page with:

- A flip interaction (reveals 3D if available)

The experience must feel poetic, not productized.

---

# 2. Architecture Overview

## Routing Model

Single Page Application (SPA)

Routes:

- `/` → Main drawing (overview + zoom + selection)
- `/section/:id` → Section interaction page (flip + Matteo margin)

No full page reloads.

---

# 3. Assets Strategy

## Master Asset

- One high-resolution master drawing image
- Used only on main page and during transition

## Section Assets

For each section:

- Cropped PNG (bounding box of irregular section)
- Optional alpha mask for irregular shape
- Optional 3D model asset
- Metadata file

---

# 4. Data Model

Each section must contain:

```
id: string
rect: { x, y, width, height }  // in master pixel coordinates
cropSrc: string                // cropped image asset
cropOrigin: { x0, y0 }         // position in master pixel space
has3D: boolean
modelSrc?: string
matteo_line: string
echo_pool: string[]
rare_replies: string[]
```

---

# 5. User Interaction Flow

---

## 5.1 Main Page `/`

### State: MAIN_IDLE

Displays:

- Full master drawing
- Pan & zoom enabled
- Section hotspots active

### Interactions

Desktop:

- Drag → pan
- scroll → zoom
- Click on section → select

Camera (MediaPipe):

- Pinch → zoom
- Pinch-tap (hold) → select

---

## 5.2 Section Selection Transition

### Trigger

User clicks or gesture-selects a section.

### Step 1: Auto Frame

- Smooth auto zoom + pan
- Selected section fills viewport
- Other areas dim via overlay mask
- Duration: 300–500ms

### Step 2: Route Change

Navigate to `/section/:id`

WITHOUT reloading document.

### Step 3: Seamless Swap

- Render master-based view
- Load cropped section asset
- Crossfade to cropped layer
- Remove master-based layer

No visible jump allowed.

---

# 6. Section Page `/section/:id`

## 6.1 Layout Layers

Layer stack:

1. Background
2. 3D Canvas (if exists)
3. Flip Surface (cropped section image)
4. Matteo’s text bubbles layer

---

# 7. Flip Interaction

## 7.1 Behavior

Trigger:

- Mouse drag from bottom-right corner
- Gesture equivalent drag

### If has3D = true

- Flip completes past threshold
- 3D canvas revealed underneath
- Section remains peeled

### If has3D = false

- Flip allowed up to maxProgress (e.g., 20%)
- Spring animation snaps corner back
- Subtle feedback (paper resistance feel)

---

# 8. Matteo text bubble (optional)

## Design Intent

DO NOT implement this before everything else is done

Feels like bubble notes floating

## Default Behavior

When entering section:

- Show `matteo_line`

## When User Types (text input bar)

- Transparent input field
- Press Enter to send

Response logic:

- 70%: no response
- 25%: echo (repeat word + phrase from pool)
- 5%: rare reply

Replies:

- 1–8 words max
- Simple English
- Occasional repetition
- Quiet tone

No buttons.

No system prompts visible.

---

# 9. Performance Requirements

- Cropped section assets lazy-loaded
- Preload crop on hover (desktop) or on selection
- 3D loaded only if flipped past threshold
- Maintain 60fps interaction target

---

# 10. Animation Timing

| Interaction | Duration |
| --- | --- |
| Zoom to section | 300–500ms |
| Fade non-selected areas | 250ms |
| Crop crossfade swap | 150–250ms |
| Flip snap-back | spring (200–300ms) |

---

# 11. State Machine

MAIN_IDLE

→ MAIN_TRANSITION_OUT(sectionId)

→ SECTION_ENTER

→ SECTION_IDLE

→ SECTION_FLIP_ACTIVE(progress)

→ SECTION_IDLE

→ SECTION_EXIT

→ MAIN_IDLE

---

# 12. Technical Stack

Frontend:

- React + Vite or Svelte
- CSS transform-based zoom system
- React Router (or similar)

Gesture:

- MediaPipe Hands (pinch detection)
- Optional smoothing + thresholding

3D:

- Three.js or similar lightweight WebGL

---

# 13. Visual Style Rules

- No UI-looking buttons
- Minimal interface
- Subtle shadows and paper textures
- Text appears handwritten or quiet
- Avoid “product app” feeling

---

---

# Build Order

Build next when the previous is cleared and good to go

1. Master image pan/zoom (mouse and media pipe gesture)
2. Section selection + auto framing
3. Route + crop swap
4. Flip surface interaction
5. Matteo text bubble
6. 3D integration (for selected sections)