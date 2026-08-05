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
  NoteDurationChange,
  NotePositionChange,
  PianoRollCommand,
  Transaction,
} from "../../domain/commands";
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
  ProjectStorePort,
} from "../../domain/project-store";
import {
  CoordinateConverter,
  type ViewportState,
} from "../../geometry/converter";
import {
  SpatialIndex,
} from "../../geometry/spatial-index";
import type {
  SpatialTouchEnvelope,
} from "../../geometry/spatial-index";
import {
  compareNotesByVoiceRenderOrder,
  type VoiceRenderStyle,
} from "../rendering/note-style";
import {
  createInteractionDraft,
  type InteractionDraft,
  type InteractionSelection,
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
} from "../interactions/pitch-snap";
import {
  isSupportedPointerActivation,
} from "../interactions/types";
import type {
  ReadonlyRenderSignal,
} from "../rendering/render-signal";

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
  readonly projectStore: ProjectStorePort;
  readonly activeVoiceId: VoiceId;
  readonly totalTicks: number;
  readonly getActiveTool: () => InteractionTool;
  readonly selectionMode: SelectionMode;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly pitchSnapSettings: ReadonlyRenderSignal<PitchSnapSettings>;
  readonly voiceSelectionRequest: ReadonlyRenderSignal<VoiceId | null>;
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

export interface NoteCollisionResolutionRequest
  extends NoteEditIntent {
  readonly label: string;
  readonly collisionCount: number;
  readonly onResolved: (
    state: ProjectState,
    selectedNoteIds: readonly NoteId[],
  ) => void;
}

export interface PianoRollEventController {
  readonly draft: InteractionDraft;
  readonly selection: InteractionSelection;
  getSelectedNotes(): readonly Note[];
  replaceSelection(notes: readonly Note[]): void;
  removeVoiceFromSelection(voiceId: VoiceId): void;
  togglePitchSelection(pitch: number): void;
  cancel(): void;
  clearSelection(): void;
}

