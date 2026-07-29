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
- A modern browser with Pointer Events, Canvas 2D, and Web Audio support

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
npm run test:audio
npm run test:midi
npm run build
```

The build performs strict TypeScript checks for the domain, geometry,
persistence, application, and UI before creating the Vite production bundle.

## Current capabilities

- immutable, voice-oriented project model;
- atomic command transactions with bounded snapshot-based Undo/Redo;
- native versioned `.pianoroll` save and load format;
- Standard MIDI File format 0/1 import and deterministic format 1 export;
- two default voices, editable names and colors, mute, solo, and lock
  controls, and directly adjustable output levels;
- voice ordering, note selection by voice, and selection transfer;
- 16-measure initial project with insertion and removal at any measure;
- interactive ruler, snapped playhead, and adjustable loop region;
- play, pause, stop, return, seek, and loop-aware playback controls;
- one subtractive synthesizer per voice with editable waveform, ADSR, and
  1–16 voice polyphony defaulting to monophonic operation, low-pass
  filtering, gain, pan, and oldest-voice stealing;
- a header-mounted, project-persistent master output level with mute;
- a 25 ms lookahead scheduler that queues events 120 ms ahead;
- non-destructive live rescheduling that preserves already sounding notes
  when notes, voices, or the loop region are edited;
- straight, triplet, and dotted grid subdivisions;
- horizontal and vertical scrolling and zooming;
- pitch-based or voice-based note colors;
- 128-bucket spatial index with binary-search-assisted hit-testing;
- HiDPI multilayer Canvas rendering with viewport culling;
- touch-first selection, lasso, dragging, and multi-note resizing;
- long-press note drawing and double-click or double-tap deletion;
- two-finger pan and pinch zoom;
- copy, cut, paste, delete, Undo, Redo, New, Save, Load, MIDI Import,
  and MIDI Export tools;
- custom in-application confirmation and error dialogs that preserve
  fullscreen mode;
- collision resolution for move, resize, draw, paste, and voice transfer
  with cancel, merge, or slice-at-anchor strategies;
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
- Tap a piano key to audition its pitch with the selected instrument when
  the keyboard preview toggle is enabled.
- Long-press a piano key to add or remove all editable notes of that pitch
  from the current selection.
- Use two fingers over the piano roll to pan and zoom without changing the
  project state during the gesture. A horizontal finger arrangement locks
  zoom to time, a vertical arrangement locks it to pitch, and a diagonal
  arrangement scales both axes.

All note edits are previewed through mutable interaction drafts. A gesture
dispatches at most one domain transaction when it is committed.
When an edit overlaps notes on the same pitch and voice, the application can
cancel it, merge each connected overlap into one note, or keep the edited
notes while slicing existing notes at the edited start and end anchors. A
resolved collision remains one atomic Undo step.

## Project structure

```text
src/
  app/          Application composition and the deterministic initial scene
  audio/        Playback snapshots, time math, scheduler, and Web Audio engine
  config/       Central product defaults, limits, interaction feel, and tuning
  domain/       Immutable model, validation, commands, reducer, and store
  geometry/     Coordinate conversion and the spatial note index
  midi/         Bounded SMF codec plus domain import and export mapping
  persistence/  Native project file parsing, migration, and serialization
  ui/           Canvas layers, interaction hooks, overlays, and render signals
```

Product-level constants are centralized in
`src/config/program-constants.ts`, with English comments documenting each
configuration group. Binary protocol masks and other private algorithm
details intentionally remain next to the implementation that owns them.

The current application manages one project at a time. The native document
metadata and replaceable project store keep the file workflow compatible with
a future tabbed multi-project interface.

## MIDI file behavior

Import accepts Standard MIDI File format 0 and format 1 with PPQN timing.
Format 0 creates one project voice per populated MIDI channel. Format 1
creates one voice per populated track and channel pair, preserving simultaneous
notes as instrument polyphony.

The importer uses the first tempo and the first supported time signature.
Tempo is quantized to the editor's 0.1 BPM precision and constrained to
30–240 BPM; any adjustment is reported before import. Later tempo or meter
events, program changes, pitch bend, pressure, SysEx, unknown metadata, and
every Control Change event are reported and ignored. CC64 sustain is therefore
deliberately not applied to note durations.

MIDI can contain overlapping notes with the same pitch and destination voice,
while the native project model cannot. The in-application import dialog offers
two explicit resolutions only when such overlaps exist:

- **Merge** joins each connected overlap into one continuous note.
- **Slice** gives the latest Note On priority, then resumes any still-active
  underlying note after the newer note ends.

There is no track-splitting option in the dialog. Import always replaces the
single active project after confirmation. Import is bounded to 100,000 notes
and conservative event budgets to protect tablet memory. Export writes one
conductor track plus one track per project voice. It preserves a
SMF-compatible project PPQN, or converts timing to 960 PPQN when required.
Instrument patches, loop markers, voice colors, mute or solo state,
automation, CC data, effects, and synth parameters are not exported in this
first interoperable MIDI baseline.

## Audio status

Playback uses a lazily created `AudioContext`; opening the application alone
does not acquire audio resources. Each project voice owns one subtractive
instrument and a persistent output bus. Notes are scheduled with absolute Web
Audio times from an immutable playback snapshot, while the moving playhead
remains outside the undoable project state.

Live project edits cancel and rebuild only events that have not started yet.
Already sounding oscillator and envelope nodes finish naturally, which keeps
loop, note, instrument, mute, and solo edits from restarting the transport.
Master output changes are smoothed directly on the persistent audio graph and
commit a single undoable transaction at the end of each slider gesture.
Envelope sliders use an exponential response curve so low values occupy more
physical travel. Scheduled gain envelopes use smooth exponential attack,
decay, and release approaches with exact segment endpoints.

This first audio baseline deliberately bypasses effect descriptors, generative
rules, and voice interpretation. Keeping those stages outside the live graph
for now makes transport, polyphony, looping, mute, and solo behavior easier to
debug before the signal chain grows.
