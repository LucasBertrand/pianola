import type {
  EditorCommandPort,
} from "../../use-cases/commands/editor-command-service";
import type {
  EditorSelectionRequests,
} from "../../editor/selection/editor-selection-requests";
import {
  type InstrumentId,
} from "../../domain/identifiers";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  ViewportState,
} from "../../editor/geometry/converter";
import type {
  Rect,
} from "../../editor/geometry/rect";
import type {
  SpatialIndex,
} from "../../editor/geometry/spatial-index";
import type {
  PitchSnapSettings,
} from "../../music/pitch-snap";
import type {
  InstrumentRenderStyle,
} from "../../editor/model/instrument-render-style";
import type {
  NoteColorMode,
} from "../../editor/model/note-color-mode";
import type {
  MutableRenderSignal,
  ReadonlyRenderSignal,
} from "../../editor/model/render-signal";

/**
 * Stable services and high-frequency signals required by the piano-roll UI.
 * The editor runtime satisfies this port structurally, while components remain
 * independent from its concrete application composition.
 */
export interface PianoRollRuntimePort {
  readonly projectStore: ProjectStorePort;
  readonly editorCommands: EditorCommandPort;
  readonly selectionRequests: EditorSelectionRequests;
  readonly spatialIndex: SpatialIndex;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly visibleRegion: ReadonlyRenderSignal<Rect>;
  readonly instrumentStyles: ReadonlyRenderSignal<
    Readonly<Record<InstrumentId, InstrumentRenderStyle>>
  >;
  readonly noteColorMode: ReadonlyRenderSignal<NoteColorMode>;
  readonly highlightedPitch: MutableRenderSignal<number | null>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
}