interface TapState {
  noteId: NoteId | null;
  timeStamp: number;
  clientX: number;
  clientY: number;
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
    projectStore,
    activeVoiceId,
    getActiveTool,
    selectionMode,
    gridResolutionTicks,
    pitchSnapSettings,
    voiceSelectionRequest,
    onGridSeek,
    onSelectionChange,
    onNoteCollision,
    onTransactionRejected,
  } = options;
  const draftRef = useRef<InteractionDraft | null>(null);
  const selectionRef = useRef<InteractionSelection | null>(null);
  const collisionBufferRef = useRef<Note[] | null>(null);
  const lassoBufferRef = useRef<Note[] | null>(null);
  const gestureSelectionSnapshotRef =
    useRef<Note[] | null>(null);
  const converterRef = useRef<CoordinateConverter | null>(null);
  const converterVersionRef = useRef(-1);
  const transactionSequenceRef = useRef(0);
  const tapStateRef = useRef<TapState | null>(null);
  const activeVoiceIdRef = useRef(activeVoiceId);

  activeVoiceIdRef.current = activeVoiceId;

  if (draftRef.current === null) {
    draftRef.current = createInteractionDraft();
  }

  if (selectionRef.current === null) {
    selectionRef.current = {
      noteIds: new Set<NoteId>(),
      notes: [],
    };
  }

  if (collisionBufferRef.current === null) {
    collisionBufferRef.current = [];
  }

  if (lassoBufferRef.current === null) {
    lassoBufferRef.current = [];
  }

  if (gestureSelectionSnapshotRef.current === null) {
    gestureSelectionSnapshotRef.current = [];
  }

  if (converterRef.current === null) {
    converterRef.current = new CoordinateConverter(viewport.get());
    converterVersionRef.current = viewport.version;
  }

  if (tapStateRef.current === null) {
    tapStateRef.current = {
      noteId: null,
      timeStamp: 0,
      clientX: 0,
      clientY: 0,
    };
  }

  const draft = draftRef.current;
  const selection = selectionRef.current;

  useEffect(() => {
    const overlay = overlayRef.current;
    const converter = converterRef.current;
    const collisionBuffer = collisionBufferRef.current;
    const lassoBuffer = lassoBufferRef.current;
    const gestureSelectionSnapshot =
      gestureSelectionSnapshotRef.current;
    const tapState = tapStateRef.current;

    if (
      overlay === null
      || converter === null
      || collisionBuffer === null
      || lassoBuffer === null
      || gestureSelectionSnapshot === null
      || tapState === null
    ) {
      return undefined;
    }

    let gestureSelectionRestored = false;

    const updateConverter = (): void => {
      if (converterVersionRef.current !== viewport.version) {
        converter.setViewportState(viewport.get());
        converterVersionRef.current = viewport.version;
      }
    };

    const showSelection = (): void => {
      updateConverter();
      visualsRef.current?.showSelection(
        selection.notes,
        converter,
      );
      onSelectionChange?.(
        selection.notes.length > 0,
        getSoleSelectionVoiceId(selection.notes),
      );
    };

    const resetDraft = (): void => {
      draft.mode = "IDLE";
      draft.pointerId = -1;
      draft.deltaTicks = 0;
      draft.deltaPitch = 0;
      draft.minimumResizeDeltaTicks =
        Number.NEGATIVE_INFINITY;
      draft.maximumResizeDeltaTicks =
        Number.POSITIVE_INFINITY;
      draft.maximumSelectedEndTick = 0;
      draft.originResizeTick = 0;
      draft.targetNoteId = null;
      draft.drawStartTick = 0;
      draft.drawPitch = 0;
      draft.drawDurationTicks = 0;
      draft.drawVoiceId = null;
      draft.additiveSelection = false;
      draft.selectionMode = "replace";
    };

    const clearSelection = (): void => {
      selection.noteIds.clear();
      selection.notes.length = 0;
      visualsRef.current?.clearSelection();
      onSelectionChange?.(false, null);
    };

    const isVoiceLocked = (voiceId: VoiceId): boolean =>
      projectStore.getState().voicesById[voiceId]?.locked ?? true;
    const isNoteEditable = (note: Note): boolean =>
      !isVoiceLocked(note.voiceId);
    const isSelectedNoteEditable = (note: Note): boolean =>
      selection.noteIds.has(note.id) && isNoteEditable(note);

    const refreshSelection = (
      projectState: ProjectState,
    ): void => {
      let targetIndex = 0;

      for (
        let noteIndex = 0;
        noteIndex < selection.notes.length;
        noteIndex += 1
      ) {
        const previousNote = selection.notes[noteIndex];

        if (previousNote === undefined) {
          continue;
        }

        const updatedNote =
          projectState
            .tracksByVoiceId[previousNote.voiceId]
            ?.notesById[previousNote.id];

        if (
          updatedNote !== undefined
          && !isVoiceLocked(updatedNote.voiceId)
        ) {
          selection.notes[targetIndex] = updatedNote;
          targetIndex += 1;
        } else {
          selection.noteIds.delete(previousNote.id);
        }
      }

      selection.notes.length = targetIndex;
    };

    const replaceSelectionByNoteIds = (
      projectState: ProjectState,
      noteIds: readonly NoteId[],
    ): void => {
      selection.noteIds.clear();
      selection.notes.length = 0;

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
            selection.noteIds.add(note.id);
            selection.notes.push(note);
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
      const requestState = projectStore.getState();
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
      gestureSelectionSnapshot.length = 0;

      for (
        let noteIndex = 0;
        noteIndex < selection.notes.length;
        noteIndex += 1
      ) {
        const note = selection.notes[noteIndex];

        if (note !== undefined) {
          gestureSelectionSnapshot.push(note);
        }
      }

      gestureSelectionRestored = false;
    };
    const restoreGestureSelection = (): void => {
      selection.noteIds.clear();
      selection.notes.length = 0;

      for (
        let noteIndex = 0;
        noteIndex < gestureSelectionSnapshot.length;
        noteIndex += 1
      ) {
        const note = gestureSelectionSnapshot[noteIndex];

        if (
          note !== undefined
          && !isVoiceLocked(note.voiceId)
          && !selection.noteIds.has(note.id)
        ) {
          selection.noteIds.add(note.id);
          selection.notes.push(note);
        }
      }

      showSelection();
    };

    const dispatchTransaction = (
      commands: readonly PianoRollCommand[],
      label: string,
    ): ProjectState | null => {
      if (commands.length === 0) {
        return null;
      }

      transactionSequenceRef.current += 1;
      const transaction: Transaction = {
        transactionId:
          `interaction-${Date.now()}-${transactionSequenceRef.current}`,
        label,
        createdAt: Date.now(),
        commands,
      };

      try {
        return projectStore.dispatch(transaction);
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

      if (!selection.noteIds.has(note.id)) {
        if (!additive) {
          clearSelection();
        }

        selection.noteIds.add(note.id);
        selection.notes.push(note);
      }

      showSelection();
    };

    const removeHitNoteFromSelection = (
      noteId: NoteId,
    ): void => {
      if (!selection.noteIds.delete(noteId)) {
        return;
      }

      let retainedNoteCount = 0;

      for (
        let noteIndex = 0;
        noteIndex < selection.notes.length;
        noteIndex += 1
      ) {
        const note = selection.notes[noteIndex];

        if (
          note !== undefined
          && selection.noteIds.has(note.id)
        ) {
          selection.notes[retainedNoteCount] = note;
          retainedNoteCount += 1;
        }
      }

      selection.notes.length = retainedNoteCount;
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
        includeSelection && selection.noteIds.has(note.id);
      const commands = deleteSelection
        ? buildDeleteCommands(selection.notes)
        : buildDeleteCommands([note]);
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
      event: PointerEvent,
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
        const note = findSelectedNote(selection.notes, noteId);

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

    const handlePointerDown = (event: PointerEvent): void => {
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
        && selection.noteIds.has(edgeCandidate.note.id)
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
          event.preventDefault();
          return;
        }

        selectHitNote(
          targetNote,
          draft.selectionMode === "add",
        );
        updateSelectedBounds(draft, selection.notes);

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
          updateResizeBounds(
            draft,
            selection.notes,
            resizeEdge,
            resolutionTicks,
            totalTicks,
          );
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

      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent): void => {
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
          event.preventDefault();
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

      event.preventDefault();
    };

    const handlePointerUp = (event: PointerEvent): void => {
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
              projectStore.getState(),
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
              buildRepositionCommands(proposedNotes),
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
              selection,
              draft.deltaTicks,
              resizeEdge,
              spatialIndex,
              collisionBuffer,
            )
          ) {
            requestNoteCollisionResolution(
              selection.notes,
              buildResizedNotes(
                selection.notes,
                draft.deltaTicks,
                resizeEdge,
              ),
              "Resize notes",
            );
          } else {
            const nextState = dispatchTransaction(
              buildResizeCommands(
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
            id:
              `note-${Date.now()}-${transactionSequenceRef.current + 1}`,
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
                selection.noteIds.add(addedNote.id);
                selection.notes.push(addedNote);
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
              selection.noteIds.delete(note.id);
            }
          }

          let retainedNoteCount = 0;

          for (
            let noteIndex = 0;
            noteIndex < selection.notes.length;
            noteIndex += 1
          ) {
            const note = selection.notes[noteIndex];

            if (
              note !== undefined
              && selection.noteIds.has(note.id)
            ) {
              selection.notes[retainedNoteCount] = note;
              retainedNoteCount += 1;
            }
          }

          selection.notes.length = retainedNoteCount;
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
              && !selection.noteIds.has(note.id)
            ) {
              selection.noteIds.add(note.id);
              selection.notes.push(note);
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

      event.preventDefault();
    };

    const handlePointerCancel = (event: PointerEvent): void => {
      if (event.pointerId === draft.pointerId) {
        cancelGesture();
      }
    };

    const handleDoubleClick = (event: MouseEvent): void => {
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
        event.preventDefault();
      }
    };

    const handleLongPress = (event: PointerEvent): void => {
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
        projectStore.getState().voicesById[currentActiveVoiceId];

      if (
        pitch < 0
        || pitch > 127
        || activeVoice === undefined
        || activeVoice.locked
        || projectStore
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
      events: PointerEvent[],
    ): void => {
      if (events.length < 2) {
        return;
      }

      if (draft.mode !== "IDLE") {
        cancelGesture();
      }

      if (!gestureSelectionRestored) {
        restoreGestureSelection();
        gestureSelectionRestored = true;
      }
    };

    const handleViewportChange = (): void => {
      updateConverter();
      showSelection();
    };
    const handleVoiceSelectionRequest = (): void => {
      const voiceId = voiceSelectionRequest.get();

      if (voiceId === null) {
        clearSelection();
        return;
      }

      let uniqueNoteCount = 0;
      const projectState = projectStore.getState();

      selection.noteIds.clear();

      for (
        let noteIndex = 0;
        noteIndex < selection.notes.length;
        noteIndex += 1
      ) {
        const selectedNote = selection.notes[noteIndex];

        if (
          selectedNote !== undefined
          && !(
            projectState.voicesById[selectedNote.voiceId]
              ?.locked ?? true
          )
          && !selection.noteIds.has(selectedNote.id)
        ) {
          selection.noteIds.add(selectedNote.id);
          selection.notes[uniqueNoteCount] = selectedNote;
          uniqueNoteCount += 1;
        }
      }

      selection.notes.length = uniqueNoteCount;

      const track = projectState.tracksByVoiceId[voiceId];
      const requestedVoice = projectState.voicesById[voiceId];

      if (track === undefined || requestedVoice?.locked !== false) {
        showSelection();
        return;
      }

      let voiceNoteCount = 0;
      let selectedVoiceNoteCount = 0;

      for (const noteId in track.notesById) {
        const note = track.notesById[noteId];

        if (note === undefined) {
          continue;
        }

        voiceNoteCount += 1;

        if (selection.noteIds.has(note.id)) {
          selectedVoiceNoteCount += 1;
        }
      }

      if (
        voiceNoteCount > 0
        && selectedVoiceNoteCount === voiceNoteCount
      ) {
        let retainedNoteCount = 0;

        for (
          let noteIndex = 0;
          noteIndex < selection.notes.length;
          noteIndex += 1
        ) {
          const note = selection.notes[noteIndex];

          if (note === undefined || note.voiceId === voiceId) {
            if (note !== undefined) {
              selection.noteIds.delete(note.id);
            }
            continue;
          }

          selection.notes[retainedNoteCount] = note;
          retainedNoteCount += 1;
        }

        selection.notes.length = retainedNoteCount;
        showSelection();
        return;
      }

      for (const noteId in track.notesById) {
        const note = track.notesById[noteId];

        if (
          note !== undefined
          && !selection.noteIds.has(note.id)
        ) {
          selection.noteIds.add(note.id);
          selection.notes.push(note);
        }
      }

      showSelection();
    };
    const unsubscribeViewport = viewport.subscribe(
      handleViewportChange,
    );
    const unsubscribeVoiceSelection =
      voiceSelectionRequest.subscribe(
        handleVoiceSelectionRequest,
      );
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
      unsubscribeVoiceSelection();

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
    projectStore,
    selectionMode,
    selection,
    spatialIndex,
    strategyRef,
    totalTicks,
    viewport,
    visualsRef,
    voiceSelectionRequest,
    voiceStyles,
  ]);

  return {
    draft,
    selection,
    getSelectedNotes(): readonly Note[] {
      return selection.notes.slice();
    },
    replaceSelection(notes: readonly Note[]): void {
      selection.noteIds.clear();
      selection.notes.length = 0;

      for (
        let noteIndex = 0;
        noteIndex < notes.length;
        noteIndex += 1
      ) {
        const note = notes[noteIndex];

        if (
          note !== undefined
          && !selection.noteIds.has(note.id)
        ) {
          selection.noteIds.add(note.id);
          selection.notes.push(note);
        }
      }

      const converter = converterRef.current;

      if (converter !== null) {
        if (converterVersionRef.current !== viewport.version) {
          converter.setViewportState(viewport.get());
          converterVersionRef.current = viewport.version;
        }

        visualsRef.current?.showSelection(
          selection.notes,
          converter,
        );
      }

      onSelectionChange?.(
        selection.notes.length > 0,
        getSoleSelectionVoiceId(selection.notes),
      );
    },
    removeVoiceFromSelection(voiceId: VoiceId): void {
      let targetIndex = 0;

      for (
        let noteIndex = 0;
        noteIndex < selection.notes.length;
        noteIndex += 1
      ) {
        const note = selection.notes[noteIndex];

        if (note === undefined) {
          continue;
        }

        if (note.voiceId === voiceId) {
          selection.noteIds.delete(note.id);
        } else {
          selection.notes[targetIndex] = note;
          targetIndex += 1;
        }
      }

      selection.notes.length = targetIndex;

      const converter = converterRef.current;

      if (converter !== null) {
        visualsRef.current?.showSelection(
          selection.notes,
          converter,
        );
      }

      onSelectionChange?.(
        selection.notes.length > 0,
        getSoleSelectionVoiceId(selection.notes),
      );
    },
    togglePitchSelection(pitch: number): void {
      if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
        return;
      }

      const state = projectStore.getState();
      let selectableNoteCount = 0;
      let selectedNoteCount = 0;

      for (
        let voiceIndex = 0;
        voiceIndex < state.voiceOrder.length;
        voiceIndex += 1
      ) {
        const voiceId = state.voiceOrder[voiceIndex];

        if (
          voiceId === undefined
          || state.voicesById[voiceId]?.locked !== false
        ) {
          continue;
        }

        const track = state.tracksByVoiceId[voiceId];

        if (track === undefined) {
          continue;
        }

        for (const noteId in track.notesById) {
          const note = track.notesById[noteId];

          if (
            note !== undefined
            && note.pitch === pitch
          ) {
            selectableNoteCount += 1;

            if (selection.noteIds.has(note.id)) {
              selectedNoteCount += 1;
            }
          }
        }
      }

      if (selectableNoteCount === 0) {
        return;
      }

      if (selectedNoteCount === selectableNoteCount) {
        let targetIndex = 0;

        for (
          let noteIndex = 0;
          noteIndex < selection.notes.length;
          noteIndex += 1
        ) {
          const note = selection.notes[noteIndex];

          if (note === undefined) {
            continue;
          }

          if (note.pitch === pitch) {
            selection.noteIds.delete(note.id);
            continue;
          }

          selection.notes[targetIndex] = note;
          targetIndex += 1;
        }

        selection.notes.length = targetIndex;
      } else {
        for (
          let voiceIndex = 0;
          voiceIndex < state.voiceOrder.length;
          voiceIndex += 1
        ) {
          const voiceId = state.voiceOrder[voiceIndex];

          if (
            voiceId === undefined
            || state.voicesById[voiceId]?.locked !== false
          ) {
            continue;
          }

          const track = state.tracksByVoiceId[voiceId];

          if (track === undefined) {
            continue;
          }

          for (const noteId in track.notesById) {
            const note = track.notesById[noteId];

            if (
              note !== undefined
              && note.pitch === pitch
              && !selection.noteIds.has(note.id)
            ) {
              selection.noteIds.add(note.id);
              selection.notes.push(note);
            }
          }
        }
      }

      const converter = converterRef.current;

      if (converter !== null) {
        visualsRef.current?.showSelection(
          selection.notes,
          converter,
        );
      }

      onSelectionChange?.(
        selection.notes.length > 0,
        getSoleSelectionVoiceId(selection.notes),
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

      if (converterRef.current !== null) {
        visualsRef.current?.showSelection(
          selection.notes,
          converterRef.current,
        );
      }
    },
    clearSelection(): void {
      selection.noteIds.clear();
      selection.notes.length = 0;
      visualsRef.current?.clearSelection();
      onSelectionChange?.(false, null);
    },
  };
}

