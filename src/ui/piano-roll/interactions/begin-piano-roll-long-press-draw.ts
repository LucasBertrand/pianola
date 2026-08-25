import {
  INTERACTION_CONSTANTS,
} from "../../../config/interaction-config";
import {
  getActiveClip,
} from "../../../domain/project/project-document";
import type {
  InstrumentId,
} from "../../../domain/identifiers";
import type {
  SpatialIndex,
} from "../../../editor/geometry/spatial-index";
import {
  snapTickToMeasureCellStart,
  snapTickToMeasureGrid,
} from "../../../domain/transport/time-map";
import type {
  PianoRollInteractionSession,
} from "../../../editor/interactions/piano-roll-interaction-session";
import type {
  PointerSample,
} from "../../../editor/interactions/pointer/pointer-sample";
import {
  createTouchEnvelope,
} from "../../../editor/interactions/pointer/touch-envelope";
import type {
  InstrumentRenderStyle,
} from "../../../editor/model/instrument-render-style";
import type {
  ReadonlyRenderSignal,
} from "../../../editor/model/render-signal";
import {
  snapPitchToTonalPattern,
  type PitchSnapSettings,
} from "../../../music/pitch-snap";
import {
  resolvePitchSnapSettings,
} from "../../../use-cases/piano-roll/timeline/pitch-snap-resolution";
import type {
  EditorCommandPort,
} from "../../../use-cases/commands/editor-command-service";
import {
  compareNotesByInstrumentRenderOrder,
} from "../rendering/note-style";
import type {
  InteractionVisualController,
} from "./interaction-visual-controller";
import type {
  PianoRollSelectionController,
} from "./piano-roll-selection-controller";

export interface PianoRollLongPressDrawOptions {
  readonly event: PointerSample;
  readonly overlay: HTMLElement;
  readonly session: PianoRollInteractionSession;
  readonly spatialIndex: SpatialIndex;
  readonly selectionController: PianoRollSelectionController;
  readonly editorCommands: EditorCommandPort;
  readonly getActiveInstrumentId: () => InstrumentId;
  readonly totalTicks: number;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly instrumentStyles: ReadonlyRenderSignal<
    Readonly<Record<InstrumentId, InstrumentRenderStyle>>
  >;
  readonly visuals: InteractionVisualController | null;
}

/** Starts note drawing only when a long press targets valid empty space. */
export function beginPianoRollLongPressDraw({
  event,
  overlay,
  session,
  spatialIndex,
  selectionController,
  editorCommands,
  getActiveInstrumentId,
  totalTicks,
  gridResolutionTicks,
  pitchSnapSettings,
  instrumentStyles,
  visuals,
}: PianoRollLongPressDrawOptions): void {
  const { converter, gesture } = session;
  const bounds = overlay.getBoundingClientRect();
  const localX = event.clientX - bounds.left;
  const localY = event.clientY - bounds.top;
  const tick = converter.cssPixelXToTick(localX);
  const pitch = converter.cssPixelYToPitch(localY);
  const resolutionTicks = gridResolutionTicks.get();
  const envelope = createTouchEnvelope(
    converter,
    event.pointerType,
    INTERACTION_CONSTANTS.mouseNoteHitEnvelopeCssPixels,
    INTERACTION_CONSTANTS.touchNoteHitEnvelopeCssPixels,
  );
  const note = spatialIndex.queryPointWithEnvelope(
    tick,
    pitch,
    envelope,
    (candidate) => selectionController.isNoteEditable(candidate),
    (a, b) => compareNotesByInstrumentRenderOrder(a, b, editorCommands.getState().instrumentOrder),
  );

  if (note !== undefined) {
    return;
  }

  const activeInstrumentId = getActiveInstrumentId();
  const state = editorCommands.getState();
  const activeClip = getActiveClip(state);

  if (
    pitch < 0
    || pitch > 127
    || state.projectInstrumentsById[activeInstrumentId] === undefined
    || activeClip.tracksByInstrumentId[activeInstrumentId] === undefined
  ) {
    return;
  }

  const startTick = Math.max(
    0,
    snapTickToMeasureCellStart(
      state.clock.ppqn,
      activeClip.timeline.timeMap,
      activeClip.timeline.durationTicks,
      tick,
      resolutionTicks,
    ),
  );
  const drawPitch = snapPitchToTonalPattern(
    pitch,
    resolvePitchSnapSettings(
      activeClip.timeline.timeMap,
      pitchSnapSettings.get(),
      startTick,
    ),
    0,
  );

  if (startTick + resolutionTicks > totalTicks) {
    return;
  }

  if (!gesture.beginPointer({
    pointerId: event.pointerId,
    overlayLeft: bounds.left,
    overlayTop: bounds.top,
    localX,
    localY,
    pointerTick: tick,
    pointerPitch: pitch,
    targetNoteId: null,
    snapResolutionTicks: resolutionTicks,
    snapAbsoluteTick: (t) => snapTickToMeasureGrid(
      state.clock.ppqn,
      activeClip.timeline.timeMap,
      activeClip.timeline.durationTicks,
      t,
      resolutionTicks,
    ),
    getSnapSettingsAtTick: (t) => resolvePitchSnapSettings(
      activeClip.timeline.timeMap,
      pitchSnapSettings.get(),
      t,
    ),
    selectionMode: "replace",
  })) {
    return;
  }

  gesture.beginDrawing(
    startTick,
    drawPitch,
    resolutionTicks,
    activeInstrumentId,
  );
  visuals?.clearSelection();
  visuals?.beginDraw(
    startTick,
    drawPitch,
    resolutionTicks,
    activeInstrumentId,
    converter,
    instrumentStyles.get()[activeInstrumentId],
    (t) => resolvePitchSnapSettings(
      activeClip.timeline.timeMap,
      pitchSnapSettings.get(),
      t,
    ),
  );
}
