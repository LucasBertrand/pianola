import {
  getActiveClip,
} from "../../../domain/project/project-document";
import {
  snapTickToMeasureGrid,
} from "../../../domain/transport/time-map";
import {
  INTERACTION_CONSTANTS,
} from "../../../editor-core/interactions/interaction-constants";
import {
  type InstrumentId,
} from "../../../domain/identifiers";
import type {
  Note,
} from "../../../domain/notes/note";
import type {
  ViewportState,
} from "../../../editor-core/geometry/converter";
import type {
  SpatialIndex,
} from "../../../editor-core/geometry/spatial-index";
import {
  calculateResizeDeltaBounds,
  measureNoteSelection,
  resolveRepositionedPitch,
} from "../../../editor-core/interactions/gestures/note-gesture-math";
import type {
  PianoRollInteractionSession,
} from "../../../editor-core/interactions/piano-roll-interaction-session";
import {
  isSupportedPointerActivation,
  type PointerInteractionStrategy,
} from "../../../editor-core/interactions/pointer/pointer-interaction-strategy";
import type {
  PointerSample,
} from "../../../editor-core/interactions/pointer/pointer-sample";
import {
  createTouchEnvelope,
} from "../../../editor-core/interactions/pointer/touch-envelope";
import type {
  InstrumentRenderStyle,
} from "../../../editor-core/model/instrument-render-style";
import type {
  ReadonlyRenderSignal,
} from "../../../editor-core/model/render-signal";
import type {
  PitchSnapSettings,
} from "../../../domain/music-theory/pitch-snap";
import {
  resolvePitchSnapSettings,
} from "../../../application/piano-roll/timeline/pitch-snap-resolution";
import {
  isPointInsideNoteResizeAnchor,
} from "./note-resize-anchor-hit-test";
import {
  measureTimelineSelectionTickBounds,
} from "../../../application/piano-roll/selection/timeline-selection-move";
import type {
  EditorCommandPort,
} from "../../../application/history/editor-command-service";
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
import type {
  SelectionMode,
} from "../../../editor-core/interactions/gestures/gesture-draft";
import {
  handleDirectNoteTap,
} from "./direct-note-tap";
import {
  completePianoRollLasso,
} from "./complete-piano-roll-lasso";
import {
  beginPianoRollLongPressDraw,
} from "./begin-piano-roll-long-press-draw";
import {
  resolveEffectiveTimeMap,
  type TimeMapMarkerPreviewSession,
  type TimeMapMarkerPreviewToken,
} from "../../../application/editor-session/time-map-marker-preview-session";

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
  readonly getInstrumentOrder: () => readonly InstrumentId[];
  readonly totalTicks: number;
  readonly selectionMode: SelectionMode;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly onGridSeek: ((tick: number) => void) | undefined;
  readonly onPitchHighlightChange?: ((pitch: number | null) => void) | undefined;
  readonly timeMapMarkerPreview?: TimeMapMarkerPreviewSession | undefined;
}

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
    getInstrumentOrder,
    totalTicks,
    selectionMode,
    gridResolutionTicks,
    pitchSnapSettings,
    onGridSeek,
    onPitchHighlightChange,
    timeMapMarkerPreview,
  } = options;
  const { converter, draft, gesture, lassoBuffer, tapState } = session;
  const { selection } = selectionController;
  let handledDragNote: Note | null = null;
  let markerPreviewToken: TimeMapMarkerPreviewToken | null = null;
  const clearMarkerPreview = (): void => {
    if (markerPreviewToken !== null) {
      timeMapMarkerPreview?.clear(markerPreviewToken);
      markerPreviewToken = null;
    }
  };
  const updateConverter = (): void => {
    session.synchronizeConverter(
      viewport.get(),
      viewport.version,
    );
  };

  const endGestureVisual = (): void => {
    clearMarkerPreview();

    if (draft.mode === "DRAGGING") {
      getVisuals()?.endDrag();
      if (handledDragNote !== null) {
        handledDragNote = null;
        onPitchHighlightChange?.(null);
      }
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
    if (handledDragNote !== null) {
      handledDragNote = null;
      onPitchHighlightChange?.(null);
    }
    session.resetDraft();
    selectionController.showSelection();
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
    const gestureState = editorCommands.getState();
    const gestureClip = getActiveClip(gestureState);
    const resolveGestureTimeMap = () => resolveEffectiveTimeMap(
      gestureClip.timeline.timeMap,
      timeMapMarkerPreview?.signal.get() ?? null,
      gestureClip.id,
      gestureState.revision,
    );
    const snapAbsoluteTick = (tick: number): number =>
      snapTickToMeasureGrid(
        gestureState.clock.ppqn,
        gestureClip.timeline.timeMap,
        gestureClip.timeline.durationTicks,
        tick,
        resolutionTicks,
      );
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
      () => true,
      (a, b) => compareNotesByInstrumentRenderOrder(a, b, getInstrumentOrder()),
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
      (a, b) => compareNotesByInstrumentRenderOrder(a, b, getInstrumentOrder()),
    );
    const edgeHit = selectedEdgeCandidate !== undefined
      && isPointInsideNoteResizeAnchor(
        selectedEdgeCandidate.note,
        selectedEdgeCandidate.edge,
        localX,
        localY,
        converter,
      )
        ? selectedEdgeCandidate
        : undefined;
    const targetNote = edgeHit?.note ?? hitNote;
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
      snapAbsoluteTick,
      getSnapSettingsAtTick: (tick) => resolvePitchSnapSettings(
        resolveGestureTimeMap(),
        pitchSnapSettings.get(),
        tick,
      ),
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
    if (!selectionController.isNoteEditable(targetNote)) {
      gesture.beginPendingNoteSelection();
      return;
    }

    const editableNotes = selection.notes.filter(
      (note) => selectionController.isNoteEditable(note),
    );
    const noteSelectionBounds = measureNoteSelection(editableNotes);
    const timelineTickBounds = measureTimelineSelectionTickBounds(
      editableNotes,
      selection.markerGroups,
    );
    const selectionBounds = timelineTickBounds === null
      ? noteSelectionBounds
      : {
          ...noteSelectionBounds,
          minimumStartTick: timelineTickBounds.minimumStartTick,
          maximumEndTick: timelineTickBounds.maximumEndTick,
        };
    const resizeEdge = edgeHit?.edge ?? null;

    if (resizeEdge === null) {
      handledDragNote = targetNote;
      gesture.beginDrag(selectionBounds);
      if (
        timeMapMarkerPreview !== undefined
        && selection.markerGroups.length > 0
      ) {
        markerPreviewToken = timeMapMarkerPreview.begin({
          clipId: gestureClip.id,
          movedGroups: selection.markerGroups,
        });
      }
      getVisuals()?.beginDrag(
        editableNotes,
        converter,
        instrumentStyles.get(),
        draft.getSnapSettingsAtTick,
        () => resolveGestureTimeMap().scaleMarkers,
      );
      if (handledDragNote !== null) {
        const referencePitch = resolveRepositionedPitch(
          handledDragNote.pitch,
          handledDragNote.startTick,
          0,
          0,
          draft.getSnapSettingsAtTick,
        ).pitch;
        onPitchHighlightChange?.(referencePitch);
      }
      return;
    }

    const originResizeTick = resizeEdge === "start"
      ? targetNote.startTick
      : targetNote.startTick + targetNote.durationTicks;
    const resizeBounds = calculateResizeDeltaBounds(
      editableNotes,
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
      editableNotes,
      converter,
      instrumentStyles.get(),
      resizeEdge,
      draft.getSnapSettingsAtTick,
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
      if (markerPreviewToken !== null) {
        timeMapMarkerPreview?.update(
          markerPreviewToken,
          draft.deltaTicks,
        );
      }
      const deltaX = converter.tickToCssPixelX(draft.deltaTicks)
        - converter.tickToCssPixelX(0);
      const pitchStepCssPixels = converter.pitchToCssPixelY(0)
        - converter.pitchToCssPixelY(1);

      getVisuals()?.updateDrag(
        deltaX,
        pitchStepCssPixels,
        draft.deltaTicks,
        draft.deltaPitch,
        draft.getSnapSettingsAtTick,
      );
      if (handledDragNote !== null) {
        const referencePitch = resolveRepositionedPitch(
          handledDragNote.pitch,
          handledDragNote.startTick,
          draft.deltaTicks,
          draft.deltaPitch,
          draft.getSnapSettingsAtTick,
        ).pitch;
        onPitchHighlightChange?.(referencePitch);
      }
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
      if (
        markerPreviewToken === null
        || timeMapMarkerPreview?.isActive(markerPreviewToken) === true
      ) {
        workflow.commitMove(completion);
      }
      clearMarkerPreview();
      getVisuals()?.endDrag();
      if (handledDragNote !== null) {
        handledDragNote = null;
        onPitchHighlightChange?.(null);
      }
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
      completePianoRollLasso({
        completion,
        converter,
        selectionController,
        spatialIndex,
        timeMap: getActiveClip(editorCommands.getState()).timeline.timeMap,
        resultBuffer: lassoBuffer,
        visuals: getVisuals(),
      });
    } else if (mode === "PENDING_LASSO" && pointerWasTap) {
      selectionController.clearSelection();
      const pointerTick = converter.cssPixelXToTick(
        completion.currentLocalX,
      );
      const seekState = editorCommands.getState();
      const seekClip = getActiveClip(seekState);
      const snappedTick = snapTickToMeasureGrid(
        seekState.clock.ppqn,
        seekClip.timeline.timeMap,
        seekClip.timeline.durationTicks,
        pointerTick,
        completion.snapResolutionTicks,
      );

      onGridSeek?.(Math.min(totalTicks, Math.max(0, snappedTick)));
    } else if (
      mode === "PENDING_NOTE_SELECTION"
      && pointerWasTap
      && targetNoteId !== null
      && completion.selectionMode === "subtract"
    ) {
      selectionController.removeHitNote(targetNoteId);
    }

    if (pointerWasTap && targetNoteId !== null && mode !== "LASSO_SELECTING") {
      handleDirectNoteTap(
        event,
        targetNoteId,
        tapState,
        selectionController,
        workflow,
      );
    }
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
      (a, b) => compareNotesByInstrumentRenderOrder(a, b, getInstrumentOrder()),
    );

    if (note !== undefined) {
      workflow.commitDelete(note);
    }
  };
  const handleLongPress = (event: PointerSample): void => {
    updateConverter();
    beginPianoRollLongPressDraw({
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
      visuals: getVisuals(),
    });
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
