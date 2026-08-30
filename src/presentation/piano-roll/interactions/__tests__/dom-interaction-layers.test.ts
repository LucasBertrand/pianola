import { describe, expect, test } from "vitest";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
} from "../../../../domain/music-theory/pitch-snap";
import {
  filterEditableInteractionNotes,
  getGhostNoteLabelLayout,
  getSelectionNoteClassName,
} from "../dom-interaction-layers";
import { createTestNote } from "../../../../../tests/support/test-builders";

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
        label: "C♯4",
        leftCssPixels: 0,
        widthCssPixels: 60,
      },
      {
        label: "D♭4",
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
        label: "C♯4",
        leftCssPixels: 40,
        widthCssPixels: 80,
      },
    ]);
  });
});

describe("non-editable note interaction visuals", () => {
  test("hides resize anchors for locked and disabled selections", () => {
    expect(getSelectionNoteClassName({ locked: false }))
      .toBe("interaction-note-selection");
    expect(getSelectionNoteClassName({ locked: false }))
      .toBe("interaction-note-selection");
    expect(getSelectionNoteClassName({ locked: true }))
      .toContain("is-non-editable");
    expect(getSelectionNoteClassName({ locked: true }))
      .toContain("is-non-editable");
  });

  test("excludes locked and disabled notes from ghost layers", () => {
    const notes = [
      createTestNote({ id: "active" }),
      createTestNote({ id: "muted", muted: true }),
      createTestNote({ id: "locked", locked: true }),
      createTestNote({ id: "disabled", muted: true, locked: true }),
    ];

    expect(filterEditableInteractionNotes(notes).map((note) => note.id))
      .toEqual(["active", "muted"]);
  });
});
