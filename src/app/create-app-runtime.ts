import {
  EditorCommandService,
} from "../use-cases/commands/editor-command-service";
import {
  EditorSelectionRequests,
} from "../editor/selection/editor-selection-requests";
import {
  EDITOR_CONSTANTS,
  VIEWPORT_CONSTANTS,
} from "../config/editor-config";
import {
  getActiveClip,
  type ProjectState,
} from "../domain/project/project-document";
import {
  getClipDurationTicks,
} from "../domain/clips/clip";
import {
  type ClipId,
  type InstrumentId,
} from "../domain/identifiers";
import {
  type Note,
} from "../domain/notes/note";
import {
  ProjectStore,
} from "../domain/project-store";
import {
  EditorSelection,
} from "../editor/selection/editor-selection";
import type {
  ViewportState,
} from "../editor/geometry/converter";
import {
  SpatialIndex,
} from "../editor/geometry/spatial-index";
import {
  calculateVisibleRegion,
} from "../editor/geometry/visible-region";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
} from "../music/pitch-snap";
import {
  DEFAULT_GRID_SETTINGS,
  type GridSettings,
} from "../editor/model/grid-settings";
import type {
  InstrumentRenderStyle,
} from "../editor/model/instrument-render-style";
import type {
  NoteColorMode,
} from "../editor/model/note-color-mode";
import {
  MappedRenderSignal,
  MutableRenderSignal,
} from "../editor/model/render-signal";
import type {
  ClipEditorRuntimeState,
  EditorRuntime,
} from "../editor/runtime/editor-runtime";

/** Creates the runtime for one project. A future tab system can own one per tab. */
export function createEditorRuntime(
  initialProjectState: ProjectState,
): EditorRuntime {
  const viewportState = createInitialViewportState();
  const spatialIndex = new SpatialIndex();
  const projectStore = new ProjectStore(initialProjectState);
  const selection = new EditorSelection();
  const indexedNotesBuffer: Note[] = [];
  const editorCommands = new EditorCommandService(projectStore, selection);
  const activeClip = getActiveClip(initialProjectState);

  rebuildSpatialIndex(
    initialProjectState,
    spatialIndex,
    indexedNotesBuffer,
  );

  const instrumentStyles = new MutableRenderSignal(
    createInstrumentRenderStyles(initialProjectState),
  );

  const viewport = new MutableRenderSignal(viewportState);
  const playheadTick = new MutableRenderSignal(
    activeClip.transportSettings.anchorTick,
  );
  const pitchSnapSettings = new MutableRenderSignal(
    DEFAULT_PITCH_SNAP_SETTINGS,
  );
  const gridSettings = new MutableRenderSignal<GridSettings>(
    DEFAULT_GRID_SETTINGS,
  );
  const clipEditorStates = new Map<ClipId, ClipEditorRuntimeState>();

  projectStore.subscribe((state, previousState) => {
    const nextClip = getActiveClip(state);
    const previousClip = getActiveClip(previousState);

    if (state.workspace.activeClipId !== previousState.workspace.activeClipId) {
      clipEditorStates.set(previousState.workspace.activeClipId, {
        playheadTick: playheadTick.get(),
        viewport: viewport.get(),
        pitchSnapSettings: pitchSnapSettings.get(),
        gridSettings: gridSettings.get(),
      });
      const restored = clipEditorStates.get(state.workspace.activeClipId)
        ?? createDefaultClipEditorRuntimeState(nextClip);

      playheadTick.set(restored.playheadTick);
      viewport.set(restored.viewport);
      pitchSnapSettings.set(restored.pitchSnapSettings);
      gridSettings.set(restored.gridSettings);
    }

    if (
      nextClip.tracksByInstrumentId !== previousClip.tracksByInstrumentId
      || state.workspace.activeClipId !== previousState.workspace.activeClipId
    ) {
      rebuildSpatialIndex(state, spatialIndex, indexedNotesBuffer);
    }

    if (
      state.projectInstrumentsById !== previousState.projectInstrumentsById
      || nextClip.instrumentStatesById !== previousClip.instrumentStatesById
      || state.workspace.activeClipId !== previousState.workspace.activeClipId
    ) {
      instrumentStyles.set(createInstrumentRenderStyles(state));
    }
  });

  const runtime: EditorRuntime = {
    projectStore,
    editorCommands,
    selection,
    selectionRequests: new EditorSelectionRequests(),
    spatialIndex,
    viewport,
    visibleRegion: new MutableRenderSignal(
      calculateVisibleRegion(
        viewportState,
        VIEWPORT_CONSTANTS.initialWidthCssPixels,
        VIEWPORT_CONSTANTS.initialHeightCssPixels,
        getClipDurationTicks(activeClip),
      ),
    ),
    instrumentStyles,
    noteColorMode: new MutableRenderSignal<NoteColorMode>(
      EDITOR_CONSTANTS.defaultNoteColorMode,
    ),
    playheadTick,
    highlightedPitch: new MutableRenderSignal<number | null>(null),
    pitchSnapSettings,
    gridSettings,
    gridResolutionTicks: new MappedRenderSignal(
      gridSettings,
      (settings) => settings.resolutionTicks,
    ),
    captureClipEditorStates(): Readonly<Record<ClipId, ClipEditorRuntimeState>> {
      const state = projectStore.getState();

      clipEditorStates.set(state.workspace.activeClipId, {
        playheadTick: playheadTick.get(),
        viewport: viewport.get(),
        pitchSnapSettings: pitchSnapSettings.get(),
        gridSettings: gridSettings.get(),
      });

      const result: Record<ClipId, ClipEditorRuntimeState> = {};

      for (const clipId of state.clipOrder) {
        const clip = state.clipsById[clipId];

        if (clip !== undefined) {
          result[clipId] = clipEditorStates.get(clipId)
            ?? createDefaultClipEditorRuntimeState(clip);
        }
      }

      return result;
    },
    restoreClipEditorStates(
      states: Readonly<Record<ClipId, ClipEditorRuntimeState>>,
    ): void {
      clipEditorStates.clear();

      for (const [clipId, clipState] of Object.entries(states)) {
        clipEditorStates.set(clipId, clipState);
      }

      const currentState = projectStore.getState();
      const currentClip = getActiveClip(currentState);
      const restored = clipEditorStates.get(currentState.workspace.activeClipId)
        ?? createDefaultClipEditorRuntimeState(currentClip);

      playheadTick.set(restored.playheadTick);
      viewport.set(restored.viewport);
      pitchSnapSettings.set(restored.pitchSnapSettings);
      gridSettings.set(restored.gridSettings);
    },
    duplicateClipEditorState(
      sourceClipId: ClipId,
      targetClipId: ClipId,
    ): void {
      const state = projectStore.getState();
      const sourceClip = state.clipsById[sourceClipId];

      if (sourceClip === undefined) {
        return;
      }

      if (sourceClipId === state.workspace.activeClipId) {
        clipEditorStates.set(sourceClipId, {
          playheadTick: playheadTick.get(),
          viewport: viewport.get(),
          pitchSnapSettings: pitchSnapSettings.get(),
          gridSettings: gridSettings.get(),
        });
      }

      const sourceState = clipEditorStates.get(sourceClipId)
        ?? createDefaultClipEditorRuntimeState(sourceClip);

      clipEditorStates.set(targetClipId, {
        playheadTick: sourceState.playheadTick,
        viewport: { ...sourceState.viewport },
        pitchSnapSettings: { ...sourceState.pitchSnapSettings },
        gridSettings: { ...sourceState.gridSettings },
      });
    },
  };

  return runtime;
}

