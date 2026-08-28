import { describe, expect, test } from "vitest";
import {
  createPianoRollRadialCenterModel,
  createPianoRollRadialCommandModel,
} from "../piano-roll-radial-command-model";

describe("piano-roll radial command model", () => {
  test("disables selection commands when the explicit snapshot is empty", () => {
    const model = createPianoRollRadialCommandModel({
      editableNoteSelectionAvailable: false,
      editableTimelineSelectionAvailable: false,
      selectedNoteCount: 0,
      selectionWillBeMuted: false,
      clipboardAvailable: false,
    });

    expect(model.map(({ id, disabled }) => ({ id, disabled }))).toEqual([
      { id: "copy", disabled: true },
      { id: "cut", disabled: true },
      { id: "paste", disabled: true },
      { id: "slice", disabled: true },
      { id: "toggle-mute", disabled: true },
      { id: "add-marker", disabled: false },
    ]);
  });

  test("derives mute presentation without reading workspace state", () => {
    const [copy, cut, paste, slice, mute] = createPianoRollRadialCommandModel({
      editableNoteSelectionAvailable: true,
      editableTimelineSelectionAvailable: true,
      selectedNoteCount: 2,
      selectionWillBeMuted: true,
      clipboardAvailable: true,
    });

    expect([copy, cut, paste, slice].every((item) => !item?.disabled)).toBe(true);
    expect(mute).toMatchObject({
      id: "toggle-mute",
      label: "Mute",
      icon: "mute",
      tone: "danger",
      disabled: false,
    });
  });

  test("switches the injected center command between play and pause", () => {
    expect(createPianoRollRadialCenterModel(false)).toEqual({
      label: "Play",
      icon: "play",
    });
    expect(createPianoRollRadialCenterModel(true)).toEqual({
      label: "Pause",
      icon: "pause",
    });
  });
});
