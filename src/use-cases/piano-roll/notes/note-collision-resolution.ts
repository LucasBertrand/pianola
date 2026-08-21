import type {
  PianoRollCommand,
} from "../../../domain/commands/command-types";
import {
  type ClipId,
  type NoteId,
} from "../../../domain/identifiers";
import {
  type ProjectState,
} from "../../../domain/project/project-document";
import type {
  NoteEditIntent,
} from "../../../domain/note-collision";

/**
 * Application-level request emitted when an edit needs an explicit user
 * decision. The interaction layer describes the conflict; the UI chooses how
 * to present it and returns the committed state through the resolution hook.
 */
export interface NoteCollisionResolutionRequest
  extends NoteEditIntent {
  readonly clipId: ClipId;
  readonly label: string;
  readonly collisionCount: number;
  readonly prefixCommands?: readonly PianoRollCommand[];
  readonly retainedSelectionNoteIds?: readonly NoteId[];
  readonly onResolved: (
    state: ProjectState,
    selectedNoteIds: readonly NoteId[],
  ) => void;
}