function createDefaultClipEditorRuntimeState(
  clip: ReturnType<typeof getActiveClip>,
): ClipEditorRuntimeState {
  return {
    playheadTick: clip.transportSettings.anchorTick,
    viewport: createInitialViewportState(),
    pitchSnapSettings: DEFAULT_PITCH_SNAP_SETTINGS,
    gridSettings: DEFAULT_GRID_SETTINGS,
  };
}

function createInitialViewportState(): ViewportState {
  return {
    zoomX: VIEWPORT_CONSTANTS.initialHorizontalZoom,
    zoomY: VIEWPORT_CONSTANTS.initialVerticalZoom,
    scrollX: 0,
    scrollY:
      (
        VIEWPORT_CONSTANTS.maximumMidiPitch
        - VIEWPORT_CONSTANTS.initialMaximumVisiblePitch
      ) * VIEWPORT_CONSTANTS.initialPitchHeightCssPixels,
    pitchHeight: VIEWPORT_CONSTANTS.initialPitchHeightCssPixels,
    ticksPerPixel: VIEWPORT_CONSTANTS.initialTicksPerPixel,
    devicePixelRatio: VIEWPORT_CONSTANTS.initialDevicePixelRatio,
  };
}

function createInstrumentRenderStyles(
  state: ProjectState,
): Readonly<Record<InstrumentId, InstrumentRenderStyle>> {
  const styles: Record<InstrumentId, InstrumentRenderStyle> = {};
  const activeClip = getActiveClip(state);

  const hasSolo = state.instrumentOrder.some(
    (id) => state.projectInstrumentsById[id]?.solo
  );

  for (const instrumentId of state.instrumentOrder) {
    const instrument = state.projectInstrumentsById[instrumentId];
    const instrumentState = activeClip.instrumentStatesById[instrumentId];

    if (instrument !== undefined && instrumentState !== undefined) {
      const isMuted = instrument.muted || (hasSolo && !instrument.solo);
      
      styles[instrumentId] = {
        fillStyle: instrument.color,
        opacity: isMuted ? 0.16 : 1,
        locked: instrumentState.locked,
      };
    }
  }

  return styles;
}

function rebuildSpatialIndex(
  state: ProjectState,
  spatialIndex: SpatialIndex,
  target: Note[],
): void {
  target.length = 0;
  const activeClip = getActiveClip(state);

  for (const instrumentId of state.instrumentOrder) {
    const track = activeClip.tracksByInstrumentId[instrumentId];

    if (track === undefined) {
      continue;
    }

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];

      if (note !== undefined) {
        target.push(note);
      }
    }
  }

  spatialIndex.update(target);
}
