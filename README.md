# Piano Roll

A touch-first browser piano roll built with React, strict TypeScript, and
Canvas 2D.

React owns application layout and low-frequency controls. Notes, the grid,
selection previews, and high-frequency gestures use Canvas, render signals,
mutable drafts, and direct DOM transforms to avoid React updates in hot
paths.

## Requirements

- Node.js 20 or newer
- npm
- A modern browser with Pointer Events and Canvas 2D support

## Development

```bash
npm install
npm run dev
```

The development server listens on every local interface at port `5173`.

To open the application on a tablet connected to the same network:

1. Start the development server.
2. Find the computer IPv4 address with `ipconfig`.
3. Open `http://<computer-ip>:5173` on the tablet.

If Windows Firewall blocks a public tethering network, run this command once
from an Administrator PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Piano Roll Vite 5173" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Public -RemoteAddress LocalSubnet
```

## Verification

```bash
npm run typecheck
npm run build
```

The build performs strict TypeScript checks for the domain, geometry,
persistence, application, and UI before creating the Vite production bundle.

## Current capabilities

- immutable, voice-oriented project model;
- atomic command transactions with bounded snapshot-based Undo/Redo;
- native versioned `.pianoroll` save and load format;
- two default voices, editable names and colors, mute and lock controls;
- voice ordering, note selection by voice, and selection transfer;
- 16-measure initial project with insertion and removal at any measure;
- interactive ruler, snapped playhead, and adjustable loop region;
- straight, triplet, and dotted grid subdivisions;
- horizontal and vertical scrolling and zooming;
- pitch-based or voice-based note colors;
- 128-bucket spatial index with binary-search-assisted hit-testing;
- HiDPI multilayer Canvas rendering with viewport culling;
- touch-first selection, lasso, dragging, and multi-note resizing;
- long-press note drawing and double-click or double-tap deletion;
- two-finger pan and pinch zoom;
- copy, cut, paste, delete, Undo, Redo, New, Save, and Load tools;
- custom in-application confirmation and error dialogs that preserve
  fullscreen mode;
- responsive landscape and portrait inspector layouts.

The initial scene contains 100 deterministic notes. Spatial queries and
Canvas culling remain designed for substantially larger projects, but
performance limits should be established with executable benchmarks rather
than a fixed marketing number.

## Interaction model

- Tap a note to select it.
- Tap an empty area to clear the selection or begin a lasso.
- Drag a selected note to move the current selection.
- Drag a visible selection handle to resize selected notes.
- Long-press an empty grid cell and drag to draw a note.
- Double-click or double-tap a note to delete it.
- Tap a piano key to add or remove all editable notes of that pitch from the
  current selection.
- Use two fingers over the piano roll to pan and zoom without changing the
  project state during the gesture.

All note edits are previewed through mutable interaction drafts. A gesture
dispatches at most one domain transaction when it is committed.

## Project structure

```text
src/
  app/          Application composition and the deterministic initial scene
  audio/        Contracts reserved for the future audio engine
  domain/       Immutable model, validation, commands, reducer, and store
  geometry/     Coordinate conversion and the spatial note index
  persistence/  Native project file parsing, migration, and serialization
  ui/           Canvas layers, interaction hooks, overlays, and render signals
```

The current application manages one project at a time. The native document
metadata and replaceable project store keep the file workflow compatible with
a future tabbed multi-project interface.

## Audio status

No Web Audio graph, scheduler, or playback engine is implemented yet. The
audio contracts are intentionally retained as a boundary for the dedicated
audio and lookahead phase.
