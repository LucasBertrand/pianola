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
import type {
  SelectedTimeMapMarkerGroup,
} from "../../../editor/selection/editor-selection";

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
  readonly selectionAfterMarkerGroups?: readonly SelectedTimeMapMarkerGroup[];
  readonly onResolutionPrepared?: (
    resolution: PreparedNoteCollisionResolution,
  ) => void;
  readonly onResolved: (
    state: ProjectState,
    selectedNoteIds: readonly NoteId[],
  ) => void;
}

export interface PreparedNoteCollisionResolution {
  readonly commands: readonly PianoRollCommand[];
  readonly selectedNoteIds: readonly NoteId[];
  readonly transactionLabel: string;
}
