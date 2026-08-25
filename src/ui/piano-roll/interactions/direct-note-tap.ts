import {
  INTERACTION_CONSTANTS,
} from "../../../config/interaction-config";
import type {
  NoteId,
} from "../../../domain/identifiers";
import type {
  InteractionTapState,
} from "../../../editor/interactions/piano-roll-interaction-session";
import type {
  PointerSample,
} from "../../../editor/interactions/pointer/pointer-sample";
import type {
  NoteGestureWorkflowAdapter,
} from "./note-gesture-workflow-adapter";
import type {
  PianoRollSelectionController,
} from "./piano-roll-selection-controller";

/** Detects a direct touch/pen double tap and deletes its note. */
export function handleDirectNoteTap(
  event: PointerSample,
  noteId: NoteId,
  tapState: InteractionTapState,
  selectionController: PianoRollSelectionController,
  workflow: NoteGestureWorkflowAdapter,
): void {
  if (event.pointerType !== "touch" && event.pointerType !== "pen") {
    return;
  }

  const elapsed = event.timeStamp - tapState.timeStamp;
  const deltaX = event.clientX - tapState.clientX;
  const deltaY = event.clientY - tapState.clientY;
  const maximumDistanceSquared =
    INTERACTION_CONSTANTS.touchDoubleTapDistanceCssPixels ** 2;
  const isDoubleTap =
    tapState.noteId === noteId
    && elapsed > 0
    && elapsed <= INTERACTION_CONSTANTS.touchDoubleTapDelayMs
    && deltaX * deltaX + deltaY * deltaY <= maximumDistanceSquared;

  if (isDoubleTap) {
    tapState.noteId = null;
    const note = selectionController.selection.find(noteId);

    if (note !== undefined) {
      workflow.commitDelete(note);
    }

    return;
  }

  tapState.noteId = noteId;
  tapState.timeStamp = event.timeStamp;
  tapState.clientX = event.clientX;
  tapState.clientY = event.clientY;
}
