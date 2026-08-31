import type {
  EditorCommandPort,
} from "../../application/history/editor-command-service";
import type {
  EditorSelectionRequests,
} from "../../editor-core/selection/editor-selection-requests";
import type {
  EditorSelection,
} from "../../editor-core/selection/editor-selection";
import {
  type InstrumentId,
} from "../../domain/identifiers";
import type {
  ProjectStorePort,
} from "../../application/history/project-store";
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
  InstrumentRenderStyle,
} from "../../editor-core/model/instrument-render-style";
import type {
  NoteColorMode,
} from "../../editor-core/model/note-color-mode";
import type {
  NoteLabelMode,
} from "../../editor-core/model/note-label-mode";
import type {
  MutableRenderSignal,
  ReadonlyRenderSignal,
} from "../../editor-core/model/render-signal";
import type {
  TimeMapMarkerPreviewSession,
} from "../../application/editor-session/time-map-marker-preview-session";
import type {
  LoopPreviewSession,
} from "../../application/editor-session/loop-preview-session";

/**
 * Stable services and high-frequency signals required by the piano-roll UI.
 * The editor runtime satisfies this port structurally, while components remain
 * independent from its concrete application composition.
 */
export interface PianoRollRuntimePort {
  readonly projectStore: ProjectStorePort;
  readonly editorCommands: EditorCommandPort;
  readonly selection: EditorSelection;
  readonly selectionRequests: EditorSelectionRequests;
  readonly spatialIndex: SpatialIndex;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly visibleRegion: ReadonlyRenderSignal<Rect>;
  readonly instrumentStyles: ReadonlyRenderSignal<
    Readonly<Record<InstrumentId, InstrumentRenderStyle>>
  >;
  readonly noteColorMode: ReadonlyRenderSignal<NoteColorMode>;
  readonly noteLabelMode: ReadonlyRenderSignal<NoteLabelMode>;
  readonly highlightedPitch: MutableRenderSignal<number | null>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly timeMapMarkerPreview: TimeMapMarkerPreviewSession;
  readonly loopPreview: LoopPreviewSession;
}