function getSoleSelectionVoiceId(
  notes: readonly Note[],
): VoiceId | null {
  const firstNote = notes[0];

  if (firstNote === undefined) {
    return null;
  }

  const voiceId = firstNote.voiceId;

  for (let noteIndex = 1; noteIndex < notes.length; noteIndex += 1) {
    if (notes[noteIndex]?.voiceId !== voiceId) {
      return null;
    }
  }

  return voiceId;
}

export function quantizeTick(
  tick: number,
  resolutionTicks: number,
): number {
  if (
    !Number.isFinite(tick)
    || !Number.isSafeInteger(resolutionTicks)
    || resolutionTicks <= 0
  ) {
    return tick;
  }

  return Math.round(tick / resolutionTicks) * resolutionTicks;
}

export function snapTickToCellStart(
  tick: number,
  resolutionTicks: number,
): number {
  if (
    !Number.isFinite(tick)
    || !Number.isSafeInteger(resolutionTicks)
    || resolutionTicks <= 0
  ) {
    return tick;
  }

  return Math.floor(tick / resolutionTicks) * resolutionTicks;
}

function createTouchEnvelope(
  converter: CoordinateConverter,
  pointerType: string,
  mouseRadiusCssPixels: number,
  touchRadiusCssPixels: number,
): SpatialTouchEnvelope {
  const radiusCssPixels =
    pointerType === "touch"
      ? touchRadiusCssPixels
      : mouseRadiusCssPixels;
  const tickRadius = Math.abs(
    converter.cssPixelXToTick(radiusCssPixels)
      - converter.cssPixelXToTick(0),
  );

  return {
    tickRadius,
    pitchRadius: 0,
  };
}

