import {
  describe,
  expect,
  test,
} from "vitest";
import {
  createTestNote,
  createTestProject,
} from "../../../../tests/support/test-builders";
import {
  ProjectStore,
} from "../../project-store";
import type {
  Clip,
} from "../clip";
import {
  concatenateClips,
  type ConcatenateClipsOptions,
} from "../concatenate-clips";

const INSTRUMENT_ID = "instrument-a";

describe("clip concatenation", () => {
  test("places notes and every time-map component consecutively", () => {
    const project = createTestProject({
      clips: [
        {
          id: "clip-first",
          measureCount: 1,
          notes: [createTestNote({
            id: "shared-note",
            startTick: 120,
            velocity: 84,
            enabled: false,
          })],
        },
        {
          id: "clip-second",
          measureCount: 1,
          notes: [createTestNote({
            id: "shared-note",
            startTick: 240,
            durationTicks: 360,
            pitch: 67,
          })],
        },
      ],
    });
    const firstClip = project.clipsById["clip-first"]!;
    const secondClip = project.clipsById["clip-second"]!;
    const firstScale = firstClip.timeline.timeMap.scaleMarkers[0]!;
    const secondScale = secondClip.timeline.timeMap.scaleMarkers[0]!;
    const sources: readonly Clip[] = [
      {
        ...firstClip,
        instrumentStatesById: {
          [INSTRUMENT_ID]: { locked: true },
        },
        timeline: {
          ...firstClip.timeline,
          timeMap: {
            ...firstClip.timeline.timeMap,
            tempoMarkers: [
              { startTick: 0, bpm: 100 },
              { startTick: 1_920, bpm: 110 },
            ],
          },
        },
      },
      {
        ...secondClip,
        timeline: {
          durationTicks: 3_360,
          timeMap: {
            meterMarkers: [{
              startTick: 0,
              timeSignature: {
                numerator: 7,
                denominator: 8,
                beatGroups: [2, 2, 3],
              },
            }],
            tempoMarkers: [
              { startTick: 0, bpm: 90 },
              { startTick: 1_680, bpm: 95 },
            ],
            scaleMarkers: [
              { ...secondScale, startTick: 0 },
              { ...secondScale, startTick: 1_680 },
            ],
          },
        },
      },
    ];

    const result = concatenateClips(sources, createOptions());

    expect(result.timeline.durationTicks).toBe(7_200);
    expect(result.timeline.timeMap.meterMarkers.map(
      (marker) => marker.startTick,
    )).toEqual([0, 3_840]);
    expect(result.timeline.timeMap.tempoMarkers).toEqual([
      { startTick: 0, bpm: 100 },
      { startTick: 1_920, bpm: 110 },
      { startTick: 3_840, bpm: 90 },
      { startTick: 5_520, bpm: 95 },
    ]);
    expect(result.timeline.timeMap.scaleMarkers.map(
      (marker) => marker.startTick,
    )).toEqual([0, 3_840, 5_520]);
    expect(result.timeline.timeMap.scaleMarkers[0]).toEqual(firstScale);
    expect(result.timeline.timeMap.meterMarkers[1]?.timeSignature.beatGroups)
      .toEqual([2, 2, 3]);

    const notes = result.tracksByInstrumentId[INSTRUMENT_ID]?.notesById;

    expect(notes?.["joined-0-shared-note"]).toEqual({
      ...sources[0]!.tracksByInstrumentId[INSTRUMENT_ID]!
        .notesById["shared-note"],
      id: "joined-0-shared-note",
      startTick: 120,
    });
    expect(notes?.["joined-1-shared-note"]).toEqual({
      ...sources[1]!.tracksByInstrumentId[INSTRUMENT_ID]!
        .notesById["shared-note"],
      id: "joined-1-shared-note",
      startTick: 4_080,
    });
    expect(result.instrumentStatesById[INSTRUMENT_ID]).toEqual({
      locked: true,
    });
    expect(result.transportSettings).toEqual({
      loop: { startTick: 0, endTick: 7_200 },
      loopEnabled: false,
    });

    const store = new ProjectStore(project);

    expect(() => store.dispatch({
      transactionId: "add-concatenated-clip",
      createdAt: 1,
      commands: [{ type: "AddClip", clip: result }],
    })).not.toThrow();
  });

  test("returns an independent clip even for one source", () => {
    const project = createTestProject({
      clips: [{
        id: "clip-source",
        notes: [createTestNote({ id: "source-note" })],
      }],
    });
    const source = project.clipsById["clip-source"]!;

    const result = concatenateClips([source], createOptions());

    expect(result).not.toBe(source);
    expect(result.timeline).not.toBe(source.timeline);
    expect(result.timeline.timeMap).not.toBe(source.timeline.timeMap);
    expect(result.tracksByInstrumentId[INSTRUMENT_ID])
      .not.toBe(source.tracksByInstrumentId[INSTRUMENT_ID]);
    expect(result.instrumentStatesById[INSTRUMENT_ID])
      .not.toBe(source.instrumentStatesById[INSTRUMENT_ID]);
    expect(result.tracksByInstrumentId[INSTRUMENT_ID]?.notesById)
      .toHaveProperty("joined-0-source-note");
  });

  test("rejects an empty source list", () => {
    expect(() => concatenateClips([], createOptions()))
      .toThrow("At least one clip is required");
  });

  test("rejects clips with different instrument sets", () => {
    const project = createTestProject({
      instrumentIds: ["instrument-a", "instrument-b"],
      clips: [{ id: "clip-a" }, { id: "clip-b" }],
    });
    const first = project.clipsById["clip-a"]!;
    const second = project.clipsById["clip-b"]!;
    const incompatible: Clip = {
      ...second,
      tracksByInstrumentId: {
        "instrument-a": second.tracksByInstrumentId["instrument-a"]!,
      },
      instrumentStatesById: {
        "instrument-a": second.instrumentStatesById["instrument-a"]!,
      },
    };

    expect(() => concatenateClips([first, incompatible], createOptions()))
      .toThrow("does not contain the same instruments");
  });

  test("rejects duplicate IDs returned by the note factory", () => {
    const project = createTestProject({
      clips: [
        {
          id: "clip-a",
          notes: [createTestNote({ id: "note-a" })],
        },
        {
          id: "clip-b",
          notes: [createTestNote({ id: "note-b" })],
        },
      ],
    });
    const clips = project.clipOrder.map(
      (clipId) => project.clipsById[clipId]!,
    );

    expect(() => concatenateClips(clips, {
      ...createOptions(),
      createNoteId: () => "duplicate-note",
    })).toThrow("is not unique");
  });
});

function createOptions(): ConcatenateClipsOptions {
  return {
    id: "clip-concatenated",
    name: "Concatenated clip",
    color: "#123456",
    clock: createTestProject().clock,
    createNoteId: ({ sourceClipIndex, sourceNote }) =>
      `joined-${sourceClipIndex}-${sourceNote.id}`,
  };
}
