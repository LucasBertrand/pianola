# Piano Lab

High-performance browser piano roll prototype built with React, TypeScript, and Canvas 2D.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Open on a tablet

The development server listens on every local interface at port `5173`.

1. Run `npm run dev`.
2. Read the computer IPv4 address with `ipconfig`.
3. Open `http://<computer-ip>:5173` on a tablet connected to the same phone hotspot.

If Windows Firewall blocks the Public tethering network, run this command once from an Administrator PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Piano Roll Vite 5173" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Public -RemoteAddress LocalSubnet
```

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
- lasso selection, persistent selection highlights, and grid snapping;
- multi-note resizing from either edge;
- persistent Select, Draw, and Erase tools with an optional one-shot mode;
- two-finger pinch zoom and pan with musical anchor preservation;
- touch envelopes, mouse double-click, touch double-tap, and long-press events;
- DOM playhead, drag/resize ghosts, and lasso overlay.

The transport, audio engine, toolbar modes, voice controls, and inspector parameters remain visual placeholders until their dedicated phases are implemented.
