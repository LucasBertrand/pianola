import {
  useCallback,
  useRef,
  useState,
} from "react";
import type {
  EditorCommandPort,
} from "../../use-cases/commands/editor-command-service";
import {
  buildAddNoteCommands,
  buildDeleteNoteCommands,
  buildSetNotesEnabledCommands,
} from "../../use-cases/notes/note-edit-commands";
import type {
  NoteCollisionResolutionRequest,
} from "../../use-cases/notes/note-collision-resolution";
import {
  buildSliceCommandsForNotes,
  buildTransformCommandsForNotes,
  canPlacePastedNotes,
  createPastedNotes,
  createInstrumentTransferPlan,
  findNotesByIds,
  getRequiredMeasureCountForNotes,
  type PianoRollClipboard,
} from "../../use-cases/selection/selection-edit-plans";
import {
  CommandRejectedError,
} from "../../domain/commands/command-errors";
import {
  getActiveClip,
  getClipMeasureCount,
  type Note,
  type NoteId,
  type InstrumentId,
} from "../../domain/model";
import {
  countNoteEditCollisions,
  hasNoteEditCollisions,
} from "../../domain/note-collision";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import {
  SelectionTransformationError,
  type SelectionTransformationKind,
} from "../../domain/selection-transformations";
import {
  createTargetedNoteTransformationPlan,
} from "../../domain/targeted-note-transformations";
import type {
  PianoRollControllerPort,
} from "../../editor/interactions/piano-roll-controller-port";
import type {
  ShowApplicationAlert,
} from "../../use-cases/dialogs/application-dialog-port";

export interface SelectionWorkflowOptions {
  readonly commands: EditorCommandPort;
  readonly projectStore: ProjectStorePort;
  readonly getController: () => PianoRollControllerPort | null;
  readonly getPlayheadTick: () => number;
  readonly setPlayheadTick: (tick: number) => void;
  readonly getGridResolutionTicks: () => number;
  readonly resolveCollision: (
    request: NoteCollisionResolutionRequest,
  ) => void;
  readonly alert: ShowApplicationAlert;
}

export interface SelectionWorkflow {
  readonly clipboardAvailable: boolean;
  readonly clearClipboard: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly copy: () => void;
  readonly cut: () => void;
  readonly remove: () => void;
  readonly toggleEnabled: () => void;
  readonly transform: (
    kind: SelectionTransformationKind,
    label: string,
  ) => void;
  readonly sliceAtPlayhead: () => void;
  readonly paste: () => void;
  readonly transferToInstrument: (instrumentId: InstrumentId) => void;
}

