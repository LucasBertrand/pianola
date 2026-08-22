import type {
  Note,
} from "../../../domain/notes/note";
import type {
  TimeMap,
} from "../../../domain/transport/time-map";
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
import {
  createSelectedMarkerGroup,
} from "../../../editor/selection/editor-selection";

/** Marker flags are vertically anchored at the centre of the 50 px ruler. */
export const MARKER_LASSO_ANCHOR_LOCAL_Y = -25;

export interface CompletePianoRollLassoOptions {
  readonly completion: GestureCompletion;
  readonly converter: CoordinateConverter;
  readonly selectionController: PianoRollSelectionController;
  readonly spatialIndex: SpatialIndex;
  readonly timeMap: TimeMap;
  readonly resultBuffer: Note[];
  readonly visuals: InteractionVisualController | null;
}

/** Commits one lasso rectangle into the current note selection. */
export function completePianoRollLasso({
  completion,
  converter,
  selectionController,
  spatialIndex,
  timeMap,
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

  const minimumLocalY = Math.min(
    completion.originLocalY,
    completion.currentLocalY,
  );
  const maximumLocalY = Math.max(
    completion.originLocalY,
    completion.currentLocalY,
  );

  if (
    minimumLocalY <= MARKER_LASSO_ANCHOR_LOCAL_Y
    && maximumLocalY >= MARKER_LASSO_ANCHOR_LOCAL_Y
  ) {
    const minimumTick = Math.max(0, Math.min(startTick, endTick));
    const maximumTick = Math.max(startTick, endTick);
    const markerTicks = new Set([
      ...timeMap.tempoMarkers.map((marker) => marker.startTick),
      ...timeMap.scaleMarkers.map((marker) => marker.startTick),
    ]);

    for (const startTick of markerTicks) {
      if (
        startTick < minimumTick
        || startTick > maximumTick
        || startTick === 0
      ) {
        continue;
      }

      if (completion.selectionMode === "subtract") {
        selection.deleteMarkerGroup(startTick);
        continue;
      }

      const group = createSelectedMarkerGroup(
        startTick,
        timeMap.tempoMarkers.some(
          (marker) => marker.startTick === startTick,
        ),
        timeMap.scaleMarkers.some(
          (marker) => marker.startTick === startTick,
        ),
      );

      if (group !== null) {
        selection.addMarkerGroup(group);
      }
    }
  }

  visuals?.endLasso();
  selectionController.showSelection();
}
