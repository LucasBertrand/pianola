import {
  useEffect,
  useRef,
  type RefObject,
} from "react";
import type {
  PianoRollCommand,
  Transaction,
} from "../../domain/commands";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  Note,
  NoteId,
  VoiceId,
} from "../../domain/model";
import {
  CoordinateConverter,
  type ViewportState,
} from "../../geometry/converter";
import {
  SpatialIndex,
} from "../../geometry/spatial-index";
import type {
  VoiceRenderStyle,
} from "../components/PianoRollLayers";
import {
  createInteractionDraft,
  type InteractionDraft,
  type InteractionSelection,
  type InteractionVisualController,
} from "../interactions/contracts";
import type {
  ReadonlyRenderSignal,
} from "../rendering/render-signal";

export interface UsePianoRollEventsOptions {
  readonly overlayRef: RefObject<HTMLElement | null>;
  readonly visualsRef: RefObject<InteractionVisualController | null>;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly spatialIndex: SpatialIndex;
  readonly voiceStyles: ReadonlyRenderSignal<
    Readonly<Record<VoiceId, VoiceRenderStyle>>
  >;
  readonly projectStore: ProjectStorePort;
  readonly getActiveVoiceId: () => VoiceId;
  readonly gridResolutionTicks: number;
  readonly defaultNoteDurationTicks: number;
  readonly onTransactionRejected?:
    | ((error: unknown) => void)
    | undefined;
}

export interface PianoRollEventController {
  readonly draft: InteractionDraft;
  readonly selection: InteractionSelection;
  cancel(): void;
  clearSelection(): void;
}

