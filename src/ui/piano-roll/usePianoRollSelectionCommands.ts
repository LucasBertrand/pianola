import {
  useCallback,
} from "react";
import {
  buildDeleteNoteCommands,
  buildSetNotesMutedCommands,
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
import {
  isNoteEditable,
  type Note,
} from "../../domain/notes/note";

export interface PianoRollSelectionCommands {
  readonly undo: () => void;
  readonly redo: () => void;
  readonly remove: () => void;
  readonly toggleMute: () => void;
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
    const selectedNotes = controller?.getSelectedNotes() ?? [];
    const editableNotes = selectedNotes.filter(isNoteEditable);
    const retainedNoteIds = selectedNotes
      .filter((note) => !isNoteEditable(note))
      .map((note) => note.id);
    const markerGroups = selection.markerGroups;
    const state = commands.getState();
    const clipId = getActiveClip(state).id;
    const deleteCommands = [
      ...buildDeleteNoteCommands(clipId, editableNotes),
      ...buildDeleteSelectedMarkerCommands(clipId, markerGroups),
    ];

    if (
      deleteCommands.length > 0
      && commands.dispatch(
        deleteCommands,
        editableNotes.length > 0 && markerGroups.length > 0
          ? "Delete timeline selection"
          : markerGroups.length > 0
            ? "Delete markers"
            : "Delete notes",
        {
          clipId,
          noteIds: retainedNoteIds,
          markerGroups: [],
        },
      ) !== null
    ) {
      controller?.replaceSelection(
        findNotesByIds(commands.getState(), clipId, retainedNoteIds),
      );
    }
  }, [commands, getController, selection]);
  const toggleMute = useCallback((): void => {
    const controller = getController();
    const notes = controller?.getSelectedNotes() ?? [];

    if (controller === null || notes.length === 0) {
      return;
    }

    const muted = getMuteToggleValue(notes);
    const clipId = getActiveClip(commands.getState()).id;
    const nextState = commands.dispatch(
      buildSetNotesMutedCommands(clipId, notes, muted),
      muted ? "Mute selected notes" : "Unmute selected notes",
      { clipId, noteIds: notes.map((note) => note.id) },
    );

    if (nextState !== null) {
      const noteIds: NoteId[] = notes.map((note) => note.id);

      controller.replaceSelection(
        findNotesByIds(nextState, clipId, noteIds),
      );
    }
  }, [commands, getController]);

  return { undo, redo, remove, toggleMute };
}

export function getMuteToggleValue(
  notes: readonly Pick<Note, "muted">[],
): boolean {
  return !notes.every((note) => note.muted);
}