function updateSelectedBounds(
  draft: InteractionDraft,
  notes: readonly Note[],
): void {
  let minimumStartTick = Number.POSITIVE_INFINITY;
  let maximumEndTick = 0;
  let minimumPitch = 127;
  let maximumPitch = 0;

  for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    if (note.startTick < minimumStartTick) {
      minimumStartTick = note.startTick;
    }

    const endTick = note.startTick + note.durationTicks;

    if (endTick > maximumEndTick) {
      maximumEndTick = endTick;
    }

    if (note.pitch < minimumPitch) {
      minimumPitch = note.pitch;
    }

    if (note.pitch > maximumPitch) {
      maximumPitch = note.pitch;
    }
  }

  draft.minimumSelectedStartTick = Number.isFinite(
    minimumStartTick,
  )
    ? minimumStartTick
    : 0;
  draft.maximumSelectedEndTick = maximumEndTick;
  draft.minimumSelectedPitch = minimumPitch;
  draft.maximumSelectedPitch = maximumPitch;
}

function updateResizeBounds(
  draft: InteractionDraft,
  notes: readonly Note[],
  edge: ResizeEdge,
  gridResolutionTicks: number,
  totalTicks: number,
): void {
  let minimumDelta = Number.NEGATIVE_INFINITY;
  let maximumDelta = Number.POSITIVE_INFINITY;

  for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    const minimumDuration = Math.min(
      gridResolutionTicks,
      note.durationTicks,
    );

    if (edge === "start") {
      minimumDelta = Math.max(
        minimumDelta,
        -note.startTick,
      );
      maximumDelta = Math.min(
        maximumDelta,
        note.durationTicks - minimumDuration,
      );
    } else {
      minimumDelta = Math.max(
        minimumDelta,
        minimumDuration - note.durationTicks,
      );
      maximumDelta = Math.min(
        maximumDelta,
        totalTicks - note.startTick - note.durationTicks,
      );
    }
  }

  draft.minimumResizeDeltaTicks = minimumDelta;
  draft.maximumResizeDeltaTicks = maximumDelta;
}

