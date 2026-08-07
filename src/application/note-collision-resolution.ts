import type {
  NoteId,
  ProjectState,
} from "../domain/model";
import type {
  NoteEditIntent,
} from "../domain/note-collision";

/**
 * Application-level request emitted when an edit needs an explicit user
 * decision. The interaction layer describes the conflict; the UI chooses how
 * to present it and returns the committed state through the resolution hook.
 */
export interface NoteCollisionResolutionRequest
  extends NoteEditIntent {
  readonly label: string;
  readonly collisionCount: number;
  readonly onResolved: (
    state: ProjectState,
    selectedNoteIds: readonly NoteId[],
  ) => void;
}
