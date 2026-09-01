import { describe, expect, test } from "vitest";
import {
  MAXIMUM_MASTER_GAIN,
} from "../../master-bus";
import { ProjectStore } from "../../../application/history/project-store";
import { CommandRejectedError } from "../command-errors";
import type { PianoRollCommand } from "../command-types";
import type { Transaction } from "../transaction";
import {
  createTestNote,
  createTestProject,
  TEST_CLIP_ID,
  TEST_INSTRUMENT_ID,
} from "../../../../tests/support/test-builders";
import {
  createDefaultInstrumentConfig,
} from "../../instruments/synth/built-in-synth-presets";
import {
  createPersonalInstrumentPreset,
} from "../../instruments/presets/personal-preset-library";

describe("P2 command family contracts", () => {
  test("project commands support success, rejection, undo and redo", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, { type: "UpdateProjectTitle", title: "Renamed" }, 1);
    expect(store.getState().title).toBe("Renamed");
    expectUndoRedo(store, "title", "P0 behavior witness", "Renamed");
    expect(() => dispatch(store, { type: "UpdateMasterGain", gain: MAXIMUM_MASTER_GAIN + 1 }, 2))
      .toThrow(CommandRejectedError);
  });

  test("playhead auto-scroll changes are undoable and redoable", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, { type: "SetAutoScrollEnabled", enabled: true }, 1);
    expect(store.getState().autoScrollEnabled).toBe(true);

    dispatch(store, { type: "SetAutoScrollEnabled", enabled: false }, 2);
    expect(store.getState().autoScrollEnabled).toBe(false);

    store.undo();
    expect(store.getState().autoScrollEnabled).toBe(true);
    store.redo();
    expect(store.getState().autoScrollEnabled).toBe(false);

    expect(() => dispatch(store, {
      type: "SetAutoScrollEnabled",
      enabled: "yes" as unknown as boolean,
    }, 3)).toThrow(CommandRejectedError);
  });

  test("clip commands support success, rejection, undo and redo", () => {
    const store = new ProjectStore(createTestProject());

    dispatch(store, {
      type: "UpdateClip",
      clipId: TEST_CLIP_ID,
      changes: {
        name: "Verse",
        color: "#ff9b71",
        bypassEnabled: true,
      },
    }, 1);
    expect(store.getState().clipsById[TEST_CLIP_ID]?.name).toBe("Verse");
    expect(store.getState().clipsById[TEST_CLIP_ID]?.color).toBe("#ff9b71");
    expect(store.getState().clipsById[TEST_CLIP_ID]?.bypassEnabled).toBe(true);
    store.undo();
    expect(store.getState().clipsById[TEST_CLIP_ID]?.name).toBe(TEST_CLIP_ID);
    expect(store.getState().clipsById[TEST_CLIP_ID]?.bypassEnabled).toBe(false);
    store.redo();
    expect(store.getState().clipsById[TEST_CLIP_ID]?.name).toBe("Verse");
    expect(store.getState().clipsById[TEST_CLIP_ID]?.bypassEnabled).toBe(true);
    expect(() => dispatch(store, {
      type: "UpdateClip",
      clipId: TEST_CLIP_ID,
      changes: { color: "orange" },
    }, 2)).toThrow(CommandRejectedError);
    expect(() => dispatch(store, {
      type: "UpdateClip",
      clipId: TEST_CLIP_ID,
      changes: { bypassEnabled: "yes" as unknown as boolean },
    }, 2)).toThrow(CommandRejectedError);
    expect(() => dispatch(store, { type: "DeleteClip", clipId: "missing" }, 2))
      .toThrow(CommandRejectedError);
  });

  test("instrument commands support success, rejection, undo and redo", () => {
    const store = new ProjectStore(createTestProject());
    const initialGain = store.getState()
      .projectInstrumentsById[TEST_INSTRUMENT_ID]?.gain;

    dispatch(store, {
      type: "UpdateProjectInstrument",
      instrumentId: TEST_INSTRUMENT_ID,
      changes: { gain: 0.5 },
    }, 1);
    expect(store.getState().projectInstrumentsById[TEST_INSTRUMENT_ID]?.gain).toBe(0.5);
    store.undo();
    expect(store.getState().projectInstrumentsById[TEST_INSTRUMENT_ID]?.gain).toBe(initialGain);
    store.redo();
    expect(store.getState().projectInstrumentsById[TEST_INSTRUMENT_ID]?.gain).toBe(0.5);
    expect(() => dispatch(store, {
      type: "UpdateProjectInstrument",
      instrumentId: "missing",
      changes: { gain: 0.25 },
    }, 2)).toThrow(CommandRejectedError);
  });

  test("project preset snapshots support save, replace, delete and undo", () => {
    const store = new ProjectStore(createTestProject());
    const preset = createPersonalInstrumentPreset(
      "personal-preset-command",
      "Command Pad",
      createDefaultInstrumentConfig(3),
    );

    dispatch(store, { type: "SaveInstrumentPreset", preset }, 1);
    expect(store.getState().instrumentPresetOrder.at(-1)).toBe(preset.id);
    expect(store.getState().instrumentPresetsById[preset.id]).toEqual(preset);

    dispatch(store, {
      type: "SaveInstrumentPreset",
      preset: { ...preset, name: "Renamed Command Pad" },
    }, 2);
    expect(store.getState().instrumentPresetsById[preset.id]?.name)
      .toBe("Renamed Command Pad");
    expect(store.getState().instrumentPresetOrder.filter(
      (presetId) => presetId === preset.id,
    )).toHaveLength(1);

    dispatch(store, { type: "DeleteInstrumentPreset", presetId: preset.id }, 3);
    expect(store.getState().instrumentPresetsById[preset.id]).toBeUndefined();
    store.undo();
    expect(store.getState().instrumentPresetsById[preset.id]?.name)
      .toBe("Renamed Command Pad");
  });

  test("note commands support success, rejection, undo and redo", () => {
    const store = new ProjectStore(createTestProject());
    const note = createTestNote({ id: "note-a", startTick: 0 });

    dispatch(store, {
      type: "AddNotes",
      clipId: TEST_CLIP_ID,
      trackInstrumentId: TEST_INSTRUMENT_ID,
      notes: [note],
    }, 1);
    expect(activeNotes(store)[note.id]).toEqual(note);
    store.undo();
    expect(activeNotes(store)[note.id]).toBeUndefined();
    store.redo();
    expect(activeNotes(store)[note.id]).toEqual(note);
    expect(() => dispatch(store, {
      type: "AddNotes",
      clipId: TEST_CLIP_ID,
      trackInstrumentId: TEST_INSTRUMENT_ID,
      notes: [createTestNote({ id: "overlap", startTick: 60 })],
    }, 2)).toThrow(CommandRejectedError);
  });

  test("transport commands support success, rejection, undo and redo", () => {
    const store = new ProjectStore(createTestProject());
    const initialTempo = () => store.getState()
      .clipsById[TEST_CLIP_ID]?.timeline.timeMap.tempoMarkers[0]?.bpm;

    dispatch(store, { type: "UpdateTempo", clipId: TEST_CLIP_ID, bpm: 90 }, 1);
    expect(initialTempo()).toBe(90);
    store.undo();
    expect(initialTempo()).toBe(120);
    store.redo();
    expect(initialTempo()).toBe(90);
    expect(() => dispatch(store, { type: "UpdateTempo", clipId: TEST_CLIP_ID, bpm: 0 }, 2))
      .toThrow(CommandRejectedError);
  });
});

function dispatch(
  store: ProjectStore,
  command: PianoRollCommand,
  sequence: number,
): void {
  const transaction: Transaction = {
    transactionId: `p2-family-${String(sequence)}`,
    createdAt: sequence,
    commands: [command],
  };

  store.dispatch(transaction);
}

function activeNotes(store: ProjectStore) {
  return store.getState().clipsById[TEST_CLIP_ID]
    ?.tracksByInstrumentId[TEST_INSTRUMENT_ID]?.notesById ?? {};
}

function expectUndoRedo(
  store: ProjectStore,
  property: "title",
  before: string,
  after: string,
): void {
  store.undo();
  expect(store.getState()[property]).toBe(before);
  store.redo();
  expect(store.getState()[property]).toBe(after);
}
