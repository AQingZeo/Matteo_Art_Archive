# New Human Hack

Navigable drawing map with section selection and flip interaction. See [New Human Hack.md](./New%20Human%20Hack.md) for the full spec.

## Stack

- React 18 + Vite + TypeScript
- React Router (SPA: `/`, `/section/:id`)
- CSS transforms for pan/zoom; MediaPipe Hands for gestures; Three.js for 3D

## Build order (outline)

1. **Phase 1** – Master image pan/zoom (mouse + MediaPipe)
2. **Phase 2** – Section selection + auto framing
3. **Phase 3** – Route + crop swap
4. **Phase 4** – Flip surface interaction
5. **Phase 5** – 3D integration (sections with `has3D`)
6. (Later) Matteo text bubble

## Scripts

- `npm run dev` – dev server
- `npm run build` – production build
- `npm run preview` – preview build

## Structure

- `src/app/` – Router, root layout
- `src/pages/` – Main map, Section page
- `src/components/` – MapCanvas, SectionHotspots, FlipSurface, Section3DCanvas
- `src/hooks/` – usePanZoom, useMediaPipeGestures, useSectionTransition
- `src/state/` – State machine
- `src/lib/` – MediaPipe, Three.js, section loader
- `src/types/` – Section data model