function hasVoiceCollision(
  voiceId: VoiceId,
  startTick: number,
  endTick: number,
  pitch: number,
  spatialIndex: SpatialIndex,
  collisionBuffer: Note[],
): boolean {
  spatialIndex.queryRect(
    startTick,
    endTick,
    pitch,
    pitch,
    collisionBuffer,
  );

  for (
    let noteIndex = 0;
    noteIndex < collisionBuffer.length;
    noteIndex += 1
  ) {
    if (collisionBuffer[noteIndex]?.voiceId === voiceId) {
      return true;
    }
  }

  return false;
}

function hasResizeCollision(
  selection: InteractionSelection,
  deltaTicks: number,
  edge: ResizeEdge,
  spatialIndex: SpatialIndex,
  collisionBuffer: Note[],
): boolean {
  for (
    let noteIndex = 0;
    noteIndex < selection.notes.length;
    noteIndex += 1
  ) {
    const note = selection.notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    const startTick =
      edge === "start"
        ? note.startTick + deltaTicks
        : note.startTick;
    const durationTicks =
      edge === "start"
        ? note.durationTicks - deltaTicks
        : note.durationTicks + deltaTicks;

    spatialIndex.queryRect(
      startTick,
      startTick + durationTicks,
      note.pitch,
      note.pitch,
      collisionBuffer,
    );

    for (
      let candidateIndex = 0;
      candidateIndex < collisionBuffer.length;
      candidateIndex += 1
    ) {
      const candidate = collisionBuffer[candidateIndex];

      if (
        candidate !== undefined
        && candidate.voiceId === note.voiceId
        && candidate.id !== note.id
      ) {
        return true;
      }
    }
  }

  return false;
}

