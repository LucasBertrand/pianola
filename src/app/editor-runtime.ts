import {
  EditorCommandService,
} from "../application/editor-command-service";
import {
  EditorSelectionRequests,
} from "../application/editor-selection-requests";
import {
  EDITOR_CONSTANTS,
  VIEWPORT_CONSTANTS,
} from "../config/program-constants";
import {
  getActiveClipDurationTicks,
  getActiveClip,
  type ClipId,
  type Note,
  type ProjectState,
  type VoiceId,
} from "../domain/model";
import {
  ProjectStore,
} from "../domain/project-store";
import type {
  ViewportState,
} from "../geometry/converter";
import type {
  Rect,
} from "../geometry/rect";
import {
  SpatialIndex,
} from "../geometry/spatial-index";
import {
  calculateVisibleRegion,
} from "../geometry/visible-region";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
  type PitchSnapSettings,
} from "../music/pitch-snap";
import {
  DEFAULT_GRID_SETTINGS,
  type GridSettings,
} from "../ui/rendering/grid-settings";
import type {
  NoteColorMode,
  VoiceRenderStyle,
} from "../ui/rendering/note-style";
import {
  MappedRenderSignal,
  MutableRenderSignal,
  type ReadonlyRenderSignal,
} from "../ui/rendering/render-signal";

export const INITIAL_PITCH_HEIGHT =
  VIEWPORT_CONSTANTS.initialPitchHeightCssPixels;
export const INITIAL_MAX_VISIBLE_PITCH =
  VIEWPORT_CONSTANTS.initialMaximumVisiblePitch;

/** Long-lived services and high-frequency signals owned by one editor tab. */
export interface EditorRuntime {
  readonly projectStore: ProjectStore;
  readonly editorCommands: EditorCommandService;
  readonly selectionRequests: EditorSelectionRequests;
  readonly spatialIndex: SpatialIndex;
  readonly viewport: MutableRenderSignal<ViewportState>;
  readonly visibleRegion: MutableRenderSignal<Rect>;
  readonly voiceStyles: MutableRenderSignal<
    Readonly<Record<VoiceId, VoiceRenderStyle>>
  >;
  readonly noteColorMode: MutableRenderSignal<NoteColorMode>;
  readonly playheadTick: MutableRenderSignal<number>;
  readonly highlightedPitch: MutableRenderSignal<number | null>;
  readonly pitchSnapSettings: MutableRenderSignal<PitchSnapSettings>;
  readonly gridSettings: MutableRenderSignal<GridSettings>;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly captureClipEditorStates: () => Readonly<
    Record<ClipId, ClipEditorRuntimeState>
  >;
  readonly restoreClipEditorStates: (
    states: Readonly<Record<ClipId, ClipEditorRuntimeState>>,
  ) => void;
}

export interface ClipEditorRuntimeState {
  readonly playheadTick: number;
  readonly viewport: ViewportState;
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly gridSettings: GridSettings;
}

/** Creates the runtime for one project. A future tab system can own one per tab. */
export function createEditorRuntime(
  initialProjectState: ProjectState,
): EditorRuntime {
  const viewportState = createInitialViewportState();
  const spatialIndex = new SpatialIndex();
  const projectStore = new ProjectStore(initialProjectState);
  const indexedNotesBuffer: Note[] = [];
  const editorCommands = new EditorCommandService(projectStore);
  const activeClip = getActiveClip(initialProjectState);

  rebuildSpatialIndex(
    initialProjectState,
    spatialIndex,
    indexedNotesBuffer,
  );

  const voiceStyles = new MutableRenderSignal(
    createVoiceRenderStyles(initialProjectState),
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

    if (state.activeClipId !== previousState.activeClipId) {
      clipEditorStates.set(previousState.activeClipId, {
        playheadTick: playheadTick.get(),
        viewport: viewport.get(),
        pitchSnapSettings: pitchSnapSettings.get(),
        gridSettings: gridSettings.get(),
      });
      const restored = clipEditorStates.get(state.activeClipId)
        ?? createDefaultClipEditorRuntimeState(nextClip);

      playheadTick.set(restored.playheadTick);
      viewport.set(restored.viewport);
      pitchSnapSettings.set(restored.pitchSnapSettings);
      gridSettings.set(restored.gridSettings);
    }

    if (
      nextClip.tracksByVoiceId !== previousClip.tracksByVoiceId
      || state.activeClipId !== previousState.activeClipId
    ) {
      rebuildSpatialIndex(state, spatialIndex, indexedNotesBuffer);
    }

    if (state.voicesById !== previousState.voicesById) {
      voiceStyles.set(createVoiceRenderStyles(state));
    }
  });

  const runtime: EditorRuntime = {
    projectStore,
    editorCommands,
    selectionRequests: new EditorSelectionRequests(),
    spatialIndex,
    viewport,
    visibleRegion: new MutableRenderSignal(
      calculateVisibleRegion(
        viewportState,
        VIEWPORT_CONSTANTS.initialWidthCssPixels,
        VIEWPORT_CONSTANTS.initialHeightCssPixels,
        getActiveClipDurationTicks(initialProjectState),
      ),
    ),
    voiceStyles,
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

      clipEditorStates.set(state.activeClipId, {
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
      const restored = clipEditorStates.get(currentState.activeClipId)
        ?? createDefaultClipEditorRuntimeState(currentClip);

      playheadTick.set(restored.playheadTick);
      viewport.set(restored.viewport);
      pitchSnapSettings.set(restored.pitchSnapSettings);
      gridSettings.set(restored.gridSettings);
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
        - INITIAL_MAX_VISIBLE_PITCH
      ) * INITIAL_PITCH_HEIGHT,
    pitchHeight: INITIAL_PITCH_HEIGHT,
    ticksPerPixel: VIEWPORT_CONSTANTS.initialTicksPerPixel,
    devicePixelRatio: VIEWPORT_CONSTANTS.initialDevicePixelRatio,
  };
}

function createVoiceRenderStyles(
  state: ProjectState,
): Readonly<Record<VoiceId, VoiceRenderStyle>> {
  const styles: Record<VoiceId, VoiceRenderStyle> = {};

  for (const voiceId of state.voiceOrder) {
    const voice = state.voicesById[voiceId];

    if (voice !== undefined) {
      styles[voiceId] = {
        fillStyle: voice.color,
        opacity: voice.muted ? 0.16 : 1,
        locked: voice.locked,
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

  for (const voiceId of state.voiceOrder) {
    const track = activeClip.tracksByVoiceId[voiceId];

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
