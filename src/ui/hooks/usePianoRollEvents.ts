import {
  useEffect,
  useRef,
  type RefObject,
} from "react";
import {
  EDITOR_CONSTANTS,
  INTERACTION_CONSTANTS,
} from "../../config/program-constants";
import {
  NoteGestureWorkflow,
} from "../../application/note-gesture-workflow";
import type {
  EditorSelectionRequest,
  EditorSelectionRequests,
} from "../../application/editor-selection-requests";
import {
  getActiveClip,
  type Note,
  type NoteId,
  type InstrumentId,
} from "../../domain/model";
import type {
  NoteCollisionResolutionRequest,
} from "../../application/note-collision-resolution";
import type {
  EditorCommandPort,
} from "../../application/editor-command-service";
import {
  type ViewportState,
} from "../../geometry/converter";
import {
  SpatialIndex,
} from "../../geometry/spatial-index";
import {
  createTouchEnvelope,
} from "../../interaction/touch-envelope";
import {
  compareNotesByInstrumentRenderOrder,
  type InstrumentRenderStyle,
} from "../rendering/note-style";
import {
  type InteractionVisualController,
} from "../interactions/contracts";
import type {
  SelectionMode,
} from "../../interaction/core/state";
import {
  snapPitchToTonalPattern,
  type PitchSnapSettings,
} from "../../music/pitch-snap";
import {
  isSupportedPointerActivation,
  type PointerInteractionStrategy,
} from "../../interaction/pointer-interaction-strategy";
import type {
  ReadonlyRenderSignal,
} from "../rendering/render-signal";
import type {
  PointerSample,
} from "../../interaction/core/input";
import {
  buildRepositionedNotes,
  calculateResizeDeltaBounds,
  measureNoteSelection,
  quantizeTick,
  snapTickToCellStart,
} from "../../interaction/core/note-gesture-math";
import {
  PianoRollInteractionSession,
} from "../../interaction/piano-roll-interaction-session";
import type {
  PianoRollControllerPort,
} from "../../interaction/piano-roll-controller-port";

