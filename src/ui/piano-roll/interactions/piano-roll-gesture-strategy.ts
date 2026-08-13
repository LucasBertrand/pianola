import {
  INTERACTION_CONSTANTS,
} from "../../../config/interaction-config";
import {
  getActiveClip,
  type InstrumentId,
  type NoteId,
} from "../../../domain/model";
import type {
  ViewportState,
} from "../../../editor/geometry/converter";
import type {
  SpatialIndex,
} from "../../../editor/geometry/spatial-index";
import {
  calculateResizeDeltaBounds,
  measureNoteSelection,
  quantizeTick,
  snapTickToCellStart,
} from "../../../editor/interactions/gestures/note-gesture-math";
import type {
  SelectionMode,
} from "../../../editor/interactions/gestures/gesture-draft";
import type {
  PianoRollInteractionSession,
} from "../../../editor/interactions/piano-roll-interaction-session";
import {
  isSupportedPointerActivation,
  type PointerInteractionStrategy,
} from "../../../editor/interactions/pointer/pointer-interaction-strategy";
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
  NoteGestureWorkflowAdapter,
} from "./note-gesture-workflow-adapter";
import type {
  PianoRollSelectionController,
} from "./piano-roll-selection-controller";

export interface PianoRollGestureStrategyOptions {
  readonly overlay: HTMLElement;
  readonly getVisuals: () => InteractionVisualController | null;
  readonly session: PianoRollInteractionSession;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly selectionController: PianoRollSelectionController;
  readonly workflow: NoteGestureWorkflowAdapter;
  readonly spatialIndex: SpatialIndex;
  readonly instrumentStyles: ReadonlyRenderSignal<
    Readonly<Record<InstrumentId, InstrumentRenderStyle>>
  >;
  readonly editorCommands: EditorCommandPort;
  readonly getActiveInstrumentId: () => InstrumentId;
  readonly totalTicks: number;
  readonly selectionMode: SelectionMode;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly onGridSeek: ((tick: number) => void) | undefined;
}

const TOUCH_DOUBLE_TAP_DELAY_MS =
  INTERACTION_CONSTANTS.touchDoubleTapDelayMs;
const TOUCH_DOUBLE_TAP_DISTANCE_CSS_PIXELS =
  INTERACTION_CONSTANTS.touchDoubleTapDistanceCssPixels;
const TAP_MOVEMENT_TOLERANCE_CSS_PIXELS =
  INTERACTION_CONSTANTS.tapMovementToleranceCssPixels;
const MOUSE_RESIZE_HANDLE_CSS_PIXELS =
  INTERACTION_CONSTANTS.mouseResizeHandleCssPixels;
const TOUCH_RESIZE_HANDLE_CSS_PIXELS =
  INTERACTION_CONSTANTS.touchResizeHandleCssPixels;
const MOUSE_NOTE_HIT_ENVELOPE_CSS_PIXELS =
  INTERACTION_CONSTANTS.mouseNoteHitEnvelopeCssPixels;
const TOUCH_NOTE_HIT_ENVELOPE_CSS_PIXELS =
  INTERACTION_CONSTANTS.touchNoteHitEnvelopeCssPixels;

