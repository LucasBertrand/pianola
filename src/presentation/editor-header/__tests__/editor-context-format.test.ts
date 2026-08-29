import {
  describe,
  expect,
  test,
} from "vitest";
import {
  createDefaultTimeMap,
} from "../../../domain/transport/time-map";
import {
  formatLoopDuration,
  formatSaveStatus,
  formatSelectionLabel,
} from "../editor-context-format";

describe("editor context formatting", () => {
  test("formats loop length in musical and absolute units", () => {
    const timeMap = createDefaultTimeMap();

    expect(formatLoopDuration(
      960,
      { durationTicks: 7_680, timeMap },
      { startTick: 0, endTick: 3_840 },
      240,
    )).toEqual({
      musical: "1.0.0",
      absolute: "00:02.000",
    });
  });

  test("uses elapsed time across tempo changes", () => {
    const timeMap = {
      ...createDefaultTimeMap(),
      tempoMarkers: [
        { startTick: 0, bpm: 120 },
        { startTick: 1_920, bpm: 60 },
      ],
    };

    expect(formatLoopDuration(
      960,
      { durationTicks: 7_680, timeMap },
      { startTick: 960, endTick: 2_880 },
      240,
    )).toEqual({
      musical: "0.2.0",
      absolute: "00:01.500",
    });
    expect(formatLoopDuration(
      960,
      { durationTicks: 7_680, timeMap },
      { startTick: 0, endTick: 1_920 },
      240,
    ).absolute).toBe("00:01.000");
    expect(formatLoopDuration(
      960,
      { durationTicks: 7_680, timeMap },
      { startTick: 1_920, endTick: 3_840 },
      240,
    ).absolute).toBe("00:02.000");
  });

  test("counts measures using meter markers inside the loop", () => {
    const timeMap = {
      ...createDefaultTimeMap(),
      meterMarkers: [
        {
          startTick: 0,
          timeSignature: { numerator: 4, denominator: 4 as const },
        },
        {
          startTick: 3_840,
          timeSignature: { numerator: 3, denominator: 4 as const },
        },
      ],
    };
    const timeline = { durationTicks: 6_720, timeMap };

    expect(formatLoopDuration(
      960,
      timeline,
      { startTick: 0, endTick: 6_720 },
      240,
    )).toEqual({
      musical: "2.0.0",
      absolute: "00:03.500",
    });
    expect(formatLoopDuration(
      960,
      timeline,
      { startTick: 3_840, endTick: 6_720 },
      240,
    ).musical).toBe("1.0.0");
  });

  test("formats the selected note and marker counts", () => {
    expect(formatSelectionLabel(1, 0)).toBe("1 note • 0 markers");
    expect(formatSelectionLabel(2, 1)).toBe("2 notes • 1 marker");
  });

  test("formats every autosave state", () => {
    expect(formatSaveStatus({ state: "saving" })).toBe("Saving…");
    expect(formatSaveStatus({ state: "unsaved" })).toBe("Unsaved changes");
    expect(formatSaveStatus({
      state: "saved",
      savedAt: "2026-08-29T12:00:00.000Z",
    })).toBe("Saved locally");
    expect(formatSaveStatus({
      state: "error",
      error: new Error("storage unavailable"),
    })).toBe("Autosave failed");
  });
});