function findSelectedNote(
  notes: readonly Note[],
  noteId: NoteId,
): Note | undefined {
  for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
    const note = notes[noteIndex];

    if (note?.id === noteId) {
      return note;
    }
  }

  return undefined;
}

function buildRepositionedNotes(
  notes: readonly Note[],
  deltaTicks: number,
  deltaPitch: number,
  pitchSnapSettings: PitchSnapSettings,
): readonly Note[] {
  const repositionedNotes: Note[] = [];

  for (const note of notes) {
    repositionedNotes.push({
      ...note,
      startTick: note.startTick + deltaTicks,
      pitch:
        deltaPitch === 0
          ? note.pitch
          : snapPitchToTonalPattern(
              note.pitch + deltaPitch,
              pitchSnapSettings,
              deltaPitch,
            ),
    });
  }

  return repositionedNotes;
}

function buildResizedNotes(
  notes: readonly Note[],
  deltaTicks: number,
  edge: ResizeEdge,
): readonly Note[] {
  const resizedNotes: Note[] = [];

  for (const note of notes) {
    resizedNotes.push({
      ...note,
      startTick:
        edge === "start"
          ? note.startTick + deltaTicks
          : note.startTick,
      durationTicks:
        edge === "start"
          ? note.durationTicks - deltaTicks
          : note.durationTicks + deltaTicks,
    });
  }

  return resizedNotes;
}