/** Builds the DOM-free gesture strategy consumed by the pointer manager. */
export function createPianoRollGestureStrategy(
  options: PianoRollGestureStrategyOptions,
): PointerInteractionStrategy {
  const {
    overlay,
    getVisuals,
    session,
    viewport,
    selectionController,
    workflow,
    spatialIndex,
    instrumentStyles,
    editorCommands,
    getActiveInstrumentId,
    totalTicks,
    selectionMode,
    gridResolutionTicks,
    pitchSnapSettings,
    onGridSeek,
  } = options;
  const { converter, draft, gesture, lassoBuffer, tapState } = session;
  const { selection } = selectionController;
  const updateConverter = (): void => {
    session.synchronizeConverter(
      viewport.get(),
      viewport.version,
    );
  };

  const endGestureVisual = (): void => {
    if (draft.mode === "DRAGGING") {
      getVisuals()?.endDrag();
    } else if (
      draft.mode === "RESIZING_START"
      || draft.mode === "RESIZING_END"
    ) {
      getVisuals()?.endResize();
    } else if (draft.mode === "LASSO_SELECTING") {
      getVisuals()?.endLasso();
    } else if (draft.mode === "DRAWING") {
      getVisuals()?.endDraw();
    }
  };
  const cancelGesture = (): void => {
    endGestureVisual();
    session.resetDraft();
    selectionController.showSelection();
  };
  const registerDirectPointerTap = (
    event: PointerSample,
    noteId: NoteId,
  ): void => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }

    const elapsed = event.timeStamp - tapState.timeStamp;
    const deltaX = event.clientX - tapState.clientX;
    const deltaY = event.clientY - tapState.clientY;
    const maximumDistanceSquared =
      TOUCH_DOUBLE_TAP_DISTANCE_CSS_PIXELS
      * TOUCH_DOUBLE_TAP_DISTANCE_CSS_PIXELS;
    const isDoubleTap =
      tapState.noteId === noteId
      && elapsed > 0
      && elapsed <= TOUCH_DOUBLE_TAP_DELAY_MS
      && deltaX * deltaX + deltaY * deltaY <= maximumDistanceSquared;

    if (isDoubleTap) {
      tapState.noteId = null;
      const note = selection.find(noteId);

      if (note !== undefined && workflow.commitDelete(note)) {
        selectionController.clearSelection();
      }

      return;
    }

    tapState.noteId = noteId;
    tapState.timeStamp = event.timeStamp;
    tapState.clientX = event.clientX;
    tapState.clientY = event.clientY;
  };

  const handlePointerDown = (event: PointerSample): void => {
    if (!isSupportedPointerActivation(event) || draft.mode !== "IDLE") {
      return;
    }

    session.captureGestureSelection();
    updateConverter();

    const bounds = overlay.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    const pointerTick = converter.cssPixelXToTick(localX);
    const pointerPitch = converter.cssPixelYToPitch(localY);
    const resolutionTicks = gridResolutionTicks.get();
    const bodyEnvelope = createTouchEnvelope(
      converter,
      event.pointerType,
      MOUSE_NOTE_HIT_ENVELOPE_CSS_PIXELS,
      TOUCH_NOTE_HIT_ENVELOPE_CSS_PIXELS,
    );
    const hitNote = spatialIndex.queryPointWithEnvelope(
      pointerTick,
      pointerPitch,
      bodyEnvelope,
      (note) => selectionController.isNoteEditable(note),
      compareNotesByInstrumentRenderOrder,
    );
    const edgeEnvelope = createTouchEnvelope(
      converter,
      event.pointerType,
      MOUSE_RESIZE_HANDLE_CSS_PIXELS,
      TOUCH_RESIZE_HANDLE_CSS_PIXELS,
    );
    const selectedEdgeCandidate = spatialIndex.queryNoteEdge(
      pointerTick,
      pointerPitch,
      edgeEnvelope,
      (note) => selectionController.isSelectedNoteEditable(note),
      compareNotesByInstrumentRenderOrder,
    );
    const edgeCandidate = selectedEdgeCandidate
      ?? spatialIndex.queryNoteEdge(
        pointerTick,
        pointerPitch,
        edgeEnvelope,
        (note) => selectionController.isNoteEditable(note),
        compareNotesByInstrumentRenderOrder,
      );
    const edgeHit =
      edgeCandidate !== undefined && selection.has(edgeCandidate.note.id)
        ? edgeCandidate
        : undefined;
    const targetNote = edgeCandidate?.note ?? hitNote;
    const pointerStarted = gesture.beginPointer({
      pointerId: event.pointerId,
      overlayLeft: bounds.left,
      overlayTop: bounds.top,
      localX,
      localY,
      pointerTick,
      pointerPitch,
      targetNoteId: targetNote?.id ?? null,
      snapResolutionTicks: resolutionTicks,
      pitchSnapSettings: pitchSnapSettings.get(),
      selectionMode: event.shiftKey ? "add" : selectionMode,
    });

    if (!pointerStarted) {
      return;
    }

    if (targetNote === undefined) {
      gesture.beginPendingLasso();
      return;
    }

    if (draft.selectionMode === "subtract") {
      gesture.beginPendingNoteSelection();
      return;
    }

    selectionController.selectHitNote(
      targetNote,
      draft.selectionMode === "add",
    );
    const selectionBounds = measureNoteSelection(selection.notes);
    const resizeEdge = edgeHit?.edge ?? null;

    if (resizeEdge === null) {
      gesture.beginDrag(selectionBounds);
      getVisuals()?.beginDrag(
        selection.notes,
        converter,
        instrumentStyles.get(),
      );
      return;
    }

    const originResizeTick = resizeEdge === "start"
      ? targetNote.startTick
      : targetNote.startTick + targetNote.durationTicks;
    const resizeBounds = calculateResizeDeltaBounds(
      selection.notes,
      resizeEdge,
      resolutionTicks,
      totalTicks,
    );

    gesture.beginResize(
      resizeEdge,
      originResizeTick,
      selectionBounds,
      resizeBounds,
    );
    getVisuals()?.beginResize(
      selection.notes,
      converter,
      instrumentStyles.get(),
      resizeEdge,
    );
  };

  const handlePointerMove = (event: PointerSample): void => {
    if (!gesture.isPointerActive(event.pointerId)) {
      return;
    }

    const localX = event.clientX - draft.overlayLeft;
    const localY = event.clientY - draft.overlayTop;
    const updateKind = gesture.updatePointer(
      event.pointerId,
      localX,
      localY,
      converter.cssPixelXToTick(localX),
      converter.cssPixelYToPitch(localY),
      totalTicks,
      TAP_MOVEMENT_TOLERANCE_CSS_PIXELS,
    );

    if (updateKind === "beginLasso") {
      if (draft.selectionMode === "replace") {
        selectionController.clearSelection();
      }

      getVisuals()?.beginLasso(draft.originLocalX, draft.originLocalY);
      getVisuals()?.updateLasso(
        draft.originLocalX,
        draft.originLocalY,
        localX,
        localY,
      );
      return;
    }

    if (updateKind === "updateDrag") {
      const deltaX = converter.tickToCssPixelX(draft.deltaTicks)
        - converter.tickToCssPixelX(0);
      const pitchStepCssPixels = converter.pitchToCssPixelY(0)
        - converter.pitchToCssPixelY(1);

      getVisuals()?.updateDrag(
        deltaX,
        pitchStepCssPixels,
        draft.deltaPitch,
        draft.pitchSnapSettings,
      );
    } else if (updateKind === "updateResize") {
      const deltaX = converter.tickToCssPixelX(draft.deltaTicks)
        - converter.tickToCssPixelX(0);

      getVisuals()?.updateResize(
        draft.mode === "RESIZING_START" ? "start" : "end",
        deltaX,
      );
    } else if (updateKind === "updateDraw") {
      const width = converter.tickToCssPixelX(
        draft.drawStartTick + draft.drawDurationTicks,
      ) - converter.tickToCssPixelX(draft.drawStartTick);

      getVisuals()?.updateDraw(width);
    } else if (updateKind === "updateLasso") {
      getVisuals()?.updateLasso(
        draft.originLocalX,
        draft.originLocalY,
        localX,
        localY,
      );
    }
  };

  const handlePointerUp = (event: PointerSample): void => {
    const completion = gesture.completePointer(
      event.pointerId,
      TAP_MOVEMENT_TOLERANCE_CSS_PIXELS,
    );

    if (completion === null) {
      return;
    }

    const { mode, pointerWasTap, targetNoteId } = completion;

    if (mode === "DRAGGING") {
      workflow.commitMove(completion);
      getVisuals()?.endDrag();
      selectionController.showSelection();
    } else if (mode === "RESIZING_START" || mode === "RESIZING_END") {
      workflow.commitResize(completion);
      getVisuals()?.endResize();
      selectionController.showSelection();
    } else if (mode === "DRAWING") {
      workflow.commitDraw(completion, session.createNoteId(Date.now()));
      getVisuals()?.endDraw();
      selectionController.showSelection();
    } else if (mode === "LASSO_SELECTING") {
      completeLasso(completion);
    } else if (mode === "PENDING_LASSO" && pointerWasTap) {
      selectionController.clearSelection();
      const pointerTick = converter.cssPixelXToTick(
        completion.currentLocalX,
      );
      const snappedTick = quantizeTick(
        pointerTick,
        completion.snapResolutionTicks,
      );

      onGridSeek?.(Math.min(totalTicks, Math.max(0, snappedTick)));
    } else if (
      mode === "PENDING_NOTE_SELECTION"
      && pointerWasTap
      && targetNoteId !== null
    ) {
      selectionController.removeHitNote(targetNoteId);
    }

    if (pointerWasTap && targetNoteId !== null && mode !== "LASSO_SELECTING") {
      registerDirectPointerTap(event, targetNoteId);
    }
  };

  const completeLasso = (
    completion: import("../../../editor/interactions/gestures/gesture-state-machine").GestureCompletion,
  ): void => {
    const startTick = converter.cssPixelXToTick(completion.originLocalX);
    const endTick = converter.cssPixelXToTick(completion.currentLocalX);
    const startPitch = converter.cssPixelYToPitch(completion.originLocalY);
    const endPitch = converter.cssPixelYToPitch(completion.currentLocalY);

    if (completion.selectionMode === "replace") {
      selectionController.clearSelection();
    }

    spatialIndex.queryRect(
      Math.max(0, Math.min(startTick, endTick)),
      Math.max(startTick, endTick),
      Math.max(0, Math.min(startPitch, endPitch)),
      Math.min(127, Math.max(startPitch, endPitch)),
      lassoBuffer,
    );

    for (const note of lassoBuffer) {
      if (completion.selectionMode === "subtract") {
        selection.delete(note.id);
      } else if (
        selectionController.isNoteEditable(note)
        && !selection.has(note.id)
      ) {
        selection.add(note);
      }
    }

    getVisuals()?.endLasso();
    selectionController.showSelection();
  };

  const handlePointerCancel = (event: PointerSample): void => {
    if (gesture.isPointerActive(event.pointerId)) {
      cancelGesture();
    }
  };
  const handleDoubleClick = (event: PointerSample): void => {
    updateConverter();
    const bounds = overlay.getBoundingClientRect();
    const note = spatialIndex.queryPoint(
      converter.cssPixelXToTick(event.clientX - bounds.left),
      converter.cssPixelYToPitch(event.clientY - bounds.top),
      (candidate) => selectionController.isNoteEditable(candidate),
      compareNotesByInstrumentRenderOrder,
    );

    if (note !== undefined && workflow.commitDelete(note)) {
      selectionController.clearSelection();
    }
  };
  const handleLongPress = (event: PointerSample): void => {
    updateConverter();
    const bounds = overlay.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    const tick = converter.cssPixelXToTick(localX);
    const pitch = converter.cssPixelYToPitch(localY);
    const resolutionTicks = gridResolutionTicks.get();
    const envelope = createTouchEnvelope(
      converter,
      event.pointerType,
      MOUSE_NOTE_HIT_ENVELOPE_CSS_PIXELS,
      TOUCH_NOTE_HIT_ENVELOPE_CSS_PIXELS,
    );
    const note = spatialIndex.queryPointWithEnvelope(
      tick,
      pitch,
      envelope,
      (candidate) => selectionController.isNoteEditable(candidate),
      compareNotesByInstrumentRenderOrder,
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
      || activeClip.instrumentStatesById[activeInstrumentId]?.locked !== false
      || activeClip.tracksByInstrumentId[activeInstrumentId] === undefined
    ) {
      return;
    }

    const startTick = Math.max(0, snapTickToCellStart(tick, resolutionTicks));
    const activePitchSnapSettings = pitchSnapSettings.get();
    const drawPitch = snapPitchToTonalPattern(
      pitch,
      activePitchSnapSettings,
      0,
    );

    if (startTick + resolutionTicks > totalTicks) {
      return;
    }

    const pointerStarted = gesture.beginPointer({
      pointerId: event.pointerId,
      overlayLeft: bounds.left,
      overlayTop: bounds.top,
      localX,
      localY,
      pointerTick: tick,
      pointerPitch: pitch,
      targetNoteId: null,
      snapResolutionTicks: resolutionTicks,
      pitchSnapSettings: activePitchSnapSettings,
      selectionMode: "replace",
    });

    if (!pointerStarted) {
      return;
    }

    gesture.beginDrawing(
      startTick,
      drawPitch,
      resolutionTicks,
      activeInstrumentId,
    );
    selectionController.clearSelection();
    getVisuals()?.beginDraw(
      startTick,
      drawPitch,
      resolutionTicks,
      activeInstrumentId,
      converter,
      instrumentStyles.get()[activeInstrumentId],
    );
  };

  return {
    onPointerDown: handlePointerDown,
    shouldScheduleLongPress(): boolean {
      return draft.mode === "PENDING_LASSO";
    },
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onGesture(events: readonly PointerSample[]): void {
      if (events.length < 2) {
        return;
      }

      if (draft.mode !== "IDLE") {
        cancelGesture();
      }

      selectionController.restoreGestureSelection();
    },
    onLongPress: handleLongPress,
    onDoubleClick: handleDoubleClick,
    cancel: cancelGesture,
  };
}
