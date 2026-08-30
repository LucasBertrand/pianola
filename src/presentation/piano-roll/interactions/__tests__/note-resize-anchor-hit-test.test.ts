import {
  describe,
  expect,
  test,
} from "vitest";
import {
  CoordinateConverter,
} from "../../../../editor-core/geometry/converter";
import type {
  Note,
} from "../../../../domain/notes/note";
import {
  isPointInsideNoteResizeAnchor,
} from "../note-resize-anchor-hit-test";
import {
  getNoteResizeAnchorHitRect,
  getNoteResizeAnchorSize,
  getNoteResizeAnchorWidth,
} from "../note-resize-anchor-geometry";

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
  muted: false,
  locked: false,
};
const LONG_NOTE: Note = {
  ...SMALL_NOTE,
  id: "note-2" as Note["id"],
  durationTicks: 300,
};

describe("note resize anchor hit test", () => {
  test("does not treat the center of a regular note as an anchor", () => {
    expect(isPointInsideNoteResizeAnchor(
      LONG_NOTE,
      "start",
      25,
      872.5,
      CONVERTER,
    )).toBe(false);
    expect(isPointInsideNoteResizeAnchor(
      LONG_NOTE,
      "end",
      25,
      872.5,
      CONVERTER,
    )).toBe(false);
  });

  test("accepts the two external anchors", () => {
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

  test("extends each anchor target toward the note interior", () => {
    expect(isPointInsideNoteResizeAnchor(
      SMALL_NOTE,
      "start",
      11,
      872.5,
      CONVERTER,
    )).toBe(true);
    expect(isPointInsideNoteResizeAnchor(
      SMALL_NOTE,
      "end",
      15,
      872.5,
      CONVERTER,
    )).toBe(true);
  });

  test("keeps the visible anchor outside at minimum and maximum zoom sizes", () => {
    expect(getNoteResizeAnchorSize(5)).toBe(8);
    expect(getNoteResizeAnchorSize(100)).toBe(13);
    expect(getNoteResizeAnchorWidth()).toBe(5);

    expect(getNoteResizeAnchorHitRect("start", 20, 80, 10, 5)).toEqual({
      left: 15,
      right: 26,
      top: 8.5,
      bottom: 16.5,
    });
    expect(getNoteResizeAnchorHitRect("end", 20, 80, 10, 100)).toEqual({
      left: 74,
      right: 85,
      top: 53.5,
      bottom: 66.5,
    });
  });
});
