import {
  describe,
  expect,
  test,
} from "vitest";
import type {
  TimeMapMarkerFlag,
} from "../../src/use-cases/piano-roll/timeline/time-map-marker-plans";
import {
  createMarkerPreviewProjection,
  isOriginalMarkerBoundaryVisible,
} from "../../src/ui/piano-roll/time-map-marker-preview";

describe("time-map marker preview", () => {
  test("keeps a non-selected meter at the source of a selection move", () => {
    const source = createFlag(960, {
      bpm: 90,
      timeSignature: { numerator: 3, denominator: 4 },
      rootNote: "D",
      patternType: "scale",
      patternId: "ionian",
    });
    const projection = createMarkerPreviewProjection(
      [source],
      [{ startTick: 960, kinds: ["tempo", "scale"] }],
      { source: "notes", deltaTicks: 240 },
    );

    expect(projection.remainingFlagsByTick.get(960)).toEqual(
      createFlag(960, {
        timeSignature: { numerator: 3, denominator: 4 },
      }),
    );
    expect(projection.destinationFlagsByTick.get(1_200)).toEqual(
      createFlag(1_200, {
        bpm: 90,
        rootNote: "D",
        patternType: "scale",
        patternId: "ionian",
      }),
    );
  });

  test("previews the complete standalone flag grouped at its destination", () => {
    const source = createFlag(960, {
      bpm: 90,
      timeSignature: { numerator: 3, denominator: 4 },
    });
    const destination = createFlag(1_200, {
      rootNote: "F",
      patternType: "chord",
      patternId: "major",
    });
    const projection = createMarkerPreviewProjection(
      [source, destination],
      [],
      {
        source: "markers",
        deltaTicks: 240,
        standaloneMarkerTick: 960,
      },
    );

    expect(projection.remainingFlagsByTick.get(960)).toBeNull();
    expect(projection.destinationFlagsByTick.get(1_200)).toEqual(
      createFlag(1_200, {
        bpm: 90,
        timeSignature: { numerator: 3, denominator: 4 },
        rootNote: "F",
        patternType: "chord",
        patternId: "major",
      }),
    );
  });

  test("shows only the line representing the current marker state", () => {
    expect(isOriginalMarkerBoundaryVisible({
      selected: true,
      hovered: false,
      originalHidden: false,
      sourcePreviewed: false,
    })).toBe(true);

    expect(isOriginalMarkerBoundaryVisible({
      selected: true,
      hovered: false,
      originalHidden: false,
      sourcePreviewed: true,
    })).toBe(false);

    expect(isOriginalMarkerBoundaryVisible({
      selected: false,
      hovered: true,
      originalHidden: false,
      sourcePreviewed: false,
    })).toBe(true);
  });
});

function createFlag(
  startTick: number,
  overrides: Partial<TimeMapMarkerFlag> = {},
): TimeMapMarkerFlag {
  return {
    startTick,
    bpm: null,
    timeSignature: null,
    rootNote: null,
    patternType: null,
    patternId: null,
    sectionComment: null,
    isInitial: false,
    ...overrides,
  };
}
