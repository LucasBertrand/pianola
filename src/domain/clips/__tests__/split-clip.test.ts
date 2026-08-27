import { describe, expect, test } from "vitest";
import {
  findClipHierarchyGroup,
  getClipPlaybackOrder,
} from "../clip-hierarchy";
import {
  getClipSplitPoints,
  splitClip,
  type SplitClipOptions,
} from "../split-clip";
import { ProjectStore } from "../../project-store";
import {
  createTestNote,
  createTestProject,
} from "../../../../tests/support/test-builders";

const INSTRUMENT_ID = "instrument-a";
const MEASURE_TICKS = 3_840;

describe("clip splitting", () => {
  test("slices a note crossing a measure boundary into consecutive clips", () => {
    const project = createTestProject({
      clips: [{
        id: "clip-source",
        measureCount: 2,
        notes: [createTestNote({
          id: "note-crossing",
          startTick: 3_600,
          durationTicks: 480,
          velocity: 91,
          muted: true,
        })],
      }],
    });
    const source = project.clipsById["clip-source"]!;

    const result = splitClip(source, createOptions(project.clock));

    expect(result).toHaveLength(2);
    expect(result[0]?.tracksByInstrumentId[INSTRUMENT_ID]
      ?.notesById["split-0-note-crossing"]).toEqual({
      ...source.tracksByInstrumentId[INSTRUMENT_ID]
        ?.notesById["note-crossing"],
      id: "split-0-note-crossing",
      startTick: 3_600,
      durationTicks: 240,
    });
    expect(result[1]?.tracksByInstrumentId[INSTRUMENT_ID]
      ?.notesById["split-1-note-crossing"]).toEqual({
      ...source.tracksByInstrumentId[INSTRUMENT_ID]
        ?.notesById["note-crossing"],
      id: "split-1-note-crossing",
      startTick: 0,
      durationTicks: 240,
    });
    expect(source.tracksByInstrumentId[INSTRUMENT_ID]
      ?.notesById["note-crossing"]?.durationTicks).toBe(480);
  });

  test("injects active meter, tempo and scale markers at tick zero", () => {
    const project = createTestProject({
      clips: [{ id: "clip-source", measureCount: 4 }],
    });
    const source = project.clipsById["clip-source"]!;
    const initialScale = source.timeline.timeMap.scaleMarkers[0]!;
    const sourceWithContextChanges = {
      ...source,
      timeline: {
        ...source.timeline,
        timeMap: {
          ...source.timeline.timeMap,
          tempoMarkers: [
            { startTick: 0, bpm: 120 },
            { startTick: 1_000, bpm: 90 },
            { startTick: 5_000, bpm: 110 },
          ],
          scaleMarkers: [
            initialScale,
            {
              ...initialScale,
              startTick: 2_000,
              rootNote: "D",
              patternId: "ionian",
            },
            {
              ...initialScale,
              startTick: 6_000,
              rootNote: "E",
              patternId: "ionian",
            },
          ],
        },
      },
    };

    const result = splitClip(
      sourceWithContextChanges,
      createOptions(project.clock),
    );
    const secondTimeMap = result[1]?.timeline.timeMap;
    const thirdTimeMap = result[2]?.timeline.timeMap;

    expect(result).toHaveLength(4);
    expect(secondTimeMap?.meterMarkers[0]).toEqual(
      source.timeline.timeMap.meterMarkers[0],
    );
    expect(secondTimeMap?.tempoMarkers).toEqual([
      { startTick: 0, bpm: 90 },
      { startTick: 1_160, bpm: 110 },
    ]);
    expect(secondTimeMap?.scaleMarkers).toEqual([
      {
        ...initialScale,
        startTick: 0,
        rootNote: "D",
        patternId: "ionian",
      },
      {
        ...initialScale,
        startTick: 2_160,
        rootNote: "E",
        patternId: "ionian",
      },
    ]);
    expect(thirdTimeMap?.meterMarkers[0]?.startTick).toBe(0);
    expect(thirdTimeMap?.tempoMarkers).toEqual([
      { startTick: 0, bpm: 110 },
    ]);
    expect(thirdTimeMap?.scaleMarkers).toEqual([
      {
        ...initialScale,
        startTick: 0,
        rootNote: "E",
        patternId: "ionian",
      },
    ]);
  });

  test("uses only selected section markers that are measure boundaries", () => {
    const project = createTestProject({
      clips: [{ id: "clip-source", measureCount: 4 }],
    });
    const source = project.clipsById["clip-source"]!;
    const sourceWithSections = {
      ...source,
      timeline: {
        ...source.timeline,
        timeMap: {
          ...source.timeline.timeMap,
          sectionMarkers: [
            { startTick: 1_920, comment: "Half measure" },
            { startTick: MEASURE_TICKS, comment: "Verse" },
            { startTick: 2 * MEASURE_TICKS, comment: "Chorus" },
          ],
        },
      },
    };

    const splitPoints = getClipSplitPoints(
      sourceWithSections,
      project.clock,
      {
        type: "section-markers",
        selectedSectionMarkerTicks: [2 * MEASURE_TICKS],
      },
    );
    const result = splitClip(sourceWithSections, {
      ...createOptions(project.clock),
      strategy: {
        type: "section-markers",
        selectedSectionMarkerTicks: [2 * MEASURE_TICKS],
      },
    });

    expect(splitPoints).toEqual([2 * MEASURE_TICKS]);
    expect(result).toHaveLength(2);
    expect(result[1]?.timeline.timeMap.sectionMarkers[0]).toEqual({
      startTick: 0,
      comment: "Chorus",
    });
    expect(() => getClipSplitPoints(
      sourceWithSections,
      project.clock,
      {
        type: "section-markers",
        selectedSectionMarkerTicks: [1_920],
      },
    )).toThrow("not on an internal measure boundary");
  });

  test("atomically replaces a nested source clip with a group", () => {
    const project = createTestProject({
      clips: [
        { id: "clip-before" },
        { id: "clip-source", measureCount: 2, bypassEnabled: true },
        { id: "clip-after" },
      ],
      activeClipId: "clip-before",
    });
    const source = project.clipsById["clip-source"]!;
    const splitClips = splitClip(source, createOptions(project.clock));
    const nestedProject = {
      ...project,
      clipHierarchy: [{
        kind: "group" as const,
        id: "group-outer",
        name: "Outer",
        color: "#79a7ff",
        bypassEnabled: false,
        children: [
          { kind: "clip" as const, clipId: "clip-before" },
          { kind: "clip" as const, clipId: "clip-source" },
          { kind: "clip" as const, clipId: "clip-after" },
        ],
      }],
    };
    const store = new ProjectStore(nestedProject);

    store.dispatch({
      transactionId: "split-clip",
      createdAt: 1,
      commands: [{
        type: "SplitClipIntoGroup",
        sourceClipId: source.id,
        groupId: "group-split",
        clips: splitClips,
      }],
    });

    expect(getClipPlaybackOrder(store.getState().clipHierarchy)).toEqual([
      "clip-before",
      "clip-split-0",
      "clip-split-1",
      "clip-after",
    ]);
    expect(store.getState().clipsById["clip-source"]).toBeUndefined();
    expect(findClipHierarchyGroup(
      store.getState().clipHierarchy,
      "group-split",
    )).toMatchObject({
      name: source.name,
      color: source.color,
      bypassEnabled: true,
      children: [
        { kind: "clip", clipId: "clip-split-0" },
        { kind: "clip", clipId: "clip-split-1" },
      ],
    });
    expect(splitClips.every((clip) => !clip.bypassEnabled)).toBe(true);

    store.undo();
    expect(getClipPlaybackOrder(store.getState().clipHierarchy)).toEqual([
      "clip-before",
      "clip-source",
      "clip-after",
    ]);
    store.redo();
    expect(store.getState().clipsById["clip-split-1"]).toBeDefined();
  });
});

function createOptions(
  clock: ReturnType<typeof createTestProject>["clock"],
): SplitClipOptions {
  return {
    clock,
    strategy: { type: "measures" },
    createClipId: ({ segmentIndex }) => `clip-split-${String(segmentIndex)}`,
    createNoteId: ({ segmentIndex, sourceNote }) =>
      `split-${String(segmentIndex)}-${sourceNote.id}`,
  };
}