function buildRepositionCommands(
  notes: readonly Note[],
): readonly PianoRollCommand[] {
  const commands: PianoRollCommand[] = [];
  const processedVoiceIds = new Set<VoiceId>();

  for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
    const note = notes[noteIndex];

    if (
      note === undefined
      || processedVoiceIds.has(note.voiceId)
    ) {
      continue;
    }

    processedVoiceIds.add(note.voiceId);
    const changes: NotePositionChange[] = [];

    for (
      let selectedIndex = noteIndex;
      selectedIndex < notes.length;
      selectedIndex += 1
    ) {
      const selectedNote = notes[selectedIndex];

      if (selectedNote?.voiceId === note.voiceId) {
        changes.push({
          noteId: selectedNote.id,
          startTick: selectedNote.startTick,
          pitch: selectedNote.pitch,
        });
      }
    }

    commands.push({
      type: "RepositionNotes",
      trackVoiceId: note.voiceId,
      changes,
    });
  }

  return commands;
}

function buildResizeCommands(
  notes: readonly Note[],
  deltaTicks: number,
  edge: ResizeEdge,
): readonly PianoRollCommand[] {
  const commands: PianoRollCommand[] = [];
  const processedVoiceIds = new Set<VoiceId>();

  for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
    const note = notes[noteIndex];

    if (
      note === undefined
      || processedVoiceIds.has(note.voiceId)
    ) {
      continue;
    }

    processedVoiceIds.add(note.voiceId);
    const changes: NoteDurationChange[] = [];

    for (
      let selectedIndex = noteIndex;
      selectedIndex < notes.length;
      selectedIndex += 1
    ) {
      const selectedNote = notes[selectedIndex];

      if (selectedNote?.voiceId === note.voiceId) {
        changes.push({
          noteId: selectedNote.id,
          startTick:
            edge === "start"
              ? selectedNote.startTick + deltaTicks
              : selectedNote.startTick,
          durationTicks:
            edge === "start"
              ? selectedNote.durationTicks - deltaTicks
              : selectedNote.durationTicks + deltaTicks,
        });
      }
    }

    commands.push({
      type: "ResizeNotes",
      trackVoiceId: note.voiceId,
      changes,
    });
  }

  return commands;
}

function buildDeleteCommands(
  notes: readonly Note[],
): readonly PianoRollCommand[] {
  const commands: PianoRollCommand[] = [];
  const processedVoiceIds = new Set<VoiceId>();

  for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
    const note = notes[noteIndex];

    if (
      note === undefined
      || processedVoiceIds.has(note.voiceId)
    ) {
      continue;
    }

    processedVoiceIds.add(note.voiceId);
    const noteIds: NoteId[] = [];

    for (
      let selectedIndex = noteIndex;
      selectedIndex < notes.length;
      selectedIndex += 1
    ) {
      const selectedNote = notes[selectedIndex];

      if (selectedNote?.voiceId === note.voiceId) {
        noteIds.push(selectedNote.id);
      }
    }

    commands.push({
      type: "DeleteNotes",
      trackVoiceId: note.voiceId,
      noteIds,
    });
  }

  return commands;
}
