import {
  useCallback,
} from "react";
import {
  buildDeleteNoteCommands,
  buildSetNotesStatusCommands,
} from "../../use-cases/piano-roll/notes/note-edit-commands";
import {
  buildDeleteSelectedMarkerCommands,
  findNotesByIds,
} from "../../use-cases/piano-roll/selection/selection-edit-plans";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import type {
  NoteId,
} from "../../domain/identifiers";
import type {
  EditorCommandPort,
} from "../../use-cases/commands/editor-command-service";
import type {
  PianoRollControllerPort,
} from "../../editor/interactions/piano-roll-controller-port";
import type {
  EditorSelection,
} from "../../editor/selection/editor-selection";
import type { Note, NoteStatus } from "../../domain/notes/note";

export interface PianoRollSelectionCommands {
  readonly undo: () => void;
  readonly redo: () => void;
  readonly remove: () => void;
  readonly toggleFrozen: () => void;
}

/** Owns history and direct commands for the current note selection. */
export function usePianoRollSelectionCommands(
  commands: EditorCommandPort,
  selection: EditorSelection,
  getController: () => PianoRollControllerPort | null,
): PianoRollSelectionCommands {
  const prepareHistoryNavigation = useCallback((): PianoRollControllerPort | null => {
    const controller = getController();

    controller?.cancel();
    return controller;
  }, [getController]);
  const undo = useCallback((): void => {
    const controller = prepareHistoryNavigation();

    commands.undo();
    controller?.refreshSelection();
  }, [commands, prepareHistoryNavigation]);
  const redo = useCallback((): void => {
    const controller = prepareHistoryNavigation();

    commands.redo();
    controller?.refreshSelection();
  }, [commands, prepareHistoryNavigation]);
  const remove = useCallback((): void => {
    const controller = getController();
    const notes = controller?.getSelectedNotes() ?? [];
    const markerGroups = selection.markerGroups;
    const state = commands.getState();
    const clipId = getActiveClip(state).id;
    const deleteCommands = [
      ...buildDeleteNoteCommands(clipId, notes),
      ...buildDeleteSelectedMarkerCommands(clipId, markerGroups),
    ];

    if (
      deleteCommands.length > 0
      && commands.dispatch(
        deleteCommands,
        notes.length > 0 && markerGroups.length > 0
          ? "Delete timeline selection"
          : markerGroups.length > 0
            ? "Delete markers"
            : "Delete notes",
        {
          clipId,
          noteIds: [],
          markerGroups: [],
        },
      ) !== null
    ) {
      controller?.clearSelection();
    }
  }, [commands, getController, selection]);
  const toggleFrozen = useCallback((): void => {
    const controller = getController();
    const notes = controller?.getSelectedNotes() ?? [];

    if (controller === null || notes.length === 0) {
      return;
    }

    const targetStatus = getFrozenToggleStatus(notes);
    const clipId = getActiveClip(commands.getState()).id;
    const nextState = commands.dispatch(
      buildSetNotesStatusCommands(
        clipId,
        notes,
        targetStatus,
      ),
      targetStatus === "frozen"
        ? "Freeze selected notes"
        : "Unfreeze selected notes",
      { clipId, noteIds: notes.map((note) => note.id) },
    );

    if (nextState !== null) {
      const noteIds: NoteId[] = notes.map((note) => note.id);

      controller.replaceSelection(
        findNotesByIds(nextState, clipId, noteIds),
      );
    }
  }, [commands, getController]);

  return { undo, redo, remove, toggleFrozen };
}

export function getFrozenToggleStatus(
  notes: readonly Pick<Note, "status">[],
): Extract<NoteStatus, "active" | "frozen"> {
  return notes.every((note) => note.status === "frozen")
    ? "active"
    : "frozen";
}
