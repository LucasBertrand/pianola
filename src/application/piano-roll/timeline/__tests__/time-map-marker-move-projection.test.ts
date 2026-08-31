import {
  describe,
  expect,
  test,
} from "vitest";
import type {
  TimeMap,
} from "../../../../domain/transport/time-map";
import {
  projectTimeMapMarkerMove,
} from "../time-map-marker-move-projection";

const SOURCE_TIME_MAP: TimeMap = {
  meterMarkers: [
    { startTick: 0, timeSignature: { numerator: 4, denominator: 4 } },
    { startTick: 1_920, timeSignature: { numerator: 3, denominator: 4 } },
  ],
  tempoMarkers: [
    { startTick: 0, bpm: 120 },
    { startTick: 960, bpm: 90 },
    { startTick: 1_440, bpm: 80 },
  ],
  scaleMarkers: [
    {
      startTick: 0,
      rootNote: "C",
      patternType: "scale",
      patternId: "ionian",
    },
    {
      startTick: 960,
      rootNote: "D",
      patternType: "scale",
      patternId: "dorian",
    },
  ],
  sectionMarkers: [
    { startTick: 0, comment: "Intro" },
    { startTick: 960, comment: "Verse" },
  ],
};

describe("time-map marker move projection", () => {
  test("projects grouped point markers while preserving meters and source", () => {
    const before = structuredClone(SOURCE_TIME_MAP);
    const projection = projectTimeMapMarkerMove({
      timeMap: SOURCE_TIME_MAP,
      durationTicks: 3_840,
      movedGroups: [{
        startTick: 960,
        kinds: ["tempo", "scale", "section"],
      }],
      deltaTicks: 480,
      boundaryPolicy: "published",
    });

    expect(projection.timeMap.meterMarkers)
      .toBe(SOURCE_TIME_MAP.meterMarkers);
    expect(projection.timeMap.tempoMarkers).toEqual([
      { startTick: 0, bpm: 120 },
      { startTick: 1_440, bpm: 90 },
    ]);
    expect(projection.timeMap.scaleMarkers[1]).toMatchObject({
      startTick: 1_440,
      rootNote: "D",
    });
    expect(projection.timeMap.sectionMarkers).toEqual([
      { startTick: 0, comment: "Intro" },
      { startTick: 1_440, comment: "Verse" },
    ]);
    expect(projection.collisions).toEqual([
      { kind: "tempo", targetTick: 1_440 },
    ]);
    expect(SOURCE_TIME_MAP).toEqual(before);
  });

  test("moves a tick-zero section without moving mandatory initial markers", () => {
    const projection = projectTimeMapMarkerMove({
      timeMap: SOURCE_TIME_MAP,
      durationTicks: 3_840,
      movedGroups: [{ startTick: 0, kinds: ["section"] }],
      deltaTicks: 240,
      boundaryPolicy: "published",
    });

    expect(projection.timeMap.tempoMarkers[0]).toBe(
      SOURCE_TIME_MAP.tempoMarkers[0],
    );
    expect(projection.timeMap.scaleMarkers[0]).toBe(
      SOURCE_TIME_MAP.scaleMarkers[0],
    );
    expect(projection.timeMap.sectionMarkers[0]).toEqual({
      startTick: 240,
      comment: "Intro",
    });
  });

  test("rejects a projection outside the clip", () => {
    expect(() => projectTimeMapMarkerMove({
      timeMap: SOURCE_TIME_MAP,
      durationTicks: 3_840,
      movedGroups: [{ startTick: 960, kinds: ["tempo"] }],
      deltaTicks: -1_200,
      boundaryPolicy: "published",
    })).toThrowError("inside the clip");
  });

  test("projects a tick-zero overwrite as a collision", () => {
    const projection = projectTimeMapMarkerMove({
      timeMap: SOURCE_TIME_MAP,
      durationTicks: 3_840,
      movedGroups: [{ startTick: 960, kinds: ["tempo", "scale"] }],
      deltaTicks: -960,
      boundaryPolicy: "published",
    });

    expect(projection.collisions).toEqual([
      { kind: "tempo", targetTick: 0 },
      { kind: "scale", targetTick: 0 },
    ]);
    expect(projection.timeMap.tempoMarkers[0]).toEqual({
      startTick: 0,
      bpm: 90,
    });
    expect(projection.timeMap.scaleMarkers[0]).toMatchObject({
      startTick: 0,
      rootNote: "D",
    });
  });

  test("rejects the clip-end boundary explicitly", () => {
    expect(() => projectTimeMapMarkerMove({
      timeMap: SOURCE_TIME_MAP,
      durationTicks: 3_840,
      movedGroups: [{ startTick: 960, kinds: ["tempo"] }],
      deltaTicks: 2_880,
      boundaryPolicy: "published",
    })).toThrowError("before the end of the clip");
  });

  test("allows the clip-end boundary only for an editorial preview", () => {
    const projection = projectTimeMapMarkerMove({
      timeMap: SOURCE_TIME_MAP,
      durationTicks: 3_840,
      movedGroups: [{ startTick: 960, kinds: ["tempo"] }],
      deltaTicks: 2_880,
      boundaryPolicy: "editorial-preview",
    });

    expect(projection.timeMap.tempoMarkers.at(-1)?.startTick).toBe(3_840);
  });
});