export function usePianoRollEvents(
  options: UsePianoRollEventsOptions,
): PianoRollEventController {
  const {
    overlayRef,
    visualsRef,
    viewport,
    spatialIndex,
    voiceStyles,
    projectStore,
    getActiveVoiceId,
    gridResolutionTicks,
    defaultNoteDurationTicks,
    onTransactionRejected,
  } = options;
  const draftRef = useRef<InteractionDraft | null>(null);
  const selectionRef = useRef<InteractionSelection | null>(null);
  const collisionBufferRef = useRef<Note[] | null>(null);
  const lassoBufferRef = useRef<Note[] | null>(null);
  const converterRef = useRef<CoordinateConverter | null>(null);
  const converterVersionRef = useRef(-1);
  const transactionSequenceRef = useRef(0);

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

  if (converterRef.current === null) {
    converterRef.current = new CoordinateConverter(viewport.get());
    converterVersionRef.current = viewport.version;
  }

  const draft = draftRef.current;
  const selection = selectionRef.current;

  useEffect(() => {
    const overlay = overlayRef.current;
    const converter = converterRef.current;
    const collisionBuffer = collisionBufferRef.current;
    const lassoBuffer = lassoBufferRef.current;

    if (
      overlay === null
      || converter === null
      || collisionBuffer === null
      || lassoBuffer === null
    ) {
      return undefined;
    }

    const updateConverter = (): void => {
      if (converterVersionRef.current !== viewport.version) {
        converter.setViewportState(viewport.get());
        converterVersionRef.current = viewport.version;
      }
    };

    const resetDraft = (): void => {
      draft.mode = "IDLE";
      draft.pointerId = -1;
      draft.deltaTicks = 0;
      draft.deltaPitch = 0;
      draft.additiveSelection = false;
    };

    const clearSelection = (): void => {
      selection.noteIds.clear();
      selection.notes.length = 0;
    };

    const cancelGesture = (): void => {
      if (draft.mode === "DRAGGING") {
        visualsRef.current?.endDrag();
      } else if (draft.mode === "LASSO_SELECTING") {
        visualsRef.current?.endLasso();
      }

      if (
        draft.pointerId >= 0
        && overlay.hasPointerCapture(draft.pointerId)
      ) {
        overlay.releasePointerCapture(draft.pointerId);
      }

      resetDraft();
    };

    const dispatchTransaction = (
      commands: readonly PianoRollCommand[],
      label: string,
    ): boolean => {
      if (commands.length === 0) {
        return false;
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
        projectStore.dispatch(transaction);
        return true;
      } catch (error: unknown) {
        onTransactionRejected?.(error);
        return false;
      }
    };

    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || draft.mode !== "IDLE") {
        return;
      }

      updateConverter();
      overlay.focus({
        preventScroll: true,
      });

      const bounds = overlay.getBoundingClientRect();
      const localX = event.clientX - bounds.left;
      const localY = event.clientY - bounds.top;
      const pointerTick = converter.cssPixelXToTick(localX);
      const pointerPitch = converter.cssPixelYToPitch(localY);
      const hitNote = spatialIndex.queryPoint(
        pointerTick,
        pointerPitch,
      );

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
      draft.additiveSelection = event.shiftKey;
      overlay.setPointerCapture(event.pointerId);

      if (hitNote !== undefined) {
        if (!selection.noteIds.has(hitNote.id)) {
          if (!event.shiftKey) {
            clearSelection();
          }

          selection.noteIds.add(hitNote.id);
          selection.notes.push(hitNote);
        }

        updateSelectedBounds(draft, selection.notes);
        draft.mode = "DRAGGING";
        visualsRef.current?.beginDrag(
          selection.notes,
          converter,
          voiceStyles.get(),
        );
      } else {
        if (!event.shiftKey) {
          clearSelection();
        }

        draft.mode = "LASSO_SELECTING";
        visualsRef.current?.beginLasso(localX, localY);
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

      if (draft.mode === "DRAGGING") {
        const pointerTick = converter.cssPixelXToTick(localX);
        const pointerPitch = converter.cssPixelYToPitch(localY);
        let deltaTicks = quantizeTick(
          pointerTick - draft.originPointerTick,
          gridResolutionTicks,
        );
        let deltaPitch =
          pointerPitch - draft.originPointerPitch;

        if (
          draft.minimumSelectedStartTick + deltaTicks < 0
        ) {
          deltaTicks = -draft.minimumSelectedStartTick;
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
          const deltaY =
            converter.pitchToCssPixelY(deltaPitch)
            - converter.pitchToCssPixelY(0);

          visualsRef.current?.updateDrag(deltaX, deltaY);
        }
      } else {
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

      if (draft.mode === "DRAGGING") {
        const movementIsValid =
          (draft.deltaTicks !== 0 || draft.deltaPitch !== 0)
          && !hasMoveCollision(
            selection,
            draft.deltaTicks,
            draft.deltaPitch,
            spatialIndex,
            collisionBuffer,
          );

        if (movementIsValid) {
          const commands = buildMoveCommands(
            selection.notes,
            draft.deltaTicks,
            draft.deltaPitch,
          );
          const committed = dispatchTransaction(
            commands,
            "Move notes",
          );

          if (committed) {
            clearSelection();
          }
        }

        visualsRef.current?.endDrag();
      } else {
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

        if (!draft.additiveSelection) {
          clearSelection();
        }

        spatialIndex.queryRect(
          minimumTick,
          maximumTick,
          minimumPitch,
          maximumPitch,
          lassoBuffer,
        );

        for (
          let noteIndex = 0;
          noteIndex < lassoBuffer.length;
          noteIndex += 1
        ) {
          const note = lassoBuffer[noteIndex];

          if (
            note !== undefined
            && !selection.noteIds.has(note.id)
          ) {
            selection.noteIds.add(note.id);
            selection.notes.push(note);
          }
        }

        visualsRef.current?.endLasso();
      }

      if (overlay.hasPointerCapture(event.pointerId)) {
        overlay.releasePointerCapture(event.pointerId);
      }

      resetDraft();
      event.preventDefault();
    };

    const handlePointerCancel = (event: PointerEvent): void => {
      if (event.pointerId === draft.pointerId) {
        cancelGesture();
      }
    };

    const handleLostPointerCapture = (
      event: PointerEvent,
    ): void => {
      if (
        event.pointerId === draft.pointerId
        && draft.mode !== "IDLE"
      ) {
        cancelGesture();
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && draft.mode !== "IDLE") {
        cancelGesture();
        event.preventDefault();
        return;
      }

      if (
        event.key === "Backspace"
        && selection.notes.length > 0
      ) {
        const commands = buildDeleteCommands(selection.notes);
        const committed = dispatchTransaction(
          commands,
          "Delete notes",
        );

        if (committed) {
          clearSelection();
        }

        event.preventDefault();
      }
    };

    const handleDoubleClick = (event: MouseEvent): void => {
      updateConverter();

      const bounds = overlay.getBoundingClientRect();
      const localX = event.clientX - bounds.left;
      const localY = event.clientY - bounds.top;
      const voiceId = getActiveVoiceId();
      const startTick = Math.max(
        0,
        quantizeTick(
          converter.cssPixelXToTick(localX),
          gridResolutionTicks,
        ),
      );
      const pitch = converter.cssPixelYToPitch(localY);

      if (pitch < 0 || pitch > 127) {
        return;
      }

      const projectState = projectStore.getState();

      if (
        projectState.tracksByVoiceId[voiceId] === undefined
        || hasVoiceCollision(
          voiceId,
          startTick,
          startTick + defaultNoteDurationTicks,
          pitch,
          spatialIndex,
          collisionBuffer,
        )
      ) {
        return;
      }

      transactionSequenceRef.current += 1;
      const note: Note = {
        id:
          `note-${Date.now()}-${transactionSequenceRef.current}`,
        pitch,
        startTick,
        durationTicks: defaultNoteDurationTicks,
        velocity: 100,
        voiceId,
      };
      const command: PianoRollCommand = {
        type: "AddNotes",
        trackVoiceId: voiceId,
        notes: [note],
      };

      dispatchTransaction([command], "Add note");
      event.preventDefault();
    };

    overlay.addEventListener("pointerdown", handlePointerDown);
    overlay.addEventListener("pointermove", handlePointerMove);
    overlay.addEventListener("pointerup", handlePointerUp);
    overlay.addEventListener("pointercancel", handlePointerCancel);
    overlay.addEventListener(
      "lostpointercapture",
      handleLostPointerCapture,
    );
    overlay.addEventListener("keydown", handleKeyDown);
    overlay.addEventListener("dblclick", handleDoubleClick);

    return (): void => {
      cancelGesture();
      overlay.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
      overlay.removeEventListener(
        "pointermove",
        handlePointerMove,
      );
      overlay.removeEventListener("pointerup", handlePointerUp);
      overlay.removeEventListener(
        "pointercancel",
        handlePointerCancel,
      );
      overlay.removeEventListener(
        "lostpointercapture",
        handleLostPointerCapture,
      );
      overlay.removeEventListener("keydown", handleKeyDown);
      overlay.removeEventListener("dblclick", handleDoubleClick);
    };
  }, [
    defaultNoteDurationTicks,
    draft,
    getActiveVoiceId,
    gridResolutionTicks,
    onTransactionRejected,
    overlayRef,
    projectStore,
    selection,
    spatialIndex,
    viewport,
    visualsRef,
    voiceStyles,
  ]);

  return {
    draft,
    selection,
    cancel(): void {
      const overlay = overlayRef.current;

      if (
        overlay !== null
        && draft.pointerId >= 0
        && overlay.hasPointerCapture(draft.pointerId)
      ) {
        overlay.releasePointerCapture(draft.pointerId);
      }

      visualsRef.current?.endDrag();
      visualsRef.current?.endLasso();
      draft.mode = "IDLE";
      draft.pointerId = -1;
      draft.deltaTicks = 0;
      draft.deltaPitch = 0;
    },
    clearSelection(): void {
      selection.noteIds.clear();
      selection.notes.length = 0;
    },
  };
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

function updateSelectedBounds(
  draft: InteractionDraft,
  notes: readonly Note[],
): void {
  let minimumStartTick = Number.POSITIVE_INFINITY;
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
  draft.minimumSelectedPitch = minimumPitch;
  draft.maximumSelectedPitch = maximumPitch;
}

function hasMoveCollision(
  selection: InteractionSelection,
  deltaTicks: number,
  deltaPitch: number,
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

    const movedStartTick = note.startTick + deltaTicks;
    const movedEndTick = movedStartTick + note.durationTicks;
    const movedPitch = note.pitch + deltaPitch;

    spatialIndex.queryRect(
      movedStartTick,
      movedEndTick,
      movedPitch,
      movedPitch,
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
        && !selection.noteIds.has(candidate.id)
      ) {
        return true;
      }
    }
  }

  return false;
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

function buildMoveCommands(
  notes: readonly Note[],
  deltaTicks: number,
  deltaPitch: number,
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
      type: "MoveNotes",
      sourceVoiceId: note.voiceId,
      targetVoiceId: note.voiceId,
      noteIds,
      deltaTicks,
      deltaPitch,
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
