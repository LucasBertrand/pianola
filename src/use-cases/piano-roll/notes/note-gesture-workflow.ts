import type {
  PianoRollCommand,
} from "../../../domain/commands/command-types";
import {
  isNoteEditable as isEditableNote,
  type Note,
} from "../../../domain/notes/note";
import {
  type NoteId,
  type ClipId,
} from "../../../domain/identifiers";
import {
  type ProjectState,
} from "../../../domain/project/project-document";
import {
  getActiveClip,
  getClip,
} from "../../../domain/project/project-document";
import {
  countNoteEditCollisions,
} from "../../../domain/note-collision";
import type {
  NoteCollisionResolutionRequest,
  PreparedNoteCollisionResolution,
} from "./note-collision-resolution";
import type {
  EditorCommandPort,
} from "../../commands/editor-command-service";
import {
  type EditorSelection,
  type SelectedTimeMapMarkerGroup,
} from "../../../editor/selection/editor-selection";
import {
  buildAddNoteCommands,
  buildDeleteNoteCommands,
  buildRepositionNoteCommands,
  buildResizeNoteCommands,
  resizeNotes,
  type NoteResizeEdge,
} from "./note-edit-commands";
import {
  planSelectedMarkerMove,
} from "../selection/timeline-selection-move";
import type {
  MarkerCollisionResolutionRequest,
  TimeMapMarkerCollision,
} from "../timeline/marker-collision-resolution";

export type NoteGestureCommitResult =
  | "unchanged"
  | "committed"
  | "collision"
  | "rejected";

