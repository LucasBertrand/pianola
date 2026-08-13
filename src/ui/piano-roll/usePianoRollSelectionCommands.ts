import {
  useCallback,
} from "react";
import {
  buildDeleteNoteCommands,
  buildSetNotesEnabledCommands,
} from "../../use-cases/piano-roll/notes/note-edit-commands";
import {
  findNotesByIds,
} from "../../use-cases/piano-roll/selection/selection-edit-plans";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import type {
  NoteId,
} from "../../domain/identifiers";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  EditorCommandPort,
} from "../../use-cases/commands/editor-command-service";
import type {
  PianoRollControllerPort,
} from "../../editor/interactions/piano-roll-controller-port";

export interface PianoRollSelectionCommands {
  readonly undo: () => void;
  readonly redo: () => void;
  readonly remove: () => void;
  readonly toggleEnabled: () => void;
}

/** Owns history and direct commands for the current note selection. */
export function usePianoRollSelectionCommands(
  commands: EditorCommandPort,
  projectStore: ProjectStorePort,
  getController: () => PianoRollControllerPort | null,
): PianoRollSelectionCommands {
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
  const remove = useCallback((): void => {
    const controller = getController();
    const notes = controller?.getSelectedNotes() ?? [];

    if (
      notes.length > 0
      && commands.dispatch(
        buildDeleteNoteCommands(getActiveClip(commands.getState()).id, notes),
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

    const enableNotes = !notes.some((note) => note.enabled);
    const clipId = getActiveClip(commands.getState()).id;
    const nextState = commands.dispatch(
      buildSetNotesEnabledCommands(clipId, notes, enableNotes),
      enableNotes ? "Enable selected notes" : "Disable selected notes",
    );

    if (nextState !== null) {
      const noteIds: NoteId[] = notes.map((note) => note.id);

      controller.replaceSelection(
        findNotesByIds(nextState, clipId, noteIds),
      );
    }
  }, [commands, getController]);

  return { undo, redo, remove, toggleEnabled };
}
