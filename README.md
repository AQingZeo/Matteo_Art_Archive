# New Human Hack

An interactive web experience built around an alphabet map. You can explore with a **mouse** (pan, zoom, double-click sections) or with your **webcam**—hand gestures move a virtual cursor, pan the map, and select letters; optional head tracking can adjust zoom. It was made for an art installation about interaction beyond keyboard and mouse.

**Note:** Hand and face features need a **desktop or tablet browser** with camera access. They are not intended for small phone screens.

---

## Run it locally

You need **[Node.js](https://nodejs.org/)** (LTS is fine; includes `npm`).

1. **Install dependencies** (once, from the project folder):

   ```bash
   npm install
   ```

2. **Start the dev server**:

   ```bash
   npm run dev
   ```

3. Open the URL Vite prints (usually **http://localhost:5173**). Allow **camera** when the browser asks if you want gesture navigation.

Other useful commands:

| Command | What it does |
|--------|----------------|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build locally to test |

---

## Using the site

- **Landing:** Click or tap the highlighted area to enter the map (with a short transition).
- **Map:** Drag to pan, scroll to zoom. **Double-click** a letter region to zoom into that section.
- **Gestures** (camera on): Use the on-screen hints in the corner—e.g. fist/grasp to drag-pan, double pinch to “click” a section, open-hand movement for reset. Use the **sound** and **camera** buttons in the corner if you want to mute music or turn the camera off and use mouse only.

---

## Project overview (for developers)

- **Stack:** React, TypeScript, Vite, React Router, MediaPipe (hands + face), canvas effects for transitions and page-flip.
- **Entry:** `src/main.tsx` → `App.tsx` routes through `AppLayout` to the map (`src/pages/MainMapPage.tsx`, `src/components/MapCanvas.tsx`).

For a detailed breakdown of gestures, file layout, and routes, see the git history or inline code comments in `src/`.
