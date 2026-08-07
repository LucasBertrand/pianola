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
  getProjectDurationTicks,
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

  rebuildSpatialIndex(
    initialProjectState,
    spatialIndex,
    indexedNotesBuffer,
  );

  const voiceStyles = new MutableRenderSignal(
    createVoiceRenderStyles(initialProjectState),
  );

  projectStore.subscribe((state, previousState) => {
    if (state.tracksByVoiceId !== previousState.tracksByVoiceId) {
      rebuildSpatialIndex(state, spatialIndex, indexedNotesBuffer);
    }

    if (state.voicesById !== previousState.voicesById) {
      voiceStyles.set(createVoiceRenderStyles(state));
    }
  });

  const gridSettings = new MutableRenderSignal<GridSettings>(
    DEFAULT_GRID_SETTINGS,
  );

  return {
    projectStore,
    editorCommands,
    selectionRequests: new EditorSelectionRequests(),
    spatialIndex,
    viewport: new MutableRenderSignal(viewportState),
    visibleRegion: new MutableRenderSignal(
      calculateVisibleRegion(
        viewportState,
        VIEWPORT_CONSTANTS.initialWidthCssPixels,
        VIEWPORT_CONSTANTS.initialHeightCssPixels,
        getProjectDurationTicks(initialProjectState),
      ),
    ),
    voiceStyles,
    noteColorMode: new MutableRenderSignal<NoteColorMode>(
      EDITOR_CONSTANTS.defaultNoteColorMode,
    ),
    playheadTick: new MutableRenderSignal(
      initialProjectState.transportSettings.ppqn
      * 4
      * initialProjectState.transportSettings.timeSignature.numerator
      / initialProjectState.transportSettings.timeSignature.denominator,
    ),
    highlightedPitch: new MutableRenderSignal<number | null>(null),
    pitchSnapSettings: new MutableRenderSignal(
      DEFAULT_PITCH_SNAP_SETTINGS,
    ),
    gridSettings,
    gridResolutionTicks: new MappedRenderSignal(
      gridSettings,
      (settings) => settings.resolutionTicks,
    ),
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

  for (const voiceId of state.voiceOrder) {
    const track = state.tracksByVoiceId[voiceId];

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