export interface UsePianoRollEventsOptions {
  readonly overlayRef: RefObject<HTMLElement | null>;
  readonly visualsRef: RefObject<InteractionVisualController | null>;
  readonly strategyRef: RefObject<
    PointerInteractionStrategy | null
  >;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly spatialIndex: SpatialIndex;
  readonly instrumentStyles: ReadonlyRenderSignal<
    Readonly<Record<InstrumentId, InstrumentRenderStyle>>
  >;
  readonly editorCommands: EditorCommandPort;
  readonly activeInstrumentId: InstrumentId;
  readonly totalTicks: number;
  readonly selectionMode: SelectionMode;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly selectionRequests: EditorSelectionRequests;
  readonly onGridSeek?: (tick: number) => void;
  readonly onSelectionChange?: (
    hasSelection: boolean,
    soleInstrumentId: InstrumentId | null,
  ) => void;
  readonly onNoteCollision?:
    | ((request: NoteCollisionResolutionRequest) => void)
    | undefined;
  readonly onTransactionRejected?:
    | ((error: unknown) => void)
    | undefined;
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

export function usePianoRollEvents(
  options: UsePianoRollEventsOptions,
): PianoRollControllerPort {
  const {
    overlayRef,
    visualsRef,
    strategyRef,
    totalTicks,
    viewport,
    spatialIndex,
    instrumentStyles,
    editorCommands,
    activeInstrumentId,
    selectionMode,
    gridResolutionTicks,
    pitchSnapSettings,
    selectionRequests,
    onGridSeek,
    onSelectionChange,
    onNoteCollision,
    onTransactionRejected,
  } = options;
  const sessionRef = useRef<PianoRollInteractionSession | null>(null);
  const activeInstrumentIdRef = useRef(activeInstrumentId);

  activeInstrumentIdRef.current = activeInstrumentId;

  if (sessionRef.current === null) {
    sessionRef.current = new PianoRollInteractionSession(
      viewport.get(),
      viewport.version,
    );
  }

  const session = sessionRef.current;
  const draft = session.draft;
  const gesture = session.gesture;
  const selection = session.selection;

  useEffect(() => {
    const overlay = overlayRef.current;
    const converter = session.converter;
    const lassoBuffer = session.lassoBuffer;
    const tapState = session.tapState;

    if (overlay === null) {
      return undefined;
    }

    const updateConverter = (): void => {
      session.synchronizeConverter(
        viewport.get(),
        viewport.version,
      );
    };

    const showSelection = (): void => {
      updateConverter();
      visualsRef.current?.showSelection(
        selection.notes,
        converter,
      );
      onSelectionChange?.(
        selection.size > 0,
        selection.getSoleInstrumentId(),
      );
    };

    const resetDraft = (): void => {
      session.resetDraft();
    };

    const clearSelection = (): void => {
      selection.clear();
      visualsRef.current?.clearSelection();
      onSelectionChange?.(false, null);
    };

    const isInstrumentLocked = (instrumentId: InstrumentId): boolean => {
      const state = editorCommands.getState();

      return getActiveClip(state).instrumentStatesById[instrumentId]?.locked ?? true;
    };
    const isNoteEditable = (note: Note): boolean =>
      !isInstrumentLocked(note.instrumentId);
    const isSelectedNoteEditable = (note: Note): boolean =>
      selection.has(note.id) && isNoteEditable(note);

    const noteGestureWorkflow = new NoteGestureWorkflow(
      editorCommands,
      selection,
      {
        onCollision: onNoteCollision,
        onTransactionRejected,
        onSelectionChanged: showSelection,
      },
    );

    const endGestureVisual = (): void => {
      if (draft.mode === "DRAGGING") {
        visualsRef.current?.endDrag();
      } else if (
        draft.mode === "RESIZING_START"
        || draft.mode === "RESIZING_END"
      ) {
        visualsRef.current?.endResize();
      } else if (draft.mode === "LASSO_SELECTING") {
        visualsRef.current?.endLasso();
      } else if (draft.mode === "DRAWING") {
        visualsRef.current?.endDraw();
      }
    };

    const cancelGesture = (): void => {
      endGestureVisual();
      resetDraft();
      showSelection();
    };
    const captureGestureSelection = (): void => {
      session.captureGestureSelection();
    };
    const restoreGestureSelection = (): void => {
      if (
        session.restoreGestureSelectionOnce(
          (note) => !isInstrumentLocked(note.instrumentId),
        )
      ) {
        showSelection();
      }
    };

    const selectHitNote = (
      note: Note,
      additive: boolean,
    ): void => {
      if (isInstrumentLocked(note.instrumentId)) {
        return;
      }

      if (!selection.has(note.id)) {
        if (!additive) {
          clearSelection();
        }

        selection.add(note);
      }

      showSelection();
    };

    const removeHitNoteFromSelection = (
      noteId: NoteId,
    ): void => {
      if (!selection.delete(noteId)) {
        return;
      }
      showSelection();
    };

    const deleteHitNote = (
      note: Note,
      includeSelection = true,
    ): boolean => {
      if (isInstrumentLocked(note.instrumentId)) {
        return false;
      }

      const deleteSelection =
        includeSelection && selection.has(note.id);
      const result = noteGestureWorkflow.commitDelete(
        deleteSelection ? selection.notes : [note],
        deleteSelection ? "Delete selected notes" : "Delete note",
      );

      if (result === "committed") {
        clearSelection();
        return true;
      }

      return false;
    };

    const registerDirectPointerTap = (
      event: PointerSample,
      noteId: NoteId,
    ): void => {
      if (
        event.pointerType !== "touch"
        && event.pointerType !== "pen"
      ) {
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
        && deltaX * deltaX + deltaY * deltaY
          <= maximumDistanceSquared;

      if (isDoubleTap) {
        tapState.noteId = null;
        const note = selection.find(noteId);

        if (note !== undefined) {
          deleteHitNote(note);
        }

        return;
      }

      tapState.noteId = noteId;
      tapState.timeStamp = event.timeStamp;
      tapState.clientX = event.clientX;
      tapState.clientY = event.clientY;
    };

    const handlePointerDown = (event: PointerSample): void => {
      if (
        !isSupportedPointerActivation(event)
        || draft.mode !== "IDLE"
      ) {
        return;
      }

      captureGestureSelection();
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
      const hitCandidate = spatialIndex.queryPointWithEnvelope(
        pointerTick,
        pointerPitch,
        bodyEnvelope,
        isNoteEditable,
        compareNotesByInstrumentRenderOrder,
      );
      const hitNote = hitCandidate;
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
        isSelectedNoteEditable,
        compareNotesByInstrumentRenderOrder,
      );
      const edgeCandidate =
        selectedEdgeCandidate
        ?? spatialIndex.queryNoteEdge(
          pointerTick,
          pointerPitch,
          edgeEnvelope,
          isNoteEditable,
          compareNotesByInstrumentRenderOrder,
        );
      const edgeHit =
        edgeCandidate !== undefined
        && selection.has(edgeCandidate.note.id)
          ? edgeCandidate
          : undefined;
      const targetNote =
        edgeCandidate?.note ?? hitNote;

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

      if (targetNote !== undefined) {
        if (draft.selectionMode === "subtract") {
          gesture.beginPendingNoteSelection();
          return;
        }

        selectHitNote(
          targetNote,
          draft.selectionMode === "add",
        );
        const selectionBounds = measureNoteSelection(
          selection.notes,
        );

        const resizeEdge = edgeHit?.edge ?? null;

        if (resizeEdge === null) {
          gesture.beginDrag(selectionBounds);
          visualsRef.current?.beginDrag(
            selection.notes,
            converter,
            instrumentStyles.get(),
          );
        } else {
          const originResizeTick =
            resizeEdge === "start"
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
          visualsRef.current?.beginResize(
            selection.notes,
            converter,
            instrumentStyles.get(),
            resizeEdge,
          );
        }
      } else {
        gesture.beginPendingLasso();
      }

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
          clearSelection();
        }

        visualsRef.current?.beginLasso(
          draft.originLocalX,
          draft.originLocalY,
        );
        visualsRef.current?.updateLasso(
          draft.originLocalX,
          draft.originLocalY,
          localX,
          localY,
        );
        return;
      }

      if (updateKind === "updateDrag") {
        const deltaX =
          converter.tickToCssPixelX(draft.deltaTicks)
          - converter.tickToCssPixelX(0);
        const pitchStepCssPixels =
          converter.pitchToCssPixelY(0)
          - converter.pitchToCssPixelY(1);

        visualsRef.current?.updateDrag(
          deltaX,
          pitchStepCssPixels,
          draft.deltaPitch,
          draft.pitchSnapSettings,
        );
      } else if (updateKind === "updateResize") {
        const deltaX =
          converter.tickToCssPixelX(draft.deltaTicks)
          - converter.tickToCssPixelX(0);
        const resizeEdge =
          draft.mode === "RESIZING_START" ? "start" : "end";

        visualsRef.current?.updateResize(resizeEdge, deltaX);
      } else if (updateKind === "updateDraw") {
        const width =
          converter.tickToCssPixelX(
            draft.drawStartTick + draft.drawDurationTicks,
          )
          - converter.tickToCssPixelX(draft.drawStartTick);

        visualsRef.current?.updateDraw(width);
      } else if (updateKind === "updateLasso") {
        visualsRef.current?.updateLasso(
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

      const completedMode = completion.mode;
      const targetNoteId = completion.targetNoteId;
      const pointerWasTap = completion.pointerWasTap;

      if (completedMode === "DRAGGING") {
        if (
          completion.deltaTicks !== 0
          || completion.deltaPitch !== 0
        ) {
          const proposedNotes = buildRepositionedNotes(
            selection.notes,
            completion.deltaTicks,
            completion.deltaPitch,
            completion.pitchSnapSettings,
          );

          noteGestureWorkflow.commitMove(proposedNotes);
        }

        visualsRef.current?.endDrag();
        showSelection();
      } else if (
        completedMode === "RESIZING_START"
        || completedMode === "RESIZING_END"
      ) {
        const resizeEdge =
          completedMode === "RESIZING_START"
            ? "start"
            : "end" as const;

        if (completion.deltaTicks !== 0) {
          noteGestureWorkflow.commitResize(
            completion.deltaTicks,
            resizeEdge,
          );
        }

        visualsRef.current?.endResize();
        showSelection();
      } else if (completedMode === "DRAWING") {
        const instrumentId = completion.drawInstrumentId;
        if (instrumentId !== null) {
          const note: Note = {
            id: session.createNoteId(Date.now()),
            pitch: completion.drawPitch,
            startTick: completion.drawStartTick,
            durationTicks: completion.drawDurationTicks,
            velocity: EDITOR_CONSTANTS.defaultDrawVelocity,
            instrumentId,
            enabled: true,
          };

          noteGestureWorkflow.commitDraw(note);
        }

        visualsRef.current?.endDraw();
        showSelection();

      } else if (completedMode === "LASSO_SELECTING") {
        const startTick = converter.cssPixelXToTick(
          completion.originLocalX,
        );
        const endTick = converter.cssPixelXToTick(
          completion.currentLocalX,
        );
        const startPitch = converter.cssPixelYToPitch(
          completion.originLocalY,
        );
        const endPitch = converter.cssPixelYToPitch(
          completion.currentLocalY,
        );
        const minimumTick = Math.max(
          0,
          Math.min(startTick, endTick),
        );
        const maximumTick = Math.max(startTick, endTick);
        const minimumPitch = Math.max(
          0,
          Math.min(startPitch, endPitch),
        );
        const maximumPitch = Math.min(
          127,
          Math.max(startPitch, endPitch),
        );

        if (completion.selectionMode === "replace") {
          clearSelection();
        }

        spatialIndex.queryRect(
          minimumTick,
          maximumTick,
          minimumPitch,
          maximumPitch,
          lassoBuffer,
        );

        if (completion.selectionMode === "subtract") {
          for (
            let noteIndex = 0;
            noteIndex < lassoBuffer.length;
            noteIndex += 1
          ) {
            const note = lassoBuffer[noteIndex];

            if (note !== undefined) {
              selection.delete(note.id);
            }
          }
        } else {
          for (
            let noteIndex = 0;
            noteIndex < lassoBuffer.length;
            noteIndex += 1
          ) {
            const note = lassoBuffer[noteIndex];

            if (
              note !== undefined
              && !isInstrumentLocked(note.instrumentId)
              && !selection.has(note.id)
            ) {
              selection.add(note);
            }
          }
        }

        visualsRef.current?.endLasso();
        showSelection();
      } else if (
        completedMode === "PENDING_LASSO"
        && pointerWasTap
      ) {
        clearSelection();

        const pointerTick = converter.cssPixelXToTick(
          completion.currentLocalX,
        );
        const snappedTick = quantizeTick(
          pointerTick,
          completion.snapResolutionTicks,
        );

        onGridSeek?.(
          Math.min(totalTicks, Math.max(0, snappedTick)),
        );
      } else if (
        completedMode === "PENDING_NOTE_SELECTION"
        && pointerWasTap
        && targetNoteId !== null
      ) {
        removeHitNoteFromSelection(targetNoteId);
      }

      if (
        pointerWasTap
        && targetNoteId !== null
        && completedMode !== "LASSO_SELECTING"
      ) {
        registerDirectPointerTap(event, targetNoteId);
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
      const localX = event.clientX - bounds.left;
      const localY = event.clientY - bounds.top;
      const note = spatialIndex.queryPoint(
        converter.cssPixelXToTick(localX),
        converter.cssPixelYToPitch(localY),
        isNoteEditable,
        compareNotesByInstrumentRenderOrder,
      );

      if (note !== undefined) {
        deleteHitNote(note);
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
        isNoteEditable,
        compareNotesByInstrumentRenderOrder,
      );

      if (note !== undefined) {
        // Holding an existing note must not change its musical state. The
        // pending drag remains active and may continue when the pointer moves.
        return;
      }

      const currentActiveInstrumentId = activeInstrumentIdRef.current;
      const currentState = editorCommands.getState();
      const activeInstrument = currentState.projectInstrumentsById[currentActiveInstrumentId];
      const activeInstrumentState = getActiveClip(currentState)
        .instrumentStatesById[currentActiveInstrumentId];

      if (
        pitch < 0
        || pitch > 127
        || activeInstrument === undefined
        || activeInstrumentState?.locked !== false
        || getActiveClip(
          editorCommands.getState(),
        ).tracksByInstrumentId[currentActiveInstrumentId] === undefined
      ) {
        return;
      }

      const startTick = Math.max(
        0,
        snapTickToCellStart(tick, resolutionTicks),
      );
      const activePitchSnapSettings =
        pitchSnapSettings.get();
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
        currentActiveInstrumentId,
      );
      clearSelection();
      visualsRef.current?.beginDraw(
        startTick,
        drawPitch,
        resolutionTicks,
        currentActiveInstrumentId,
        converter,
        instrumentStyles.get()[currentActiveInstrumentId],
      );
    };

    const handleGesture = (
      events: readonly PointerSample[],
    ): void => {
      if (events.length < 2) {
        return;
      }

      if (draft.mode !== "IDLE") {
        cancelGesture();
      }

      restoreGestureSelection();
    };

    const handleViewportChange = (): void => {
      updateConverter();
      showSelection();
    };
    const handleSelectionRequest = (
      request: EditorSelectionRequest,
    ): void => {
      if (request.type === "clear") {
        clearSelection();
        return;
      }

      const instrumentId = request.instrumentId;

      const projectState = editorCommands.getState();
      const activeClip = getActiveClip(projectState);
      selection.reconcile(
        projectState,
        (note) =>
          activeClip.instrumentStatesById[note.instrumentId]?.locked === false,
      );
      const requestedInstrument = projectState.projectInstrumentsById[instrumentId];
      const requestedInstrumentState = activeClip.instrumentStatesById[instrumentId];

      if (
        requestedInstrument === undefined
        || requestedInstrumentState?.locked !== false
      ) {
        showSelection();
        return;
      }

      selection.toggleInstrument(
        projectState,
        instrumentId,
        (note) =>
          activeClip.instrumentStatesById[note.instrumentId]?.locked === false,
      );

      showSelection();
    };
    const unsubscribeViewport = viewport.subscribe(
      handleViewportChange,
    );
    const unsubscribeSelectionRequests =
      selectionRequests.subscribe(handleSelectionRequest);
    const strategy: PointerInteractionStrategy = {
      onPointerDown: handlePointerDown,
      shouldScheduleLongPress(): boolean {
        // Long press is reserved for drawing from an empty grid cell. Notes
        // never arm the timer, so holding one cannot cancel a pending move.
        return draft.mode === "PENDING_LASSO";
      },
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onGesture: handleGesture,
      onLongPress: handleLongPress,
      onDoubleClick: handleDoubleClick,
      cancel: cancelGesture,
    };

    strategyRef.current = strategy;

    showSelection();

    return (): void => {
      cancelGesture();
      unsubscribeViewport();
      unsubscribeSelectionRequests();

      if (strategyRef.current === strategy) {
        strategyRef.current = null;
      }
    };
  }, [
    draft,
    gesture,
    gridResolutionTicks,
    pitchSnapSettings,
    onNoteCollision,
    onGridSeek,
    onTransactionRejected,
    onSelectionChange,
    overlayRef,
    editorCommands,
    selectionMode,
    selection,
    spatialIndex,
    strategyRef,
    totalTicks,
    viewport,
    visualsRef,
    selectionRequests,
    instrumentStyles,
  ]);

  return {
    getSelectedNotes(): readonly Note[] {
      return selection.copyNotes();
    },
    replaceSelection(notes: readonly Note[]): void {
      selection.replace(notes);
      const converter = session.synchronizeConverter(
        viewport.get(),
        viewport.version,
      );

      visualsRef.current?.showSelection(
        selection.notes,
        converter,
      );

      onSelectionChange?.(
        selection.size > 0,
        selection.getSoleInstrumentId(),
      );
    },
    removeInstrumentFromSelection(instrumentId: InstrumentId): void {
      selection.retain((note) => note.instrumentId !== instrumentId);
      const converter = session.synchronizeConverter(
        viewport.get(),
        viewport.version,
      );

      visualsRef.current?.showSelection(
        selection.notes,
        converter,
      );

      onSelectionChange?.(
        selection.size > 0,
        selection.getSoleInstrumentId(),
      );
    },
    togglePitchSelection(pitch: number): void {
      if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
        return;
      }

      const state = editorCommands.getState();
      const activeClip = getActiveClip(state);
      const changed = selection.togglePitch(
        state,
        pitch,
        (note) =>
          activeClip.instrumentStatesById[note.instrumentId]?.locked === false,
      );

      if (!changed) {
        return;
      }

      const converter = session.synchronizeConverter(
        viewport.get(),
        viewport.version,
      );

      visualsRef.current?.showSelection(
        selection.notes,
        converter,
      );

      onSelectionChange?.(
        selection.size > 0,
        selection.getSoleInstrumentId(),
      );
    },
    cancel(): void {
      visualsRef.current?.endDrag();
      visualsRef.current?.endResize();
      visualsRef.current?.endDraw();
      visualsRef.current?.endLasso();
      gesture.reset();

      visualsRef.current?.showSelection(
        selection.notes,
        session.synchronizeConverter(
          viewport.get(),
          viewport.version,
        ),
      );
    },
    clearSelection(): void {
      selection.clear();
      visualsRef.current?.clearSelection();
      onSelectionChange?.(false, null);
    },
  };
}
