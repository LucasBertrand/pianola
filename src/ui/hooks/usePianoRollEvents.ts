import {
  useEffect,
  useRef,
  type RefObject,
} from "react";
import {
  EDITOR_CONSTANTS,
  INTERACTION_CONSTANTS,
} from "../../config/program-constants";
import type {
  PianoRollCommand,
} from "../../domain/commands";
import {
  buildDeleteNoteCommands,
  buildRepositionNoteCommands,
  buildResizeNoteCommands,
  resizeNotes,
} from "../../application/note-edit-commands";
import type {
  EditorSelection,
} from "../../application/editor-selection";
import type {
  EditorSelectionRequest,
  EditorSelectionRequests,
} from "../../application/editor-selection-requests";
import type {
  Note,
  NoteId,
  ProjectState,
  VoiceId,
} from "../../domain/model";
import {
  countNoteEditCollisions,
  type NoteEditIntent,
} from "../../domain/note-collision";
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
  hasResizeCollision,
  hasVoiceCollision,
} from "../../interaction/note-hit-testing";
import {
  compareNotesByVoiceRenderOrder,
  type VoiceRenderStyle,
} from "../rendering/note-style";
import {
  type InteractionDraft,
  type InteractionVisualController,
  type ResizeEdge,
} from "../interactions/contracts";
import type {
  InteractionTool,
  SelectionMode,
  TouchAwareInteractionStrategy,
} from "../interactions/types";
import {
  snapPitchToTonalPattern,
  type PitchSnapSettings,
} from "../../music/pitch-snap";
import {
  isSupportedPointerActivation,
} from "../interactions/types";
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

export interface UsePianoRollEventsOptions {
  readonly overlayRef: RefObject<HTMLElement | null>;
  readonly visualsRef: RefObject<InteractionVisualController | null>;
  readonly strategyRef: RefObject<
    TouchAwareInteractionStrategy | null
  >;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly spatialIndex: SpatialIndex;
  readonly voiceStyles: ReadonlyRenderSignal<
    Readonly<Record<VoiceId, VoiceRenderStyle>>
  >;
  readonly editorCommands: EditorCommandPort;
  readonly activeVoiceId: VoiceId;
  readonly totalTicks: number;
  readonly getActiveTool: () => InteractionTool;
  readonly selectionMode: SelectionMode;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly selectionRequests: EditorSelectionRequests;
  readonly onGridSeek?: (tick: number) => void;
  readonly onSelectionChange?: (
    hasSelection: boolean,
    soleVoiceId: VoiceId | null,
  ) => void;
  readonly onNoteCollision?:
    | ((request: NoteCollisionResolutionRequest) => void)
    | undefined;
  readonly onTransactionRejected?:
    | ((error: unknown) => void)
    | undefined;
}

