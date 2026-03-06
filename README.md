# New Human Hack

Interactive alphabet-map experience with hand/head gesture navigation, section selection, and page-flip animations. Built for an art installation exploring human-computer interaction beyond mouse and keyboard.

## What's been achieved

### Landing page
- Full-viewport landing screen with bottom-aligned responsive image (`landing.png`)
- Transparent hotspot button that scales with the image
- Floating decorations layer — modular sin-wave animated elements driven by a config file (`src/data/landingDecorations.ts`), ready for artist assets
- Zoom-into-hotspot transition with cross-fade: landing zooms/fades out while the main map dissolves in underneath using a procedural noise mask

### Main map — pan & zoom
- Mouse drag to pan, scroll wheel to zoom, two-finger pinch on touch
- Dynamic fit-to-viewport on load (85% contained), min-scale clamped to fit

### MediaPipe hand gestures
- Real-time hand landmark detection via `@mediapipe/tasks-vision` (`HandLandmarker`)
- **Movement-relative virtual cursor** — hand delta controls on-screen cursor; persists position when hand leaves frame; clamped to viewport
- **Grasp-to-drag** — all five fingertips close together → click-hold; hand movement pans the map
- **Double-pinch-to-select** — thumb + index/middle pinch twice in quick succession → section selection (same as mouse double-click)
- **Spread + shake reset** — all five fingers spread, then shake hand across 25% of screen width → resets zoom, pan, cursor, and head baseline to defaults
- Cursor color feedback: white (idle), yellow (grasp/drag), red (pinch), blue (spread)
- Camera preview overlay with fingertip dots and gesture indicators

### MediaPipe head-distance zoom
- `FaceLandmarker` bounding-box area as proxy for camera distance
- Lean in → zoom in, lean back → zoom out
- EMA-smoothed with deadzone, warmup period on re-detection, separate on/off toggle
- Disabled automatically on the section page

### Section selection & transition
- 30 alphabet sections defined in `src/data/sections.ts` with pixel-accurate bounding rects
- Double-click or double-pinch on a section → smooth camera animation to center/frame the section
- Procedural dissolve mask (value-noise based, expanding from center) fades out the main map over 1.8s
- Cropped section image positioned pixel-perfectly to match the zoomed view — seamless visual continuity

### Section page — flip animation
- Canvas 2D paper-curl simulation: fold line `x+y=c` sweeps from bottom-right to top-left
- Reflected content via `ctx.transform(0,-1,-1,0,c,c)` with brightness tint, shadow gradient, and fold-edge highlight
- Overflow canvas padding so the folded portion extends beyond the image bounds for realistic paper feel
- `has3D: true` → full flip allowed (snaps at 45% threshold); `has3D: false` → clamped to 15% peek with spring snap-back
- Gesture cursor and double-pinch "click" remain active on the section page (drag reserved for flip)
- "Back to map" button (clickable via mouse or double-pinch)

### Three.js (stub — next phase)
- `Section3DCanvas` component and `createSection3DScene` function ready for WebGL model loading when flip reveals 3D content

## Tech stack

| Layer | Tool |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Routing | React Router 6 (SPA) |
| Hand tracking | `@mediapipe/tasks-vision` — HandLandmarker |
| Face tracking | `@mediapipe/tasks-vision` — FaceLandmarker |
| Pan/zoom | CSS transforms via `usePanZoom` hook |
| Dissolve | Procedural value-noise mask (canvas 2D) |
| Paper flip | Canvas 2D fold-line reflection model |
| 3D (planned) | Three.js |

## Project structure

```
src/
├── app/
│   └── AppLayout.tsx          # Root layout, landing overlay, intro dissolve context
├── pages/
│   ├── LandingPage.tsx        # Landing overlay with hotspot + floating decorations
│   ├── MainMapPage.tsx        # Wraps MapCanvas
│   └── SectionPage.tsx        # Placeholder for standalone section route (3D)
├── components/
│   ├── MapCanvas.tsx          # Pan/zoom, gesture integration, section selection/transition
│   ├── FlipSurface.tsx        # Canvas 2D paper-curl flip animation
│   ├── FloatingDecorations.tsx # Renders sin-wave animated decoration items
│   └── Section3DCanvas.tsx    # Three.js stub
├── hooks/
│   ├── usePanZoom.ts          # Mouse/touch/gesture pan & zoom
│   ├── useMediaPipeGestures.ts # Hand landmark detection + gesture state machine
│   ├── useHeadZoom.ts         # Face bbox area → zoom factor
│   └── useFloatingMotion.ts   # Sin-wave position driver for decorations
├── lib/
│   ├── mediapipe.ts           # Singleton landmarker factories + geometry helpers
│   ├── dissolve.ts            # Value-noise dissolve map generator + mask renderer
│   └── threeScene.ts          # Three.js scene stub
├── data/
│   ├── sections.ts            # 30 alphabet section definitions (rect, cropSrc, has3D)
│   └── landingDecorations.ts  # Floating decoration config (add/remove without code changes)
└── types/
    └── section.ts             # Section & SectionRect interfaces
```

## Scripts

```bash
npm run dev      # Vite dev server
npm run build    # TypeScript check + production build
npm run preview  # Preview production build
```

## Routes

| Path | View |
|---|---|
| `/` | Landing overlay on top of main map |
| `/map` | Main map (after landing transition) |
| `/section/:id` | Section detail (placeholder for 3D) |
