# Rendering Pipeline

> **État courant.** Ce guide décrit la zone présente dans le worktree. Pour une
> tâche de migration, commencer par
> [`../../../../docs/migration/README.md`](../../../../docs/migration/README.md)
> et vérifier `STATUS.md` avant d'utiliser un propriétaire cible.

React owns only the stable layer tree and lifecycle subscriptions. It never owns note rectangles, playhead positions, lasso geometry, or animation-frame state.

## Invalidation model

- `GridCanvas` runs in on-demand mode. Viewport, visible-region, grid-resolution, resize, and DPR changes invalidate it.
- `NotesCanvas` also runs in on-demand mode. Project, viewport, style, editing-mask, resize, and DPR changes invalidate it.
- `InteractionOverlay` writes playhead and lasso styles directly from signal subscriptions.
- `MutableRenderSignal.invalidate()` supports externally mutated controllers without requiring a React render.

## Rendering ports

`canvas-layer.tsx` is the React/store adapter. It samples the render signals,
updates the coordinate converter and queries `SpatialIndex` before invoking the
painters.

The grid, note and ruler painters accept explicit snapshot objects. They do not
read React state or the global project store, and they do not own interaction,
selection, snapping, collision or hit-testing decisions. The note snapshot is a
pre-culled projection; the editing mask only prevents the stable projection
from being drawn underneath its DOM draft.

The label-width and locked-note-pattern caches are isolated in their own
modules. DOM overlays remain responsible for focus, menus, playhead, lasso and
other accessible interaction feedback.

## Pixel spaces

`useCanvasRenderer` scales the visible context by `devicePixelRatio`, capped at 2 for precise pointers and 1.5 for coarse pointers to bound mobile GPU fill cost. Render functions therefore use the converter CSS-pixel methods. The converter device-pixel methods remain available for direct backing-store operations.

## Grid cache

The grid is painted directly into its visible canvas after an explicit invalidation. Avoiding an intermediate bitmap keeps the path compatible with mobile GPU implementations and removes the additional HiDPI-sized surface.

## Notes culling and batching

`NotesCanvas` supplies one persistent result buffer to `SpatialIndex.queryRect`. Only intersecting notes enter the drawing loop. The buffer is sorted in place by instrument so that `fillStyle` changes once per contiguous instrument group. Locked notes receive a second, allocation-free pass using a cached diagonal `CanvasPattern`.

No `map`, `filter`, spread, array construction, or per-note object construction occurs inside the animation-frame drawing loop.

## Optional note double buffering

The visible canvas already presents drawing performed within one animation frame. If profiling reveals tearing or a costly multi-pass renderer, add a persistent note surface beside the grid cache:

1. resize the note surface only when the visible backing size changes;
2. draw culled notes into its context;
3. copy the completed surface with one `drawImage`;
4. reuse the same surface and result buffer on every frame.

The double buffer must remain owned by the renderer and must never enter React state.
