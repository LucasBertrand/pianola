import {
  useCallback,
  useRef,
} from "react";
import type {
  EditorCommandPort,
} from "../../use-cases/commands/editor-command-service";
import {
  buildAddNoteCommands,
  buildDeleteNoteCommands,
} from "../../use-cases/piano-roll/notes/note-edit-commands";
import type {
  NoteCollisionResolutionRequest,
} from "../../use-cases/piano-roll/notes/note-collision-resolution";
import {
  buildSliceCommandsForNotes,
  buildTransformCommandsForNotes,
  canPlacePastedNotes,
  createPastedNotes,
  findNotesByIds,
  getRequiredMeasureCountForNotes,
} from "../../use-cases/piano-roll/selection/selection-edit-plans";
import {
  CommandRejectedError,
} from "../../domain/commands/command-errors";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import {
  getClipMeasureCount,
} from "../../domain/clips/clip";
import {
  type Note,
} from "../../domain/notes/note";
import {
  type NoteId,
  type InstrumentId,
} from "../../domain/identifiers";
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
import {
  usePianoRollClipboard,
} from "./usePianoRollClipboard";
import {
  usePianoRollSelectionCommands,
} from "./usePianoRollSelectionCommands";
import {
  usePianoRollInstrumentTransfer,
} from "./usePianoRollInstrumentTransfer";

export interface PianoRollSelectionWorkflowOptions {
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

export interface PianoRollSelectionWorkflow {
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

export function usePianoRollSelectionWorkflow({
  commands,
  projectStore,
  getController,
  getPlayheadTick,
  setPlayheadTick,
  getGridResolutionTicks,
  resolveCollision,
  alert,
}: PianoRollSelectionWorkflowOptions): PianoRollSelectionWorkflow {
  const sequenceRef = useRef(0);
  const {
    available: clipboardAvailable,
    get: getClipboard,
    copySelection: copyCurrentSelection,
    copy,
    clear: clearClipboard,
  } = usePianoRollClipboard(getController);
  const {
    undo,
    redo,
    remove,
    toggleEnabled,
  } = usePianoRollSelectionCommands(
    commands,
    projectStore,
    getController,
  );
  const transferToInstrument = usePianoRollInstrumentTransfer({
    commands,
    getController,
    resolveCollision,
    alert,
  });

  const nextSequence = useCallback((): number => {
    sequenceRef.current += 1;
    return sequenceRef.current;
  }, []);

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
    const clipboard = getClipboard();

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
    getClipboard,
    getPlayheadTick,
    nextSequence,
    resolveCollision,
    setPlayheadTick,
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