export function useSelectionWorkflow({
  commands,
  projectStore,
  getController,
  getPlayheadTick,
  setPlayheadTick,
  getGridResolutionTicks,
  resolveCollision,
  alert,
}: SelectionWorkflowOptions): SelectionWorkflow {
  const clipboardRef = useRef<PianoRollClipboard | null>(null);
  const sequenceRef = useRef(0);
  const [clipboardAvailable, setClipboardAvailable] = useState(false);

  const nextSequence = useCallback((): number => {
    sequenceRef.current += 1;
    return sequenceRef.current;
  }, []);

  const clearClipboard = useCallback((): void => {
    clipboardRef.current = null;
    setClipboardAvailable(false);
  }, []);

  const clearInteraction = useCallback((): void => {
    const controller = getController();

    controller?.cancel();
    controller?.clearSelection();
  }, [getController]);

  const undo = useCallback((): void => {
    clearInteraction();
    projectStore.undo();
  }, [clearInteraction, projectStore]);

  const redo = useCallback((): void => {
    clearInteraction();
    projectStore.redo();
  }, [clearInteraction, projectStore]);

  const copyCurrentSelection = useCallback(
    (): PianoRollClipboard | null => {
      const notes = getController()?.getSelectedNotes() ?? [];

      if (notes.length === 0) {
        return null;
      }

      let originTick = Number.POSITIVE_INFINITY;

      for (let index = 0; index < notes.length; index += 1) {
        const note = notes[index];

        if (note !== undefined && note.startTick < originTick) {
          originTick = note.startTick;
        }
      }

      if (!Number.isFinite(originTick)) {
        return null;
      }

      const clipboard: PianoRollClipboard = {
        notes,
        originTick,
      };

      clipboardRef.current = clipboard;
      setClipboardAvailable(true);
      return clipboard;
    },
    [getController],
  );

  const copy = useCallback((): void => {
    copyCurrentSelection();
  }, [copyCurrentSelection]);

  const cut = useCallback((): void => {
    const clipboard = copyCurrentSelection();

    if (clipboard === null) {
      return;
    }

    if (
      commands.dispatch(
        buildDeleteNoteCommands(
          getActiveClip(commands.getState()).id,
          clipboard.notes,
        ),
        "Cut notes",
      ) !== null
    ) {
      getController()?.clearSelection();
    }
  }, [commands, copyCurrentSelection, getController]);

  const remove = useCallback((): void => {
    const controller = getController();
    const notes = controller?.getSelectedNotes() ?? [];

    if (notes.length === 0) {
      return;
    }

    if (
      commands.dispatch(
        buildDeleteNoteCommands(
          getActiveClip(commands.getState()).id,
          notes,
        ),
        "Delete notes",
      ) !== null
    ) {
      controller?.clearSelection();
    }
  }, [commands, getController]);

  const toggleEnabled = useCallback((): void => {
    const controller = getController();
    const notes = controller?.getSelectedNotes() ?? [];

    if (controller === null || notes.length === 0) {
      return;
    }

    let enableNotes = true;

    for (const note of notes) {
      if (note.enabled) {
        enableNotes = false;
        break;
      }
    }

    const clipId = getActiveClip(commands.getState()).id;
    const nextState = commands.dispatch(
      buildSetNotesEnabledCommands(
        clipId,
        notes,
        enableNotes,
      ),
      enableNotes
        ? "Enable selected notes"
        : "Disable selected notes",
    );

    if (nextState !== null) {
      const noteIds: NoteId[] = [];

      for (const note of notes) {
        noteIds.push(note.id);
      }

      controller.replaceSelection(
        findNotesByIds(nextState, clipId, noteIds),
      );
    }
  }, [commands, getController]);

  const transform = useCallback(
    (
      kind: SelectionTransformationKind,
      label: string,
    ): void => {
      const controller = getController();
      const originalNotes = controller?.getSelectedNotes() ?? [];

      if (controller === null || originalNotes.length === 0) {
        return;
      }

      const state = commands.getState();
      const activeClip = getActiveClip(state);

      for (const note of originalNotes) {
        const instrument = state.projectInstrumentsById[note.instrumentId];

        if (
          instrument === undefined
          || activeClip.instrumentStatesById[note.instrumentId]?.locked !== false
        ) {
          alert(
            "Transformation unavailable",
            instrument === undefined
              ? "The selection contains a note whose instrument is unavailable."
              : `Unlock instrument "${instrument.name}" before transforming its notes.`,
          );
          return;
        }
      }

      try {
        const proposedNotes = createTargetedNoteTransformationPlan(
          {
            sourceKind: "clip",
            sourceId: activeClip.id,
            durationTicks: activeClip.timeline.durationTicks,
          },
          originalNotes,
          kind,
        ).notes;
        const intent = {
          originalNotes,
          proposedNotes,
        } as const;

        if (hasNoteEditCollisions(state, activeClip.id, intent)) {
          resolveCollision({
            clipId: activeClip.id,
            label,
            collisionCount: countNoteEditCollisions(
              state,
              activeClip.id,
              intent,
            ),
            ...intent,
            onResolved(nextState, selectedNoteIds): void {
              controller.replaceSelection(
                findNotesByIds(
                  nextState,
                  activeClip.id,
                  selectedNoteIds,
                ),
              );
            },
          });
          return;
        }

        const nextState = commands.dispatch(
          buildTransformCommandsForNotes(activeClip.id, proposedNotes),
          label,
        );

        if (nextState !== null) {
          const noteIds: NoteId[] = [];

          for (const note of proposedNotes) {
            noteIds.push(note.id);
          }
          controller.replaceSelection(
            findNotesByIds(nextState, activeClip.id, noteIds),
          );
        }
      } catch (error: unknown) {
        alert(
          "Transformation unavailable",
          error instanceof SelectionTransformationError
            || error instanceof CommandRejectedError
            ? error.message
            : "The selected notes could not be transformed.",
          "danger",
        );
      }
    },
    [alert, commands, getController, resolveCollision],
  );

  const sliceAtPlayhead = useCallback((): void => {
    const controller = getController();
    const selectedNotes = controller?.getSelectedNotes() ?? [];

    if (controller === null || selectedNotes.length === 0) {
      return;
    }

    const clipId = getActiveClip(commands.getState()).id;
    const plan = buildSliceCommandsForNotes(
      clipId,
      selectedNotes,
      Math.round(getPlayheadTick()),
      Date.now(),
      nextSequence(),
    );

    if (plan.commands.length === 0) {
      alert(
        "Slice unavailable",
        "The playhead must cross the interior of at least one selected note.",
      );
      return;
    }

    try {
      const nextState = commands.dispatch(
        plan.commands,
        "Slice selected notes at playhead",
      );

      if (nextState !== null) {
        controller.replaceSelection(
          findNotesByIds(nextState, clipId, plan.resultingNoteIds),
        );
      }
    } catch (error: unknown) {
      alert(
        "Slice unavailable",
        error instanceof CommandRejectedError
          ? error.message
          : "The selected notes could not be sliced.",
        "danger",
      );
    }
  }, [alert, commands, getController, getPlayheadTick, nextSequence]);

  const paste = useCallback((): void => {
    const clipboard = clipboardRef.current;

    if (clipboard === null) {
      return;
    }

    const resolutionTicks = getGridResolutionTicks();
    const pasteTick =
      Math.round(getPlayheadTick() / resolutionTicks)
      * resolutionTicks;
    const pastedNotes = createPastedNotes(
      clipboard,
      pasteTick,
      Date.now(),
      nextSequence(),
    );
    const state = commands.getState();
    const activeClip = getActiveClip(state);
    const requiredMeasureCount =
      getRequiredMeasureCountForNotes(
        state,
        activeClip.id,
        pastedNotes,
      );
    const currentMeasureCount = getClipMeasureCount(
      state.clock,
      activeClip,
    );
    const timelineCommands =
      requiredMeasureCount > currentMeasureCount
        ? [{
            type: "AppendMeasures" as const,
            clipId: activeClip.id,
            count: requiredMeasureCount - currentMeasureCount,
          }]
        : [];

    if (!canPlacePastedNotes(state, activeClip.id, pastedNotes)) {
      alert(
        "Paste unavailable",
        "Paste is unavailable because it exceeds the clip limit or targets an unavailable or locked instrument.",
      );
      return;
    }

    const intent = {
      originalNotes: [],
      proposedNotes: pastedNotes,
    } as const;

    if (hasNoteEditCollisions(state, activeClip.id, intent)) {
      resolveCollision({
        clipId: activeClip.id,
        label: "Paste notes",
        collisionCount: countNoteEditCollisions(
          state,
          activeClip.id,
          intent,
        ),
        ...intent,
        prefixCommands: timelineCommands,
        onResolved(nextState, selectedNoteIds): void {
          const resolvedNotes = findNotesByIds(
            nextState,
            activeClip.id,
            selectedNoteIds,
          );

          getController()?.replaceSelection(resolvedNotes);
          movePlayheadToSelectionEnd(resolvedNotes, setPlayheadTick);
        },
      });
      return;
    }

    const nextState = commands.dispatch(
      [
        ...timelineCommands,
        ...buildAddNoteCommands(activeClip.id, pastedNotes),
      ],
      "Paste notes",
    );

    if (nextState === null) {
      return;
    }

    const selectedPastedNotes: Note[] = [];
    const nextClip = getActiveClip(nextState);

    for (const pastedNote of pastedNotes) {
      const storedNote =
        nextClip.tracksByInstrumentId[pastedNote.instrumentId]
          ?.notesById[pastedNote.id];

      if (storedNote !== undefined) {
        selectedPastedNotes.push(storedNote);
      }
    }

    getController()?.replaceSelection(selectedPastedNotes);
    movePlayheadToSelectionEnd(selectedPastedNotes, setPlayheadTick);
  }, [
    alert,
    commands,
    getController,
    getGridResolutionTicks,
    getPlayheadTick,
    nextSequence,
    resolveCollision,
    setPlayheadTick,
  ]);

  const transferToInstrument = useCallback((
    targetInstrumentId: InstrumentId,
  ): void => {
    const controller = getController();

    if (controller === null) {
      return;
    }

    const selectedNotes = controller.getSelectedNotes();
    const state = commands.getState();
    const activeClip = getActiveClip(state);
    const transferPlan = createInstrumentTransferPlan(
      state,
      activeClip.id,
      selectedNotes,
      targetInstrumentId,
    );

    if (!transferPlan.valid) {
      alert("Transfer unavailable", transferPlan.message);
      return;
    }

    if (transferPlan.commands.length === 0) {
      return;
    }

    const intent = {
      originalNotes: transferPlan.originalNotes,
      proposedNotes: transferPlan.proposedNotes,
    };
    if (hasNoteEditCollisions(state, activeClip.id, intent)) {
      const retainedTargetNoteIds: NoteId[] = [];

      for (const note of selectedNotes) {
        if (note.instrumentId === targetInstrumentId) {
          retainedTargetNoteIds.push(note.id);
        }
      }

      resolveCollision({
        clipId: activeClip.id,
        label: "Transfer notes to instrument",
        collisionCount: countNoteEditCollisions(
          state,
          activeClip.id,
          intent,
        ),
        ...intent,
        onResolved(nextState, selectedNoteIds): void {
          controller.replaceSelection(
            findNotesByIds(
              nextState,
              activeClip.id,
              selectedNoteIds.concat(retainedTargetNoteIds),
            ),
          );
        },
      });
      return;
    }

    try {
      const nextState = commands.dispatch(
        transferPlan.commands,
        "Transfer notes to instrument",
      );

      if (nextState === null) {
        return;
      }

      const targetTrack = getActiveClip(nextState)
        .tracksByInstrumentId[targetInstrumentId];
      const nextSelection: Note[] = [];

      if (targetTrack !== undefined) {
        for (const note of selectedNotes) {
          const transferredNote = targetTrack.notesById[note.id];

          if (transferredNote !== undefined) {
            nextSelection.push(transferredNote);
          }
        }
      }

      controller.replaceSelection(nextSelection);
    } catch (error: unknown) {
      alert(
        "Transfer cancelled",
        error instanceof CommandRejectedError
          ? error.message
          : "The selected notes could not be transferred.",
        "danger",
      );
    }
  }, [
    alert,
    commands,
    getController,
    resolveCollision,
  ]);

  return {
    clipboardAvailable,
    clearClipboard,
    undo,
    redo,
    copy,
    cut,
    remove,
    toggleEnabled,
    transform,
    sliceAtPlayhead,
    paste,
    transferToInstrument,
  };
}

function movePlayheadToSelectionEnd(
  notes: readonly Note[],
  setPlayheadTick: (tick: number) => void,
): void {
  let endTick = -1;

  for (const note of notes) {
    endTick = Math.max(endTick, note.startTick + note.durationTicks);
  }

  if (endTick >= 0) {
    setPlayheadTick(endTick);
  }
}
