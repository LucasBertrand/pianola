import {
  useCallback,
} from "react";
import type {
  InstrumentId,
} from "../../domain/identifiers";
import { isNoteEditable } from "../../domain/notes/note";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import {
  CommandRejectedError,
} from "../../domain/commands/command-errors";
import {
  countNoteEditCollisions,
  hasNoteEditCollisions,
} from "../../domain/note-collision";
import type {
  ShowApplicationAlert,
} from "../../use-cases/dialogs/application-dialog-port";
import type {
  EditorCommandPort,
} from "../../application/history/editor-command-service";
import type {
  NoteCollisionResolutionRequest,
} from "../../use-cases/piano-roll/notes/note-collision-resolution";
import {
  createInstrumentTransferPlan,
  findNotesByIds,
} from "../../use-cases/piano-roll/selection/selection-edit-plans";
import type {
  PianoRollControllerPort,
} from "../../editor/interactions/piano-roll-controller-port";

export interface PianoRollInstrumentTransferOptions {
  readonly commands: EditorCommandPort;
  readonly getController: () => PianoRollControllerPort | null;
  readonly resolveCollision: (request: NoteCollisionResolutionRequest) => void;
  readonly alert: ShowApplicationAlert;
}

/** Moves the current selection to another instrument as one user intention. */
export function usePianoRollInstrumentTransfer({
  commands,
  getController,
  resolveCollision,
  alert,
}: PianoRollInstrumentTransferOptions): (
  targetInstrumentId: InstrumentId,
) => void {
  return useCallback((targetInstrumentId: InstrumentId): void => {
    const controller = getController();

    if (controller === null) {
      return;
    }

    const selectedNotes = controller.getSelectedNotes();
    const editableNotes = selectedNotes.filter(isNoteEditable);
    const retainedNoteIds = selectedNotes
      .filter(
        (note) => !isNoteEditable(note)
          || note.instrumentId === targetInstrumentId,
      )
      .map((note) => note.id);
    const state = commands.getState();
    const activeClip = getActiveClip(state);
    const transferPlan = createInstrumentTransferPlan(
      state,
      activeClip.id,
      editableNotes,
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
      resolveCollision({
        clipId: activeClip.id,
        label: "Transfer notes to instrument",
        collisionCount: countNoteEditCollisions(
          state,
          activeClip.id,
          intent,
        ),
        ...intent,
        retainedSelectionNoteIds: retainedNoteIds,
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

    try {
      const nextState = commands.dispatch(
        transferPlan.commands,
        "Transfer notes to instrument",
        {
          clipId: activeClip.id,
          noteIds: selectedNotes.map((note) => note.id),
        },
      );

      if (nextState === null) {
        return;
      }

      controller.replaceSelection(
        findNotesByIds(
          nextState,
          activeClip.id,
          selectedNotes.map((note) => note.id),
        ),
      );
    } catch (error: unknown) {
      alert(
        "Transfer cancelled",
        error instanceof CommandRejectedError
          ? error.message
          : "The selected notes could not be transferred.",
        "danger",
      );
    }
  }, [alert, commands, getController, resolveCollision]);
}
