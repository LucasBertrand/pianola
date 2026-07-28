# Piano Lab

High-performance browser piano roll prototype built with React, TypeScript, and Canvas 2D.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Production build

```bash
npm run build
npm run preview
```

## Current prototype

- immutable voice-oriented domain model;
- transactional command reducer and Undo/Redo contracts;
- coordinate conversion and a 128-bucket spatial index;
- HiDPI multilayer Canvas rendering;
- deterministic dataset containing 10,000 indexed notes;
- signal-driven horizontal and vertical viewport controls;
- native pointer capture with draft-based note dragging;
- lasso selection, grid snapping, keyboard deletion, and note creation;
- DOM playhead, drag ghosts, and lasso overlay.

The transport, audio engine, toolbar modes, voice controls, and inspector parameters remain visual placeholders until their dedicated phases are implemented.
