import type {
  PianoRollCommand,
} from "../../domain/commands/command-types";
import type {
  Note,
  NoteId,
  ClipId,
  ProjectState,
} from "../../domain/model";
import {
  getActiveClip,
  getClip,
} from "../../domain/model";
import {
  countNoteEditCollisions,
} from "../../domain/note-collision";
import type {
  NoteCollisionResolutionRequest,
} from "./note-collision-resolution";
import type {
  EditorCommandPort,
} from "../commands/editor-command-service";
import {
  type EditorSelection,
} from "../../editor/selection/editor-selection";
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
  readonly clipId: ClipId;
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
    const clipId = getActiveClip(this.commands.getState()).id;

    if (!hasChangedPosition(originalNotes, proposedNotes)) {
      return "unchanged";
    }

    return this.commitNoteEdit({
      clipId,
      originalNotes,
      proposedNotes,
      commands: buildRepositionNoteCommands(clipId, proposedNotes),
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
    const clipId = getActiveClip(this.commands.getState()).id;
    const proposedNotes = resizeNotes(
      originalNotes,
      deltaTicks,
      edge,
    );

    return this.commitNoteEdit({
      clipId,
      originalNotes,
      proposedNotes,
      commands: buildResizeNoteCommands(
        clipId,
        originalNotes,
        deltaTicks,
        edge,
      ),
      label: "Resize notes",
      selectionAfterCommit: "reconcile",
    });
  }

  public commitDraw(note: Note): NoteGestureCommitResult {
    const clipId = getActiveClip(this.commands.getState()).id;

    return this.commitNoteEdit({
      clipId,
      originalNotes: [],
      proposedNotes: [note],
      commands: buildAddNoteCommands(clipId, [note]),
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
      const clipId = getActiveClip(this.commands.getState()).id;

      nextState = this.commands.dispatch(
        buildDeleteNoteCommands(clipId, notes),
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
    const collisionCount = countNoteEditCollisions(
      state,
      options.clipId,
      options,
    );

    if (collisionCount > 0) {
      const originalNotes = options.originalNotes.slice();
      const proposedNotes = options.proposedNotes.slice();

      this.callbacks.onCollision?.({
        clipId: options.clipId,
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
            (note) => isNoteEditable(
              resolvedState,
              options.clipId,
              note,
            ),
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
        (note) => isNoteEditable(nextState, options.clipId, note),
      );
    } else {
      this.selection.reconcile(
        nextState,
        (note) => isNoteEditable(nextState, options.clipId, note),
      );
    }

    return "committed";
  }
}

function isNoteEditable(
  state: ProjectState,
  clipId: ClipId,
  note: Note,
): boolean {
  return getClip(state, clipId).instrumentStatesById[note.instrumentId]
    ?.locked === false;
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
