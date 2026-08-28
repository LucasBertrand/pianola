import {
  EditorCommandService,
} from "../application/history/editor-command-service";
import {
  EditorSelectionRequests,
} from "../editor/selection/editor-selection-requests";
import {
  EDITOR_CONSTANTS,
} from "../editor/model/editor-constants";
import {
  VIEWPORT_CONSTANTS,
} from "../editor/viewport/viewport-constants";
import {
  getActiveClip,
  type EditorSessionState,
} from "../domain/project/project-document";
import {
  getClipDurationTicks,
} from "../domain/clips/clip";
import {
  getClipPlaybackOrder,
} from "../domain/clips/clip-hierarchy";
import {
  type ClipId,
  type InstrumentId,
} from "../domain/identifiers";
import {
  type Note,
} from "../domain/notes/note";
import {
  ProjectStore,
} from "../application/history/project-store";
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
  computeClipFitViewport,
} from "../editor/viewport/compute-clip-fit-viewport";
import {
  calculateVisibleRegion,
} from "../editor/geometry/visible-region";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
} from "../domain/music-theory/pitch-snap";
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
import {
  ActiveClipPlayheadTickSignal,
} from "../editor/model/playhead-position";
import type {
  ClipEditorRuntimeState,
  EditorRuntime,
} from "../application/editor-session/editor-runtime";
import type {
  ProjectRepository,
} from "../application/ports/project-repository";
import type {
  UserSettingsRepository,
} from "../application/ports/user-settings-repository";
import {
  IndexedDbProjectRepository,
} from "../infrastructure/persistence/indexed-db/indexed-db-project-repository";
import {
  IndexedDbUserSettingsRepository,
} from "../infrastructure/persistence/indexed-db/indexed-db-user-settings-repository";
import {
  PianolaIndexedDb,
} from "../infrastructure/persistence/indexed-db/pianola-indexed-db";
import {
  WorkerStoredProjectCodec,
} from "../infrastructure/persistence/worker/worker-stored-project-codec";

/** Creates the runtime for one project. A future tab system can own one per tab. */
export function createEditorRuntime(
  initialProjectState: EditorSessionState,
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

  const viewportWidth = new MutableRenderSignal(VIEWPORT_CONSTANTS.initialWidthCssPixels);
  const viewportHeight = new MutableRenderSignal(VIEWPORT_CONSTANTS.initialHeightCssPixels);
  const viewport = new MutableRenderSignal(viewportState);
  const playheadPosition = new MutableRenderSignal(
    { clipId: activeClip.id, tick: 0 },
  );
  const playheadTick = new ActiveClipPlayheadTickSignal(
    playheadPosition,
    () => projectStore.getState().workspace.activeClipId,
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
        pitchSnapSettings: pitchSnapSettings.get(),
        gridSettings: gridSettings.get(),
      });
      const restored = clipEditorStates.get(state.workspace.activeClipId)
        ?? createDefaultClipEditorRuntimeState();

      viewport.set(computeClipFitViewport(
        nextClip,
        viewportWidth.get(),
        viewportHeight.get()
      ));
      pitchSnapSettings.set(restored.pitchSnapSettings);
      gridSettings.set(restored.gridSettings);
      playheadPosition.invalidate();
    }

    const currentPlayhead = playheadPosition.get();
    const playheadClip = state.clipsById[currentPlayhead.clipId];

    if (playheadClip === undefined) {
      playheadPosition.set({
        clipId: state.workspace.activeClipId,
        tick: 0,
      });
    } else if (currentPlayhead.tick > playheadClip.timeline.durationTicks) {
      playheadPosition.set({
        clipId: currentPlayhead.clipId,
        tick: playheadClip.timeline.durationTicks,
      });
    }

    if (
      nextClip.tracksByInstrumentId !== previousClip.tracksByInstrumentId
      || state.workspace.activeClipId !== previousState.workspace.activeClipId
    ) {
      rebuildSpatialIndex(state, spatialIndex, indexedNotesBuffer);
    }

    if (
      state.projectInstrumentsById !== previousState.projectInstrumentsById
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
    viewportWidth,
    viewportHeight,
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
    playheadPosition,
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
        pitchSnapSettings: pitchSnapSettings.get(),
        gridSettings: gridSettings.get(),
      });

      const result: Record<ClipId, ClipEditorRuntimeState> = {};

      for (const clipId of getClipPlaybackOrder(state.clipHierarchy)) {
        const clip = state.clipsById[clipId];

        if (clip !== undefined) {
          result[clipId] = clipEditorStates.get(clipId)
            ?? createDefaultClipEditorRuntimeState();
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
      const restored = clipEditorStates.get(currentState.workspace.activeClipId)
        ?? createDefaultClipEditorRuntimeState();

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
          pitchSnapSettings: pitchSnapSettings.get(),
          gridSettings: gridSettings.get(),
        });
      }

      const sourceState = clipEditorStates.get(sourceClipId)
        ?? createDefaultClipEditorRuntimeState();

      clipEditorStates.set(targetClipId, {
        pitchSnapSettings: { ...sourceState.pitchSnapSettings },
        gridSettings: { ...sourceState.gridSettings },
      });
    },
  };

  return runtime;
}

export interface AppPersistenceRuntime {
  readonly projects: ProjectRepository;
  readonly userSettings: UserSettingsRepository;
  dispose(): void;
}

export function createAppPersistenceRuntime(): AppPersistenceRuntime {
  const database = new PianolaIndexedDb();
  const codec = new WorkerStoredProjectCodec();

  return {
    projects: new IndexedDbProjectRepository(database, codec),
    userSettings: new IndexedDbUserSettingsRepository(database),
    dispose() {
      codec.dispose();
      database.close();
    },
  };
}

function createDefaultClipEditorRuntimeState(): ClipEditorRuntimeState {
  return {
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
        VIEWPORT_CONSTANTS.highestDisplayedMidiPitch
        - VIEWPORT_CONSTANTS.initialMaximumVisiblePitch
      ) * VIEWPORT_CONSTANTS.initialPitchHeightCssPixels,
    pitchHeight: VIEWPORT_CONSTANTS.initialPitchHeightCssPixels,
    ticksPerPixel: VIEWPORT_CONSTANTS.initialTicksPerPixel,
    devicePixelRatio: VIEWPORT_CONSTANTS.initialDevicePixelRatio,
  };
}

function createInstrumentRenderStyles(
  state: EditorSessionState,
): Readonly<Record<InstrumentId, InstrumentRenderStyle>> {
  const styles: Record<InstrumentId, InstrumentRenderStyle> = {};
  const hasSolo = state.instrumentOrder.some(
    (id) => state.projectInstrumentsById[id]?.solo
  );

  for (const instrumentId of state.instrumentOrder) {
    const instrument = state.projectInstrumentsById[instrumentId];
    if (instrument !== undefined) {
      const isMuted = instrument.muted || (hasSolo && !instrument.solo);
      
      styles[instrumentId] = {
        fillStyle: instrument.color,
        opacity: isMuted ? 0.16 : 1,
      };
    }
  }

  return styles;
}

function rebuildSpatialIndex(
  state: EditorSessionState,
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
