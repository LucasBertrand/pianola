import type {
  EditorCommandPort,
} from "../../use-cases/commands/editor-command-service";
import type {
  EditorSelectionRequests,
} from "../selection/editor-selection-requests";
import {
  type ClipId,
  type InstrumentId,
} from "../../domain/identifiers";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  ViewportState,
} from "../geometry/converter";
import type {
  Rect,
} from "../geometry/rect";
import type {
  SpatialIndex,
} from "../geometry/spatial-index";
import type {
  PitchSnapSettings,
} from "../../music/pitch-snap";
import type {
  GridSettings,
} from "../model/grid-settings";
import type {
  InstrumentRenderStyle,
} from "../model/instrument-render-style";
import type {
  NoteColorMode,
} from "../model/note-color-mode";
import type {
  MutableRenderSignal,
  ReadonlyRenderSignal,
} from "../model/render-signal";
import type {
  EditorSelection,
} from "../selection/editor-selection";
import type {
  PlayheadPosition,
} from "../model/playhead-position";

/** Long-lived services and high-frequency signals owned by one editor tab. */
export interface EditorRuntime {
  readonly projectStore: ProjectStorePort;
  readonly editorCommands: EditorCommandPort;
  readonly selection: EditorSelection;
  readonly selectionRequests: EditorSelectionRequests;
  readonly spatialIndex: SpatialIndex;
  readonly viewportWidth: MutableRenderSignal<number>;
  readonly viewportHeight: MutableRenderSignal<number>;
  readonly viewport: MutableRenderSignal<ViewportState>;
  readonly visibleRegion: MutableRenderSignal<Rect>;
  readonly instrumentStyles: MutableRenderSignal<
    Readonly<Record<InstrumentId, InstrumentRenderStyle>>
  >;
  readonly noteColorMode: MutableRenderSignal<NoteColorMode>;
  readonly playheadPosition: MutableRenderSignal<PlayheadPosition>;
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
  readonly duplicateClipEditorState: (
    sourceClipId: ClipId,
    targetClipId: ClipId,
  ) => void;
}

export interface ClipEditorRuntimeState {
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly gridSettings: GridSettings;
}
