import type {
  Note,
} from "../../domain/notes/note";
import type {
  TimeMap,
} from "../../domain/transport/time-map";
import type {
  CoordinateConverter,
} from "../geometry/converter";
import type {
  SpatialIndex,
} from "../geometry/spatial-index";
import type {
  SelectionMode,
} from "../interactions/gestures/gesture-draft";
import {
  createSelectedMarkerGroup,
  type EditorSelection,
} from "./editor-selection";

export interface PianoRollLassoSelectionOptions {
  readonly originLocalX: number;
  readonly originLocalY: number;
  readonly currentLocalX: number;
  readonly currentLocalY: number;
  readonly selectionMode: SelectionMode;
  readonly includeTimeMapMarkers: boolean;
  readonly converter: Pick<
    CoordinateConverter,
    "cssPixelXToTick" | "cssPixelYToPitch"
  >;
  readonly selection: EditorSelection;
  readonly spatialIndex: Pick<SpatialIndex, "queryRect">;
  readonly timeMap: TimeMap;
  readonly resultBuffer: Note[];
}

/** Applies a DOM-independent piano-roll lasso to notes and movable markers. */
export function applyPianoRollLassoSelection({
  originLocalX,
  originLocalY,
  currentLocalX,
  currentLocalY,
  selectionMode,
  includeTimeMapMarkers,
  converter,
  selection,
  spatialIndex,
  timeMap,
  resultBuffer,
}: PianoRollLassoSelectionOptions): void {
  const startTick = converter.cssPixelXToTick(originLocalX);
  const endTick = converter.cssPixelXToTick(currentLocalX);
  const startPitch = converter.cssPixelYToPitch(originLocalY);
  const endPitch = converter.cssPixelYToPitch(currentLocalY);
  const minimumTick = Math.max(0, Math.min(startTick, endTick));
  const maximumTick = Math.max(startTick, endTick);

  if (selectionMode === "replace") {
    selection.clear();
  }

  spatialIndex.queryRect(
    minimumTick,
    maximumTick,
    Math.max(0, Math.min(startPitch, endPitch)),
    Math.min(127, Math.max(startPitch, endPitch)),
    resultBuffer,
  );

  for (const note of resultBuffer) {
    if (selectionMode === "subtract") {
      selection.delete(note.id);
    } else if (!selection.has(note.id)) {
      selection.add(note);
    }
  }

  if (!includeTimeMapMarkers) {
    return;
  }

  const markerTicks = new Set([
    ...timeMap.tempoMarkers.map((marker) => marker.startTick),
    ...timeMap.scaleMarkers.map((marker) => marker.startTick),
    ...timeMap.sectionMarkers.map((marker) => marker.startTick),
  ]);

  for (const markerTick of markerTicks) {
    if (markerTick < minimumTick || markerTick > maximumTick) {
      continue;
    }

    if (selectionMode === "subtract") {
      selection.deleteMarkerGroup(markerTick);
      continue;
    }

    const group = createSelectedMarkerGroup(
      markerTick,
      timeMap.tempoMarkers.some(
        (marker) => marker.startTick === markerTick,
      ),
      timeMap.scaleMarkers.some(
        (marker) => marker.startTick === markerTick,
      ),
      timeMap.sectionMarkers.some(
        (marker) => marker.startTick === markerTick,
      ),
    );

    if (group !== null) {
      selection.addMarkerGroup(group);
    }
  }
}
