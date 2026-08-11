import type {
  PianoRollCommand,
} from "../domain/commands";
import type {
  Note,
  NoteId,
  ProjectState,
} from "../domain/model";
import {
  getActiveClipInstrumentState,
} from "../domain/model";
import {
  countNoteEditCollisions,
} from "../domain/note-collision";
import type {
  NoteCollisionResolutionRequest,
} from "./note-collision-resolution";
import type {
  EditorCommandPort,
} from "./editor-command-service";
import {
  type EditorSelection,
} from "./editor-selection";
import {
  buildAddNoteCommands,
  buildDeleteNoteCommands,
  buildRepositionNoteCommands,
  buildResizeNoteCommands,
  resizeNotes,
  type NoteResizeEdge,
} from "./note-edit-commands";

export type NoteGestureCommitResult =
  | "unchanged"
  | "committed"
  | "collision"
  | "rejected";

export interface NoteGestureWorkflowCallbacks {
  readonly onCollision:
    | ((request: NoteCollisionResolutionRequest) => void)
    | undefined;
  readonly onTransactionRejected:
    | ((error: unknown) => void)
    | undefined;
  readonly onSelectionChanged: (() => void) | undefined;
}

interface CommitNoteEditOptions {
  readonly originalNotes: readonly Note[];
  readonly proposedNotes: readonly Note[];
  readonly commands: readonly PianoRollCommand[];
  readonly label: string;
  readonly selectionAfterCommit: "reconcile" | "proposed";
}

/**
 * Validates and commits completed note gestures at the application boundary.
 * Pointer adapters only describe the proposed edit; this workflow owns the
 * collision protocol, transaction dispatch and selection reconciliation.
 */
export class NoteGestureWorkflow {
  public constructor(
    private readonly commands: EditorCommandPort,
    private readonly selection: EditorSelection,
    private readonly callbacks: NoteGestureWorkflowCallbacks,
  ) {}

  public commitMove(
    proposedNotes: readonly Note[],
  ): NoteGestureCommitResult {
    const originalNotes = this.selection.copyNotes();

    if (!hasChangedPosition(originalNotes, proposedNotes)) {
      return "unchanged";
    }

    return this.commitNoteEdit({
      originalNotes,
      proposedNotes,
      commands: buildRepositionNoteCommands(proposedNotes),
      label: "Move notes",
      selectionAfterCommit: "reconcile",
    });
  }

  public commitResize(
    deltaTicks: number,
    edge: NoteResizeEdge,
  ): NoteGestureCommitResult {
    if (deltaTicks === 0) {
      return "unchanged";
    }

    const originalNotes = this.selection.copyNotes();
    const proposedNotes = resizeNotes(
      originalNotes,
      deltaTicks,
      edge,
    );

    return this.commitNoteEdit({
      originalNotes,
      proposedNotes,
      commands: buildResizeNoteCommands(
        originalNotes,
        deltaTicks,
        edge,
      ),
      label: "Resize notes",
      selectionAfterCommit: "reconcile",
    });
  }

  public commitDraw(note: Note): NoteGestureCommitResult {
    return this.commitNoteEdit({
      originalNotes: [],
      proposedNotes: [note],
      commands: buildAddNoteCommands([note]),
      label: "Draw note",
      selectionAfterCommit: "proposed",
    });
  }

  public commitDelete(
    notes: readonly Note[],
    label: string,
  ): NoteGestureCommitResult {
    if (notes.length === 0) {
      return "unchanged";
    }

    let nextState: ProjectState | null;

    try {
      nextState = this.commands.dispatch(
        buildDeleteNoteCommands(notes),
        label,
      );
    } catch (error: unknown) {
      this.callbacks.onTransactionRejected?.(error);
      return "rejected";
    }

    if (nextState === null) {
      return "unchanged";
    }

    this.selection.clear();
    return "committed";
  }

  private commitNoteEdit(
    options: CommitNoteEditOptions,
  ): NoteGestureCommitResult {
    const state = this.commands.getState();
    const collisionCount = countNoteEditCollisions(state, options);

    if (collisionCount > 0) {
      const originalNotes = options.originalNotes.slice();
      const proposedNotes = options.proposedNotes.slice();

      this.callbacks.onCollision?.({
        label: options.label,
        collisionCount,
        originalNotes,
        proposedNotes,
        onResolved: (
          resolvedState,
          selectedNoteIds,
        ): void => {
          this.selection.replaceFromNoteIds(
            resolvedState,
            selectedNoteIds,
            (note) => isNoteEditable(resolvedState, note),
          );
          this.callbacks.onSelectionChanged?.();
        },
      });

      return "collision";
    }

    let nextState: ProjectState | null;

    try {
      nextState = this.commands.dispatch(
        options.commands,
        options.label,
      );
    } catch (error: unknown) {
      this.callbacks.onTransactionRejected?.(error);
      return "rejected";
    }

    if (nextState === null) {
      return "unchanged";
    }

    if (options.selectionAfterCommit === "proposed") {
      this.selection.replaceFromNoteIds(
        nextState,
        collectNoteIds(options.proposedNotes),
        (note) => isNoteEditable(nextState, note),
      );
    } else {
      this.selection.reconcile(
        nextState,
        (note) => isNoteEditable(nextState, note),
      );
    }

    return "committed";
  }
}

function isNoteEditable(state: ProjectState, note: Note): boolean {
  return getActiveClipInstrumentState(state, note.instrumentId)?.locked === false;
}

function collectNoteIds(notes: readonly Note[]): readonly NoteId[] {
  const noteIds: NoteId[] = [];

  for (const note of notes) {
    noteIds.push(note.id);
  }

  return noteIds;
}

function hasChangedPosition(
  originalNotes: readonly Note[],
  proposedNotes: readonly Note[],
): boolean {
  if (originalNotes.length !== proposedNotes.length) {
    return true;
  }

  for (
    let noteIndex = 0;
    noteIndex < originalNotes.length;
    noteIndex += 1
  ) {
    const originalNote = originalNotes[noteIndex];
    const proposedNote = proposedNotes[noteIndex];

    if (
      originalNote === undefined
      || proposedNote === undefined
      || originalNote.id !== proposedNote.id
      || originalNote.startTick !== proposedNote.startTick
      || originalNote.pitch !== proposedNote.pitch
    ) {
      return true;
    }
  }

  return false;
}
