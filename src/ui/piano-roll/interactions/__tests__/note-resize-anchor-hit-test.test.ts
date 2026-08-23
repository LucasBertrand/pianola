import {
  describe,
  expect,
  test,
} from "vitest";
import {
  CoordinateConverter,
} from "../../../../editor/geometry/converter";
import type {
  Note,
} from "../../../../domain/notes/note";
import {
  isPointInsideNoteResizeAnchor,
} from "../note-resize-anchor-hit-test";

const CONVERTER = new CoordinateConverter({
  zoomX: 1,
  zoomY: 1,
  scrollX: 0,
  scrollY: 0,
  pitchHeight: 18,
  ticksPerPixel: 10,
  devicePixelRatio: 1,
});
const SMALL_NOTE: Note = {
  id: "note-1" as Note["id"],
  instrumentId: "instrument-1" as Note["instrumentId"],
  pitch: 60,
  startTick: 100,
  durationTicks: 60,
  velocity: 100,
  enabled: true,
};

describe("note resize anchor hit test", () => {
  test("does not treat the center of a short note as an anchor", () => {
    expect(isPointInsideNoteResizeAnchor(
      SMALL_NOTE,
      "start",
      13,
      872.5,
      CONVERTER,
    )).toBe(false);
    expect(isPointInsideNoteResizeAnchor(
      SMALL_NOTE,
      "end",
      13,
      872.5,
      CONVERTER,
    )).toBe(false);
  });

  test("accepts only the two visible external anchors", () => {
    expect(isPointInsideNoteResizeAnchor(
      SMALL_NOTE,
      "start",
      6,
      872.5,
      CONVERTER,
    )).toBe(true);
    expect(isPointInsideNoteResizeAnchor(
      SMALL_NOTE,
      "end",
      20,
      872.5,
      CONVERTER,
    )).toBe(true);
    expect(isPointInsideNoteResizeAnchor(
      SMALL_NOTE,
      "end",
      20,
      864,
      CONVERTER,
    )).toBe(false);
  });
});
