import { describe, expect, test } from "vitest";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
} from "../../../../music/pitch-snap";
import {
  getGhostNoteLabelLayout,
} from "../dom-interaction-layers";

const TONAL_BOUNDARIES = [
  { startTick: 0 },
  { startTick: 480 },
] as const;

function getSnapSettingsAtTick(tick: number) {
  return {
    ...DEFAULT_PITCH_SNAP_SETTINGS,
    rootNote: tick < 480 ? "C#" : "Db",
    patternType: "scale" as const,
    patternId: "ionian",
  };
}

describe("drag note label layout", () => {
  test("splits an enharmonic label at the scale boundary", () => {
    expect(getGhostNoteLabelLayout(
      61,
      240,
      480,
      20,
      120,
      TONAL_BOUNDARIES,
      getSnapSettingsAtTick,
    )).toEqual([
      {
        label: "C#4",
        leftCssPixels: 0,
        widthCssPixels: 60,
      },
      {
        label: "Db4",
        leftCssPixels: 60,
        widthCssPixels: 60,
      },
    ]);
  });

  test("keeps the active drag label inside the left viewport edge", () => {
    expect(getGhostNoteLabelLayout(
      61,
      0,
      480,
      -40,
      120,
      TONAL_BOUNDARIES,
      getSnapSettingsAtTick,
    )).toEqual([
      {
        label: "C#4",
        leftCssPixels: 40,
        widthCssPixels: 80,
      },
    ]);
  });
});
