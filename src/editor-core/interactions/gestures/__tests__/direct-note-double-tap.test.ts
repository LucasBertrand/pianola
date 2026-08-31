import { describe, expect, test } from "vitest";
import type { NoteId } from "../../../../domain/identifiers";
import { DirectNoteDoubleTapGesture } from "../direct-note-double-tap";

const NOTE_ID = "note-1" as NoteId;
const OTHER_NOTE_ID = "note-2" as NoteId;

function createGesture(): DirectNoteDoubleTapGesture {
  return new DirectNoteDoubleTapGesture({
    maximumDelayMs: 360,
    maximumDistanceCssPixels: 24,
  });
}

function tap(
  timeStamp: number,
  clientX = 10,
  clientY = 20,
  pointerType: "mouse" | "touch" | "pen" = "touch",
) {
  return { timeStamp, clientX, clientY, pointerType };
}

describe("direct note double tap", () => {
  test("recognizes two nearby touch taps on the same note", () => {
    const gesture = createGesture();

    expect(gesture.recordTap(tap(100), NOTE_ID)).toBe(false);
    expect(gesture.recordTap(tap(300, 20, 25), NOTE_ID)).toBe(true);
  });

  test("does not combine taps on different notes", () => {
    const gesture = createGesture();

    expect(gesture.recordTap(tap(100), NOTE_ID)).toBe(false);
    expect(gesture.recordTap(tap(200), OTHER_NOTE_ID)).toBe(false);
    expect(gesture.recordTap(tap(300), OTHER_NOTE_ID)).toBe(true);
  });

  test("rejects distant, late, and mouse taps", () => {
    const gesture = createGesture();

    expect(gesture.recordTap(tap(100), NOTE_ID)).toBe(false);
    expect(gesture.recordTap(tap(200, 40, 20), NOTE_ID)).toBe(false);
    expect(gesture.recordTap(tap(700, 40, 20), NOTE_ID)).toBe(false);
    expect(gesture.recordTap(tap(800, 40, 20, "mouse"), NOTE_ID)).toBe(false);
  });

  test("resets after a recognized double tap", () => {
    const gesture = createGesture();

    gesture.recordTap(tap(100), NOTE_ID);
    expect(gesture.recordTap(tap(200), NOTE_ID)).toBe(true);
    expect(gesture.recordTap(tap(300), NOTE_ID)).toBe(false);
  });
});