export interface PianoRollEventController {
  readonly draft: InteractionDraft;
  readonly selection: EditorSelection;
  getSelectedNotes(): readonly Note[];
  replaceSelection(notes: readonly Note[]): void;
  removeVoiceFromSelection(voiceId: VoiceId): void;
  togglePitchSelection(pitch: number): void;
  cancel(): void;
  clearSelection(): void;
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
): PianoRollEventController {
  const {
    overlayRef,
    visualsRef,
    strategyRef,
    totalTicks,
    viewport,
    spatialIndex,
    voiceStyles,
    editorCommands,
    activeVoiceId,
    getActiveTool,
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
  const activeVoiceIdRef = useRef(activeVoiceId);

  activeVoiceIdRef.current = activeVoiceId;

  if (sessionRef.current === null) {
    sessionRef.current = new PianoRollInteractionSession(
      viewport.get(),
      viewport.version,
    );
  }

  const session = sessionRef.current;
  const draft = session.draft;
  const selection = session.selection;

  useEffect(() => {
    const overlay = overlayRef.current;
    const converter = session.converter;
    const collisionBuffer = session.collisionBuffer;
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
        selection.getSoleVoiceId(),
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

    const isVoiceLocked = (voiceId: VoiceId): boolean =>
      editorCommands.getState().voicesById[voiceId]?.locked ?? true;
    const isNoteEditable = (note: Note): boolean =>
      !isVoiceLocked(note.voiceId);
    const isSelectedNoteEditable = (note: Note): boolean =>
      selection.has(note.id) && isNoteEditable(note);

    const refreshSelection = (
      projectState: ProjectState,
    ): void => {
      selection.reconcile(projectState, isNoteEditable);
    };

    const replaceSelectionByNoteIds = (
      projectState: ProjectState,
      noteIds: readonly NoteId[],
    ): void => {
      selection.clear();

      for (const noteId of noteIds) {
        for (const voiceId of projectState.voiceOrder) {
          const note =
            projectState
              .tracksByVoiceId[voiceId]
              ?.notesById[noteId];

          if (
            note !== undefined
            && !isVoiceLocked(note.voiceId)
          ) {
            selection.add(note);
            break;
          }
        }
      }

      showSelection();
    };

    const requestNoteCollisionResolution = (
      originalNotes: readonly Note[],
      proposedNotes: readonly Note[],
      label: string,
    ): void => {
      const requestState = editorCommands.getState();
      const originalSnapshot = originalNotes.slice();
      const proposedSnapshot = proposedNotes.slice();
      const collisionCount = countNoteEditCollisions(
        requestState,
        {
          originalNotes: originalSnapshot,
          proposedNotes: proposedSnapshot,
        },
      );

      if (collisionCount === 0) {
        return;
      }

      onNoteCollision?.({
        label,
        collisionCount,
        originalNotes: originalSnapshot,
        proposedNotes: proposedSnapshot,
        onResolved(projectState, selectedNoteIds): void {
          replaceSelectionByNoteIds(
            projectState,
            selectedNoteIds,
          );
        },
      });
    };

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
          (note) => !isVoiceLocked(note.voiceId),
        )
      ) {
        showSelection();
      }
    };

    const dispatchTransaction = (
      commands: readonly PianoRollCommand[],
      label: string,
    ): ProjectState | null => {
      if (commands.length === 0) {
        return null;
      }

      try {
        return editorCommands.dispatch(commands, label);
      } catch (error: unknown) {
        onTransactionRejected?.(error);
        return null;
      }
    };

    const selectHitNote = (
      note: Note,
      additive: boolean,
    ): void => {
      if (isVoiceLocked(note.voiceId)) {
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
      if (isVoiceLocked(note.voiceId)) {
        return false;
      }

      const deleteSelection =
        includeSelection && selection.has(note.id);
      const commands = deleteSelection
        ? buildDeleteNoteCommands(selection.notes)
        : buildDeleteNoteCommands([note]);
      const nextState = dispatchTransaction(
        commands,
        deleteSelection ? "Delete selected notes" : "Delete note",
      );

      if (nextState !== null) {
        clearSelection();
        return true;
      }

      return false;
    };

    const registerTouchTap = (
      event: PointerSample,
      noteId: NoteId,
    ): void => {
      if (event.pointerType !== "touch") {
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
      const activeTool = getActiveTool();
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
        compareNotesByVoiceRenderOrder,
      );
      const hitNote = hitCandidate;
      const edgeEnvelope = createTouchEnvelope(
        converter,
        event.pointerType,
        MOUSE_RESIZE_HANDLE_CSS_PIXELS,
        TOUCH_RESIZE_HANDLE_CSS_PIXELS,
      );
      const selectedEdgeCandidate =
        activeTool === "select"
          ? spatialIndex.queryNoteEdge(
              pointerTick,
              pointerPitch,
              edgeEnvelope,
              isSelectedNoteEditable,
              compareNotesByVoiceRenderOrder,
            )
          : undefined;
      const edgeCandidate =
        selectedEdgeCandidate
        ?? (
          activeTool === "select"
            ? spatialIndex.queryNoteEdge(
                pointerTick,
                pointerPitch,
                edgeEnvelope,
                isNoteEditable,
                compareNotesByVoiceRenderOrder,
              )
            : undefined
        );
      const edgeHit =
        edgeCandidate !== undefined
        && selection.has(edgeCandidate.note.id)
          ? edgeCandidate
          : undefined;
      const targetNote =
        edgeCandidate?.note ?? hitNote;

      draft.activeTool = activeTool;
      draft.snapResolutionTicks = resolutionTicks;
      draft.pitchSnapSettings = pitchSnapSettings.get();
      draft.pointerId = event.pointerId;
      draft.overlayLeft = bounds.left;
      draft.overlayTop = bounds.top;
      draft.originLocalX = localX;
      draft.originLocalY = localY;
      draft.currentLocalX = localX;
      draft.currentLocalY = localY;
      draft.originPointerTick = pointerTick;
      draft.originPointerPitch = pointerPitch;
      draft.deltaTicks = 0;
      draft.deltaPitch = 0;
      draft.targetNoteId = targetNote?.id ?? null;
      draft.additiveSelection = event.shiftKey;
      draft.selectionMode = event.shiftKey
        ? "add"
        : selectionMode;

      if (targetNote !== undefined) {
        if (draft.selectionMode === "subtract") {
          draft.mode = "PENDING_NOTE_SELECTION";
          return;
        }

        selectHitNote(
          targetNote,
          draft.selectionMode === "add",
        );
        const selectionBounds = measureNoteSelection(
          selection.notes,
        );

        draft.minimumSelectedStartTick =
          selectionBounds.minimumStartTick;
        draft.maximumSelectedEndTick =
          selectionBounds.maximumEndTick;
        draft.minimumSelectedPitch =
          selectionBounds.minimumPitch;
        draft.maximumSelectedPitch =
          selectionBounds.maximumPitch;

        const resizeEdge = edgeHit?.edge ?? null;

        if (resizeEdge === null) {
          draft.mode = "DRAGGING";
          visualsRef.current?.beginDrag(
            selection.notes,
            converter,
            voiceStyles.get(),
          );
        } else {
          draft.mode =
            resizeEdge === "start"
              ? "RESIZING_START"
              : "RESIZING_END";
          draft.originResizeTick =
            resizeEdge === "start"
              ? targetNote.startTick
              : targetNote.startTick + targetNote.durationTicks;
          const resizeBounds = calculateResizeDeltaBounds(
            selection.notes,
            resizeEdge,
            resolutionTicks,
            totalTicks,
          );
          draft.minimumResizeDeltaTicks =
            resizeBounds.minimumDeltaTicks;
          draft.maximumResizeDeltaTicks =
            resizeBounds.maximumDeltaTicks;
          visualsRef.current?.beginResize(
            selection.notes,
            converter,
            voiceStyles.get(),
            resizeEdge,
          );
        }
      } else {
        draft.mode = "PENDING_LASSO";
      }

    };

    const handlePointerMove = (event: PointerSample): void => {
      if (
        event.pointerId !== draft.pointerId
        || draft.mode === "IDLE"
      ) {
        return;
      }

      const localX = event.clientX - draft.overlayLeft;
      const localY = event.clientY - draft.overlayTop;
      draft.currentLocalX = localX;
      draft.currentLocalY = localY;

      if (draft.mode === "PENDING_LASSO") {
        const movedBeyondTapTolerance =
          Math.abs(localX - draft.originLocalX)
            > TAP_MOVEMENT_TOLERANCE_CSS_PIXELS
          || Math.abs(localY - draft.originLocalY)
            > TAP_MOVEMENT_TOLERANCE_CSS_PIXELS;

        if (!movedBeyondTapTolerance) {
          return;
        }

        if (draft.selectionMode === "replace") {
          clearSelection();
        }

        draft.mode = "LASSO_SELECTING";
        visualsRef.current?.beginLasso(
          draft.originLocalX,
          draft.originLocalY,
        );
      }

      if (draft.mode === "DRAGGING") {
        const pointerTick = converter.cssPixelXToTick(localX);
        const pointerPitch = converter.cssPixelYToPitch(localY);
        let deltaTicks = quantizeTick(
          pointerTick - draft.originPointerTick,
          draft.snapResolutionTicks,
        );
        let deltaPitch =
          pointerPitch - draft.originPointerPitch;

        if (
          draft.minimumSelectedStartTick + deltaTicks < 0
        ) {
          deltaTicks = -draft.minimumSelectedStartTick;
        }

        if (
          draft.maximumSelectedEndTick + deltaTicks > totalTicks
        ) {
          deltaTicks = totalTicks - draft.maximumSelectedEndTick;
        }

        if (draft.minimumSelectedPitch + deltaPitch < 0) {
          deltaPitch = -draft.minimumSelectedPitch;
        } else if (
          draft.maximumSelectedPitch + deltaPitch > 127
        ) {
          deltaPitch = 127 - draft.maximumSelectedPitch;
        }

        if (
          deltaTicks !== draft.deltaTicks
          || deltaPitch !== draft.deltaPitch
        ) {
          draft.deltaTicks = deltaTicks;
          draft.deltaPitch = deltaPitch;

          const deltaX =
            converter.tickToCssPixelX(deltaTicks)
            - converter.tickToCssPixelX(0);
          const pitchStepCssPixels =
            converter.pitchToCssPixelY(0)
            - converter.pitchToCssPixelY(1);

          visualsRef.current?.updateDrag(
            deltaX,
            pitchStepCssPixels,
            deltaPitch,
            draft.pitchSnapSettings,
          );
        }
      } else if (
        draft.mode === "RESIZING_START"
        || draft.mode === "RESIZING_END"
      ) {
        const pointerTick = converter.cssPixelXToTick(localX);
        const targetTick = quantizeTick(
          draft.originResizeTick
            + pointerTick
            - draft.originPointerTick,
          draft.snapResolutionTicks,
        );
        let deltaTicks = targetTick - draft.originResizeTick;

        if (deltaTicks < draft.minimumResizeDeltaTicks) {
          deltaTicks = draft.minimumResizeDeltaTicks;
        } else if (
          deltaTicks > draft.maximumResizeDeltaTicks
        ) {
          deltaTicks = draft.maximumResizeDeltaTicks;
        }

        if (deltaTicks !== draft.deltaTicks) {
          draft.deltaTicks = deltaTicks;
          const deltaX =
            converter.tickToCssPixelX(deltaTicks)
            - converter.tickToCssPixelX(0);
          const resizeEdge =
            draft.mode === "RESIZING_START"
              ? "start"
              : "end";

          visualsRef.current?.updateResize(
            resizeEdge,
            deltaX,
          );
        }
      } else if (draft.mode === "DRAWING") {
        const pointerTick = converter.cssPixelXToTick(localX);
        const snappedEndTick = quantizeTick(
          pointerTick,
          draft.snapResolutionTicks,
        );
        const durationTicks = Math.min(
          totalTicks - draft.drawStartTick,
          Math.max(
            draft.snapResolutionTicks,
            snappedEndTick - draft.drawStartTick,
          ),
        );

        if (durationTicks !== draft.drawDurationTicks) {
          draft.drawDurationTicks = durationTicks;
          const width =
            converter.tickToCssPixelX(
              draft.drawStartTick + durationTicks,
            )
            - converter.tickToCssPixelX(draft.drawStartTick);

          visualsRef.current?.updateDraw(width);
        }
      } else if (draft.mode === "LASSO_SELECTING") {
        visualsRef.current?.updateLasso(
          draft.originLocalX,
          draft.originLocalY,
          localX,
          localY,
        );
      }

    };

    const handlePointerUp = (event: PointerSample): void => {
      if (
        event.pointerId !== draft.pointerId
        || draft.mode === "IDLE"
      ) {
        return;
      }

      const completedMode = draft.mode;
      const targetNoteId = draft.targetNoteId;
      const pointerWasTap =
        Math.abs(
          draft.currentLocalX - draft.originLocalX,
        ) <= TAP_MOVEMENT_TOLERANCE_CSS_PIXELS
        && Math.abs(
          draft.currentLocalY - draft.originLocalY,
        ) <= TAP_MOVEMENT_TOLERANCE_CSS_PIXELS;

      if (completedMode === "DRAGGING") {
        if (
          draft.deltaTicks !== 0
          || draft.deltaPitch !== 0
        ) {
          const proposedNotes = buildRepositionedNotes(
            selection.notes,
            draft.deltaTicks,
            draft.deltaPitch,
            draft.pitchSnapSettings,
          );
          const moveIntent = {
            originalNotes: selection.notes,
            proposedNotes,
          } as const;

          if (
            countNoteEditCollisions(
              editorCommands.getState(),
              moveIntent,
            ) > 0
          ) {
            requestNoteCollisionResolution(
              selection.notes,
              proposedNotes,
              "Move notes",
            );
          } else {
            const nextState = dispatchTransaction(
              buildRepositionNoteCommands(proposedNotes),
              "Move notes",
            );

            if (nextState !== null) {
              refreshSelection(nextState);
            }
          }
        }

        visualsRef.current?.endDrag();
        showSelection();
      } else if (
        completedMode === "RESIZING_START"
        || completedMode === "RESIZING_END"
      ) {
        const resizeEdge: ResizeEdge =
          completedMode === "RESIZING_START"
            ? "start"
            : "end";

        if (draft.deltaTicks !== 0) {
          if (
            hasResizeCollision(
              selection.notes,
              draft.deltaTicks,
              resizeEdge,
              spatialIndex,
              collisionBuffer,
            )
          ) {
            requestNoteCollisionResolution(
              selection.notes,
              resizeNotes(
                selection.notes,
                draft.deltaTicks,
                resizeEdge,
              ),
              "Resize notes",
            );
          } else {
            const nextState = dispatchTransaction(
              buildResizeNoteCommands(
                selection.notes,
                draft.deltaTicks,
                resizeEdge,
              ),
              "Resize notes",
            );

            if (nextState !== null) {
              refreshSelection(nextState);
            }
          }
        }

        visualsRef.current?.endResize();
        showSelection();
      } else if (completedMode === "DRAWING") {
        const voiceId = draft.drawVoiceId;
        if (voiceId !== null) {
          const note: Note = {
            id: session.createNoteId(Date.now()),
            pitch: draft.drawPitch,
            startTick: draft.drawStartTick,
            durationTicks: draft.drawDurationTicks,
            velocity: EDITOR_CONSTANTS.defaultDrawVelocity,
            voiceId,
          };

          if (
            hasVoiceCollision(
              voiceId,
              draft.drawStartTick,
              draft.drawStartTick + draft.drawDurationTicks,
              draft.drawPitch,
              spatialIndex,
              collisionBuffer,
            )
          ) {
            requestNoteCollisionResolution(
              [],
              [note],
              "Draw note",
            );
          } else {
            const command: PianoRollCommand = {
              type: "AddNotes",
              trackVoiceId: voiceId,
              notes: [note],
            };
            const nextState = dispatchTransaction(
              [command],
              "Draw note",
            );

            if (nextState !== null) {
              const addedNote =
                nextState
                  .tracksByVoiceId[voiceId]
                  ?.notesById[note.id];

              clearSelection();

              if (addedNote !== undefined) {
                selection.add(addedNote);
              }
            }
          }
        }

        visualsRef.current?.endDraw();
        showSelection();

      } else if (completedMode === "LASSO_SELECTING") {
        const startTick = converter.cssPixelXToTick(
          draft.originLocalX,
        );
        const endTick = converter.cssPixelXToTick(
          draft.currentLocalX,
        );
        const startPitch = converter.cssPixelYToPitch(
          draft.originLocalY,
        );
        const endPitch = converter.cssPixelYToPitch(
          draft.currentLocalY,
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

        if (draft.selectionMode === "replace") {
          clearSelection();
        }

        spatialIndex.queryRect(
          minimumTick,
          maximumTick,
          minimumPitch,
          maximumPitch,
          lassoBuffer,
        );

        if (draft.selectionMode === "subtract") {
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
              && !isVoiceLocked(note.voiceId)
              && !selection.has(note.id)
            ) {
              selection.add(note);
            }
          }
        }

        visualsRef.current?.endLasso();
        showSelection();
      } else if (completedMode === "PENDING_LASSO") {
        clearSelection();

        const pointerTick = converter.cssPixelXToTick(
          draft.currentLocalX,
        );
        const snappedTick = quantizeTick(
          pointerTick,
          draft.snapResolutionTicks,
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

      resetDraft();

      if (
        pointerWasTap
        && targetNoteId !== null
        && completedMode !== "LASSO_SELECTING"
      ) {
        registerTouchTap(event, targetNoteId);
      }

    };

    const handlePointerCancel = (event: PointerSample): void => {
      if (event.pointerId === draft.pointerId) {
        cancelGesture();
      }
    };

    const handleDoubleClick = (event: PointerSample): void => {
      if (getActiveTool() !== "select") {
        return;
      }

      updateConverter();

      const bounds = overlay.getBoundingClientRect();
      const localX = event.clientX - bounds.left;
      const localY = event.clientY - bounds.top;
      const note = spatialIndex.queryPoint(
        converter.cssPixelXToTick(localX),
        converter.cssPixelYToPitch(localY),
        isNoteEditable,
        compareNotesByVoiceRenderOrder,
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
        compareNotesByVoiceRenderOrder,
      );

      if (note !== undefined) {
        selectHitNote(note, false);
        return;
      }

      const currentActiveVoiceId = activeVoiceIdRef.current;
      const activeVoice =
        editorCommands.getState().voicesById[currentActiveVoiceId];

      if (
        pitch < 0
        || pitch > 127
        || activeVoice === undefined
        || activeVoice.locked
        || editorCommands
          .getState()
          .tracksByVoiceId[currentActiveVoiceId] === undefined
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

      draft.activeTool = "select";
      draft.snapResolutionTicks = resolutionTicks;
      draft.pitchSnapSettings = activePitchSnapSettings;
      draft.pointerId = event.pointerId;
      draft.overlayLeft = bounds.left;
      draft.overlayTop = bounds.top;
      draft.originLocalX = localX;
      draft.originLocalY = localY;
      draft.currentLocalX = localX;
      draft.currentLocalY = localY;
      draft.originPointerTick = tick;
      draft.originPointerPitch = pitch;
      draft.deltaTicks = 0;
      draft.deltaPitch = 0;
      draft.targetNoteId = null;
      draft.mode = "DRAWING";
      draft.drawStartTick = startTick;
      draft.drawPitch = drawPitch;
      draft.drawDurationTicks = resolutionTicks;
      draft.drawVoiceId = currentActiveVoiceId;
      clearSelection();
      visualsRef.current?.beginDraw(
        startTick,
        drawPitch,
        resolutionTicks,
        currentActiveVoiceId,
        converter,
        voiceStyles.get()[currentActiveVoiceId],
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

      const voiceId = request.voiceId;

      const projectState = editorCommands.getState();
      selection.reconcile(
        projectState,
        (note) =>
          projectState.voicesById[note.voiceId]?.locked === false,
      );
      const requestedVoice = projectState.voicesById[voiceId];

      if (requestedVoice?.locked !== false) {
        showSelection();
        return;
      }

      selection.toggleVoice(
        projectState,
        voiceId,
        (note) =>
          projectState.voicesById[note.voiceId]?.locked === false,
      );

      showSelection();
    };
    const unsubscribeViewport = viewport.subscribe(
      handleViewportChange,
    );
    const unsubscribeSelectionRequests =
      selectionRequests.subscribe(handleSelectionRequest);
    const strategy: TouchAwareInteractionStrategy = {
      supportsHover: false,
      onPointerDown: handlePointerDown,
      shouldScheduleLongPress(): boolean {
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
    getActiveTool,
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
    voiceStyles,
  ]);

  return {
    draft,
    selection,
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
        selection.getSoleVoiceId(),
      );
    },
    removeVoiceFromSelection(voiceId: VoiceId): void {
      selection.retain((note) => note.voiceId !== voiceId);
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
        selection.getSoleVoiceId(),
      );
    },
    togglePitchSelection(pitch: number): void {
      if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
        return;
      }

      const state = editorCommands.getState();
      const changed = selection.togglePitch(
        state,
        pitch,
        (note) =>
          state.voicesById[note.voiceId]?.locked === false,
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
        selection.getSoleVoiceId(),
      );
    },
    cancel(): void {
      visualsRef.current?.endDrag();
      visualsRef.current?.endResize();
      visualsRef.current?.endDraw();
      visualsRef.current?.endLasso();
      draft.mode = "IDLE";
      draft.pointerId = -1;
      draft.deltaTicks = 0;
      draft.deltaPitch = 0;

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
