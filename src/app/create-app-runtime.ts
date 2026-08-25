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
import {
  ActiveClipPlayheadTickSignal,
} from "../editor/model/playhead-position";
import type {
  ClipEditorRuntimeState,
  EditorRuntime,
} from "../editor/runtime/editor-runtime";
import type {
  ProjectRepository,
} from "../persistence/project-persistence-model";
import type {
  UserSettingsRepository,
} from "../persistence/user-settings-model";
import {
  IndexedDbProjectRepository,
} from "../pwa/persistence/indexed-db-project-repository";
import {
  IndexedDbUserSettingsRepository,
} from "../pwa/persistence/indexed-db-user-settings-repository";
import {
  PianolaIndexedDb,
} from "../pwa/persistence/pianola-indexed-db";
import {
  WorkerStoredProjectCodec,
} from "../pwa/persistence/worker-stored-project-codec";

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
        viewport: viewport.get(),
        pitchSnapSettings: pitchSnapSettings.get(),
        gridSettings: gridSettings.get(),
      });
      const restored = clipEditorStates.get(state.workspace.activeClipId)
        ?? createDefaultClipEditorRuntimeState();

      viewport.set(restored.viewport);
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
        viewport: viewport.get(),
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
          viewport: viewport.get(),
          pitchSnapSettings: pitchSnapSettings.get(),
          gridSettings: gridSettings.get(),
        });
      }

      const sourceState = clipEditorStates.get(sourceClipId)
        ?? createDefaultClipEditorRuntimeState();

      clipEditorStates.set(targetClipId, {
        viewport: { ...sourceState.viewport },
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
        VIEWPORT_CONSTANTS.highestDisplayedMidiPitch
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
