import { describe, expect, test } from "vitest";
import type { Note } from "../../../../domain/notes/note";
import {
  createDefaultTimeMap,
  type TimeMap,
} from "../../../../domain/transport/time-map";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
} from "../../../../music/pitch-snap";
import {
  resolvePitchSnapSettings,
} from "../../../../use-cases/piano-roll/timeline/pitch-snap-resolution";
import {
  buildRepositionedNotes,
  resolveRepositionedPitch,
} from "../note-gesture-math";

const TIME_MAP: TimeMap = {
  ...createDefaultTimeMap(),
  scaleMarkers: [
    {
      startTick: 0,
      rootNote: "C",
      patternType: "scale",
      patternId: "ionian",
    },
    {
      startTick: 480,
      rootNote: "D",
      patternType: "scale",
      patternId: "ionian",
    },
  ],
};

const ENABLED_SETTINGS = {
  ...DEFAULT_PITCH_SNAP_SETTINGS,
  enabled: true,
};

function getSnapSettingsAtTick(tick: number) {
  return resolvePitchSnapSettings(TIME_MAP, ENABLED_SETTINGS, tick);
}

function createNote(
  id: string,
  pitch: number,
  startTick: number,
): Note {
  return {
    id,
    instrumentId: "instrument-a",
    pitch,
    startTick,
    durationTicks: 120,
    velocity: 100,
    enabled: true,
  };
}

describe("selection pitch snapping", () => {
  test("resnaps a horizontal move when it crosses a scale marker", () => {
    const result = resolveRepositionedPitch(
      60,
      0,
      600,
      0,
      getSnapSettingsAtTick,
    );

    expect(result.destinationTick).toBe(600);
    expect(result.pitch).toBe(59);
    expect(result.snapSettings.rootNote).toBe("D");
  });

  test("does not alter a horizontal move inside the same tonal segment", () => {
    expect(resolveRepositionedPitch(
      61,
      0,
      240,
      0,
      getSnapSettingsAtTick,
    ).pitch).toBe(61);
  });

  test("uses the destination marker independently for every selected note", () => {
    const notes = [
      createNote("before-marker", 60, 0),
      createNote("after-marker", 62, 600),
    ];
    const moved = buildRepositionedNotes(
      notes,
      600,
      0,
      getSnapSettingsAtTick,
    );

    expect(moved.map((note) => [note.startTick, note.pitch])).toEqual([
      [600, 59],
      [1_200, 62],
    ]);
  });

  test("ignores scale-marker changes when tonal snapping is disabled", () => {
    const getDisabledSettings = (tick: number) => resolvePitchSnapSettings(
      TIME_MAP,
      DEFAULT_PITCH_SNAP_SETTINGS,
      tick,
    );

    expect(resolveRepositionedPitch(
      60,
      0,
      600,
      0,
      getDisabledSettings,
    ).pitch).toBe(60);
  });
});
