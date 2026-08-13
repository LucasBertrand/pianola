import type {
  Note,
} from "../../../domain/notes/note";
import type {
  CoordinateConverter,
} from "../../../editor/geometry/converter";
import type {
  SpatialIndex,
} from "../../../editor/geometry/spatial-index";
import type {
  GestureCompletion,
} from "../../../editor/interactions/gestures/gesture-state-machine";
import type {
  InteractionVisualController,
} from "./interaction-visual-controller";
import type {
  PianoRollSelectionController,
} from "./piano-roll-selection-controller";

export interface CompletePianoRollLassoOptions {
  readonly completion: GestureCompletion;
  readonly converter: CoordinateConverter;
  readonly selectionController: PianoRollSelectionController;
  readonly spatialIndex: SpatialIndex;
  readonly resultBuffer: Note[];
  readonly visuals: InteractionVisualController | null;
}

/** Commits one lasso rectangle into the current note selection. */
export function completePianoRollLasso({
  completion,
  converter,
  selectionController,
  spatialIndex,
  resultBuffer,
  visuals,
}: CompletePianoRollLassoOptions): void {
  const startTick = converter.cssPixelXToTick(completion.originLocalX);
  const endTick = converter.cssPixelXToTick(completion.currentLocalX);
  const startPitch = converter.cssPixelYToPitch(completion.originLocalY);
  const endPitch = converter.cssPixelYToPitch(completion.currentLocalY);
  const { selection } = selectionController;

  if (completion.selectionMode === "replace") {
    selectionController.clearSelection();
  }

  spatialIndex.queryRect(
    Math.max(0, Math.min(startTick, endTick)),
    Math.max(startTick, endTick),
    Math.max(0, Math.min(startPitch, endPitch)),
    Math.min(127, Math.max(startPitch, endPitch)),
    resultBuffer,
  );

  for (const note of resultBuffer) {
    if (completion.selectionMode === "subtract") {
      selection.delete(note.id);
    } else if (
      selectionController.isNoteEditable(note)
      && !selection.has(note.id)
    ) {
      selection.add(note);
    }
  }

  visuals?.endLasso();
  selectionController.showSelection();
}
