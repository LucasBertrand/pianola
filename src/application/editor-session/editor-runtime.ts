import type {
  EditorCommandPort,
} from "../history/editor-command-service";
import type {
  EditorSelectionRequests,
} from "../../editor-core/selection/editor-selection-requests";
import {
  type ClipId,
  type InstrumentId,
} from "../../domain/identifiers";
import type {
  ProjectStorePort,
} from "../history/project-store";
import type {
  ViewportState,
} from "../../editor-core/geometry/converter";
import type {
  Rect,
} from "../../editor-core/geometry/rect";
import type {
  SpatialIndex,
} from "../../editor-core/geometry/spatial-index";
import type {
  PitchSnapSettings,
} from "../../domain/music-theory/pitch-snap";
import type {
  GridSettings,
} from "../../editor-core/model/grid-settings";
import type {
  InstrumentRenderStyle,
} from "../../editor-core/model/instrument-render-style";
import type {
  NoteColorMode,
} from "../../editor-core/model/note-color-mode";
import type {
  MutableRenderSignal,
  ReadonlyRenderSignal,
} from "../../editor-core/model/render-signal";
import type {
  EditorSelection,
} from "../../editor-core/selection/editor-selection";
import type {
  PlayheadPosition,
} from "../../editor-core/model/playhead-position";

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
