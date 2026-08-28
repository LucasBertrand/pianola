import { describe, expect, test } from "vitest";
import {
  createSelectedMarkerGroup,
  EditorSelection,
} from "../../../editor-core/selection/editor-selection";
import {
  createTestNote,
  TEST_INSTRUMENT_ID,
} from "../../../../tests/support/test-builders";
import { applyTimeMapMarkerSelection } from "../time-map-marker-selection";

const FIRST_GROUP = {
  startTick: 480,
  kinds: ["tempo"] as const,
};
const SECOND_GROUP = {
  startTick: 960,
  kinds: ["scale"] as const,
};

describe("timeline marker selection", () => {
  test("selects only the optional section from the initial flag", () => {
    expect(createSelectedMarkerGroup(0, true, true, true)).toEqual({
      startTick: 0,
      kinds: ["section"],
    });
    expect(createSelectedMarkerGroup(0, true, true, false)).toBeNull();
  });

  test("replace mode replaces notes and other marker groups", () => {
    const selection = new EditorSelection();
    selection.add(createTestNote({
      id: "selected-note",
      instrumentId: TEST_INSTRUMENT_ID,
      pitch: 60,
      startTick: 0,
      durationTicks: 120,
      velocity: 100,
    }));
    selection.addMarkerGroup(FIRST_GROUP);

    expect(applyTimeMapMarkerSelection(
      selection,
      SECOND_GROUP,
      "replace",
    )).toBe(true);
    expect(selection.notes).toEqual([]);
    expect(selection.markerGroups).toEqual([SECOND_GROUP]);
  });

  test("add mode preserves the current selection", () => {
    const selection = new EditorSelection();
    selection.addMarkerGroup(FIRST_GROUP);

    expect(applyTimeMapMarkerSelection(
      selection,
      SECOND_GROUP,
      "add",
    )).toBe(true);
    expect(selection.markerGroups).toEqual([FIRST_GROUP, SECOND_GROUP]);
  });

  test("subtract mode removes only the targeted marker group", () => {
    const selection = new EditorSelection();
    selection.addMarkerGroup(FIRST_GROUP);
    selection.addMarkerGroup(SECOND_GROUP);

    expect(applyTimeMapMarkerSelection(
      selection,
      SECOND_GROUP,
      "subtract",
    )).toBe(true);
    expect(selection.markerGroups).toEqual([FIRST_GROUP]);
  });
});
