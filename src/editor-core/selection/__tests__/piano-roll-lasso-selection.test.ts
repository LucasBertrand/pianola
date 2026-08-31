import { describe, expect, test } from "vitest";
import type { Note } from "../../../domain/notes/note";
import {
  createDefaultTimeMap,
  type TimeMap,
} from "../../../domain/transport/time-map";
import {
  createTestNote,
} from "../../../../tests/support/test-builders";
import { EditorSelection } from "../editor-selection";
import { applyPianoRollLassoSelection } from "../piano-roll-lasso-selection";

const NOTE = createTestNote({
  id: "lasso-note",
  pitch: 60,
  startTick: 480,
  durationTicks: 120,
});
const TIME_MAP: TimeMap = {
  ...createDefaultTimeMap(),
  tempoMarkers: [
    { startTick: 0, bpm: 120 },
    { startTick: 480, bpm: 90 },
  ],
  scaleMarkers: [
    createDefaultTimeMap().scaleMarkers[0]!,
    {
      startTick: 480,
      rootNote: "D",
      patternType: "scale",
      patternId: "ionian",
    },
  ],
  sectionMarkers: [{ startTick: 480, comment: "Verse" }],
};

function applyLasso(
  selection: EditorSelection,
  selectionMode: "replace" | "add" | "subtract",
  includeTimeMapMarkers = true,
): void {
  applyPianoRollLassoSelection({
    originLocalX: 400,
    originLocalY: 59,
    currentLocalX: 700,
    currentLocalY: 61,
    selectionMode,
    includeTimeMapMarkers,
    converter: {
      cssPixelXToTick: (value) => value,
      cssPixelYToPitch: (value) => value,
    },
    selection,
    spatialIndex: {
      queryRect(_start, _end, _minimumPitch, _maximumPitch, target): Note[] {
        const result = target ?? [];
        result.length = 0;
        result.push(NOTE);
        return result;
      },
    },
    timeMap: TIME_MAP,
    resultBuffer: [],
  });
}

describe("piano-roll lasso selection", () => {
  test("replaces the selection with notes and movable marker kinds", () => {
    const selection = new EditorSelection();

    applyLasso(selection, "replace");

    expect(selection.notes).toEqual([NOTE]);
    expect(selection.markerGroups).toEqual([{
      startTick: 480,
      kinds: ["tempo", "scale", "section"],
    }]);
  });

  test("keeps markers out when the lasso does not cross their visual anchor", () => {
    const selection = new EditorSelection();

    applyLasso(selection, "replace", false);

    expect(selection.notes).toEqual([NOTE]);
    expect(selection.markerGroups).toEqual([]);
  });

  test("subtracts matching notes and marker groups", () => {
    const selection = new EditorSelection();
    selection.add(NOTE);
    selection.addMarkerGroup({
      startTick: 480,
      kinds: ["tempo", "scale", "section"],
    });

    applyLasso(selection, "subtract");

    expect(selection.notes).toEqual([]);
    expect(selection.markerGroups).toEqual([]);
  });
});