export interface NoteGestureWorkflowCallbacks {
  readonly onCollision:
    | ((request: NoteCollisionResolutionRequest) => void)
    | undefined;
  readonly onMarkerCollision?: (
    request: MarkerCollisionResolutionRequest,
  ) => void;
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
  readonly markerCommands?: readonly PianoRollCommand[];
  readonly markerGroupsAfterCommit?: readonly SelectedTimeMapMarkerGroup[];
  readonly markerCollisions?: readonly TimeMapMarkerCollision[];
  readonly markerOverwriteCommands?: readonly PianoRollCommand[];
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
    requestedDeltaTicks?: number,
  ): NoteGestureCommitResult {
    const originalNotes = this.selection.copyNotes();
    const state = this.commands.getState();
    const clipId = getActiveClip(state).id;
    const deltaTicks = requestedDeltaTicks
      ?? inferCommonDeltaTicks(originalNotes, proposedNotes);
    let markerPlan;
    let markerOverwriteCommands: readonly PianoRollCommand[] | undefined;

    try {
      markerPlan = planSelectedMarkerMove(
        state,
        clipId,
        this.selection.markerGroups,
        deltaTicks,
      );
      if (markerPlan.collisions.length > 0) {
        markerOverwriteCommands = planSelectedMarkerMove(
          state,
          clipId,
          this.selection.markerGroups,
          deltaTicks,
          true,
        ).commands;
      }
    } catch (error: unknown) {
      this.callbacks.onTransactionRejected?.(error);
      return "rejected";
    }

    if (
      !hasChangedPosition(originalNotes, proposedNotes)
      && markerPlan.commands.length === 0
      && markerPlan.collisions.length === 0
    ) {
      return "unchanged";
    }

    return this.commitNoteEdit({
      clipId,
      originalNotes,
      proposedNotes,
      commands: [
        ...markerPlan.commands,
        ...buildRepositionNoteCommands(clipId, proposedNotes),
      ],
      label: markerPlan.commands.length > 0
        || markerPlan.collisions.length > 0
        ? "Move timeline selection"
        : "Move notes",
      selectionAfterCommit: "reconcile",
      markerCommands: markerPlan.commands,
      markerGroupsAfterCommit: markerPlan.resultingMarkerGroups,
      markerCollisions: markerPlan.collisions,
      ...(markerOverwriteCommands === undefined
        ? {}
        : { markerOverwriteCommands }),
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
        { clipId, noteIds: [] },
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
    const markerCollisions = options.markerCollisions ?? [];

    if (collisionCount > 0) {
      const originalNotes = options.originalNotes.slice();
      const proposedNotes = options.proposedNotes.slice();

      const request: NoteCollisionResolutionRequest = {
        clipId: options.clipId,
        label: options.label,
        collisionCount,
        originalNotes,
        proposedNotes,
        ...(options.markerCommands === undefined
          ? {}
          : { prefixCommands: options.markerCommands }),
        ...(options.markerGroupsAfterCommit === undefined
          ? {}
          : {
              selectionAfterMarkerGroups:
                options.markerGroupsAfterCommit,
            }),
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
          this.selection.replaceMarkerGroups(
            options.markerGroupsAfterCommit ?? this.selection.markerGroups,
          );
          this.callbacks.onSelectionChanged?.();
        },
        ...(markerCollisions.length === 0
          ? {}
          : {
              onResolutionPrepared: (
                resolution: PreparedNoteCollisionResolution,
              ): void => {
                this.requestMarkerOverwrite(
                  options,
                  markerCollisions,
                  resolution,
                );
              },
            }),
      };

      this.callbacks.onCollision?.(request);

      return "collision";
    }

    if (markerCollisions.length > 0) {
      this.requestMarkerOverwrite(options, markerCollisions);
      return "collision";
    }

    let nextState: ProjectState | null;

    try {
      nextState = this.commands.dispatch(
        options.commands,
        options.label,
        {
          clipId: options.clipId,
          noteIds: collectNoteIds(
            options.selectionAfterCommit === "proposed"
              ? options.proposedNotes
              : options.originalNotes,
          ),
          ...(options.markerGroupsAfterCommit === undefined
            ? {}
            : { markerGroups: options.markerGroupsAfterCommit }),
        },
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
      if (options.markerGroupsAfterCommit !== undefined) {
        this.selection.replaceMarkerGroups(
          options.markerGroupsAfterCommit,
        );
      }
      this.selection.reconcile(
        nextState,
        (note) => isNoteEditable(nextState, options.clipId, note),
      );
    }

    return "committed";
  }

  private requestMarkerOverwrite(
    options: CommitNoteEditOptions,
    collisions: readonly TimeMapMarkerCollision[],
    preparedNoteResolution?: PreparedNoteCollisionResolution,
  ): void {
    this.callbacks.onMarkerCollision?.({
      label: options.label,
      collisions,
      onOverwrite: (): void => {
        const markerCommands = options.markerOverwriteCommands ?? [];
        const noteCommands = preparedNoteResolution?.commands
          ?? options.commands;
        const selectedNoteIds = preparedNoteResolution?.selectedNoteIds
          ?? collectNoteIds(
            options.selectionAfterCommit === "proposed"
              ? options.proposedNotes
              : options.originalNotes,
          );
        let nextState: ProjectState | null;

        try {
          nextState = this.commands.dispatch(
            [...markerCommands, ...noteCommands],
            preparedNoteResolution?.transactionLabel ?? options.label,
            {
              clipId: options.clipId,
              noteIds: selectedNoteIds,
              ...(options.markerGroupsAfterCommit === undefined
                ? {}
                : { markerGroups: options.markerGroupsAfterCommit }),
            },
          );
        } catch (error: unknown) {
          this.callbacks.onTransactionRejected?.(error);
          return;
        }

        if (nextState === null) {
          return;
        }

        this.selection.replaceFromNoteIds(
          nextState,
          selectedNoteIds,
          (note) => isNoteEditable(nextState, options.clipId, note),
        );
        if (options.markerGroupsAfterCommit !== undefined) {
          this.selection.replaceMarkerGroups(
            options.markerGroupsAfterCommit,
          );
        }
        this.callbacks.onSelectionChanged?.();
      },
    });
  }
}

function isNoteEditable(
  state: ProjectState,
  clipId: ClipId,
  note: Note,
): boolean {
  return getClip(state, clipId).tracksByInstrumentId[note.instrumentId]
    ?.notesById[note.id] !== undefined
    && isEditableNote(note);
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

function inferCommonDeltaTicks(
  originalNotes: readonly Note[],
  proposedNotes: readonly Note[],
): number {
  const original = originalNotes[0];
  const proposed = proposedNotes[0];

  return original === undefined || proposed === undefined
    ? 0
    : proposed.startTick - original.startTick;
}
