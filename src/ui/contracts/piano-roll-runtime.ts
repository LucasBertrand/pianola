import type {
  EditorCommandPort,
} from "../../application/editor-command-service";
import type {
  EditorSelectionRequests,
} from "../../application/editor-selection-requests";
import type {
  VoiceId,
} from "../../domain/model";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  ViewportState,
} from "../../geometry/converter";
import type {
  Rect,
} from "../../geometry/rect";
import type {
  SpatialIndex,
} from "../../geometry/spatial-index";
import type {
  PitchSnapSettings,
} from "../../music/pitch-snap";
import type {
  InteractionToolSignal,
} from "../interactions/types";
import type {
  NoteColorMode,
  VoiceRenderStyle,
} from "../rendering/note-style";
import type {
  ReadonlyRenderSignal,
} from "../rendering/render-signal";

/**
 * Stable services and high-frequency signals required by the piano-roll UI.
 * The editor runtime satisfies this port structurally, while components remain
 * independent from its concrete composition and from demo project fixtures.
 */
export interface PianoRollRuntimePort {
  readonly projectStore: ProjectStorePort;
  readonly editorCommands: EditorCommandPort;
  readonly selectionRequests: EditorSelectionRequests;
  readonly spatialIndex: SpatialIndex;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly visibleRegion: ReadonlyRenderSignal<Rect>;
  readonly voiceStyles: ReadonlyRenderSignal<
    Readonly<Record<VoiceId, VoiceRenderStyle>>
  >;
  readonly noteColorMode: ReadonlyRenderSignal<NoteColorMode>;
  readonly highlightedPitch: ReadonlyRenderSignal<number | null>;
  readonly interactionToolState: InteractionToolSignal;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
}
