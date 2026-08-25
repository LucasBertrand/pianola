import { describe, expect, test } from "vitest";
import {
  createDefaultProjectClock,
} from "../../../../domain/transport/transport";
import {
  createDefaultTimeMap,
} from "../../../../domain/transport/time-map";
import {
  type Note,
} from "../../../../domain/notes/note";
import {
  CoordinateConverter,
  type ViewportState,
} from "../../../../editor/geometry/converter";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
} from "../../../../music/pitch-snap";
import {
  APPLICATION_COLORS,
} from "../../../../config/application-colors";
import { paintGrid } from "../grid-painter";
import { paintNotes } from "../note-painter";
import { paintRuler } from "../ruler-painter";

interface PaintRecorder {
  readonly fillRects: Array<readonly [number, number, number, number]>;
  readonly fillOperations: Array<{
    readonly color: string;
    readonly alpha: number;
  }>;
  readonly labels: string[];
  readonly labelPositions: Array<readonly [number, number]>;
  readonly context: CanvasRenderingContext2D;
}

const VIEWPORT: ViewportState = {
  zoomX: 1,
  zoomY: 1,
  scrollX: 0,
  scrollY: 0,
  pitchHeight: 12,
  ticksPerPixel: 4,
  devicePixelRatio: 1,
};

describe("P3 Canvas painter contracts", () => {
  test("paints a grid from an explicit snapshot", () => {
    const recorder = createPaintRecorder();

    paintGrid({
      context: recorder.context,
      widthCssPixels: 480,
      heightCssPixels: 240,
      devicePixelRatio: 1,
      converter: new CoordinateConverter(VIEWPORT),
      visibleRegion: {
        startTick: 0,
        endTick: 1_920,
        minPitch: 48,
        maxPitch: 72,
      },
      gridResolutionTicks: 240,
      pitchSnapSettings: DEFAULT_PITCH_SNAP_SETTINGS,
      highlightedPitch: 60,
      clock: createDefaultProjectClock(),
      timeMap: createDefaultTimeMap(),
      durationTicks: 3_840,
    });

    expect(recorder.fillRects.length).toBeGreaterThan(20);
    expect(recorder.fillRects[0]).toEqual([0, 0, 480, 240]);
  });

  test("uses pitch-class colors for a rootless chromatic grid", () => {
    const recorder = createPaintRecorder();

    paintGrid({
      context: recorder.context,
      widthCssPixels: 480,
      heightCssPixels: 144,
      devicePixelRatio: 1,
      converter: new CoordinateConverter(VIEWPORT),
      visibleRegion: {
        startTick: 0,
        endTick: 1_920,
        minPitch: 60,
        maxPitch: 71,
      },
      gridResolutionTicks: 240,
      pitchSnapSettings: {
        ...DEFAULT_PITCH_SNAP_SETTINGS,
        visualGuideEnabled: true,
      },
      highlightedPitch: null,
      clock: createDefaultProjectClock(),
      timeMap: createDefaultTimeMap(),
      durationTicks: 3_840,
    });

    for (const color of APPLICATION_COLORS.notes.pitchClassPalette) {
      expect(recorder.fillOperations).toContainEqual({
        color,
        alpha: 0.1,
      });
    }
  });

  test("uses absolute pitch-class colors in a rooted tonal grid", () => {
    const recorder = createPaintRecorder();

    paintGrid({
      context: recorder.context,
      widthCssPixels: 480,
      heightCssPixels: 144,
      devicePixelRatio: 1,
      converter: new CoordinateConverter(VIEWPORT),
      visibleRegion: {
        startTick: 0,
        endTick: 1_920,
        minPitch: 60,
        maxPitch: 71,
      },
      gridResolutionTicks: 240,
      pitchSnapSettings: {
        ...DEFAULT_PITCH_SNAP_SETTINGS,
        visualGuideEnabled: true,
      },
      highlightedPitch: null,
      clock: createDefaultProjectClock(),
      timeMap: {
        ...createDefaultTimeMap(),
        scaleMarkers: [{
          startTick: 0,
          rootNote: "D",
          patternType: "scale",
          patternId: "ionian",
        }],
      },
      durationTicks: 3_840,
    });

    expect(recorder.fillOperations).toContainEqual({
      color: APPLICATION_COLORS.notes.pitchClassPalette[2] ?? "",
      alpha: 0.24,
    });
    expect(recorder.fillOperations).toContainEqual({
      color: APPLICATION_COLORS.notes.pitchClassPalette[4] ?? "",
      alpha: 0.1,
    });
    expect(recorder.fillOperations).not.toContainEqual({
      color: APPLICATION_COLORS.notes.pitchClassPalette[5] ?? "",
      alpha: 0.1,
    });
  });

  test("paints notes from a pre-culled projection", () => {
    const recorder = createPaintRecorder();
    const notes: Note[] = [
      createNote("second", 67, 480),
      createNote("first", 60, 0),
    ];

    paintNotes({
      context: recorder.context,
      converter: new CoordinateConverter(VIEWPORT),
      visibleNotes: notes,
      editingNoteIds: new Set(),
      stylesByInstrumentId: {
        instrument: {
          fillStyle: "#abcdef",
          opacity: 1,
        },
      },
      instrumentOrder: ["instrument"],
      colorMode: "instrument",
      globalPitchSnapSettings: DEFAULT_PITCH_SNAP_SETTINGS,
      timeMap: createDefaultTimeMap(),
    });

    expect(notes.map((note) => note.id)).toEqual(["first", "second"]);
    expect(recorder.fillRects).toHaveLength(2);
    expect(recorder.labels).toHaveLength(2);
  });

  test("keeps a note label visible when its beginning is left of the viewport", () => {
    const recorder = createPaintRecorder();

    paintNotes({
      context: recorder.context,
      converter: new CoordinateConverter({
        ...VIEWPORT,
        scrollX: 60,
      }),
      visibleNotes: [createNote("continued", 60, 0)],
      editingNoteIds: new Set(),
      stylesByInstrumentId: {
        instrument: {
          fillStyle: "#abcdef",
          opacity: 1,
        },
      },
      instrumentOrder: ["instrument"],
      colorMode: "instrument",
      globalPitchSnapSettings: DEFAULT_PITCH_SNAP_SETTINGS,
      timeMap: createDefaultTimeMap(),
    });

    expect(recorder.labels).toEqual(["C4"]);
    expect(recorder.labelPositions[0]?.[0]).toBe(2);
  });

  test("paints a new note spelling across an enharmonic scale boundary", () => {
    const recorder = createPaintRecorder();
    const note = {
      ...createNote("enharmonic", 61, 0),
      durationTicks: 960,
    };

    paintNotes({
      context: recorder.context,
      converter: new CoordinateConverter(VIEWPORT),
      visibleNotes: [note],
      editingNoteIds: new Set(),
      stylesByInstrumentId: {
        instrument: {
          fillStyle: "#abcdef",
          opacity: 1,
        },
      },
      instrumentOrder: ["instrument"],
      colorMode: "instrument",
      globalPitchSnapSettings: DEFAULT_PITCH_SNAP_SETTINGS,
      timeMap: {
        ...createDefaultTimeMap(),
        scaleMarkers: [
          {
            startTick: 0,
            rootNote: "C#",
            patternType: "scale",
            patternId: "ionian",
          },
          {
            startTick: 480,
            rootNote: "Db",
            patternType: "scale",
            patternId: "ionian",
          },
        ],
      },
    });

    expect(recorder.labels).toEqual(["C#4", "Db4"]);
    expect(recorder.labelPositions.map(([x]) => x)).toEqual([2, 122]);
  });

  test("paints ruler labels from clock and timeline inputs", () => {
    const recorder = createPaintRecorder();

    paintRuler({
      context: recorder.context,
      widthCssPixels: 960,
      heightCssPixels: 36,
      devicePixelRatio: 1,
      viewport: VIEWPORT,
      clock: createDefaultProjectClock(),
      timeMap: createDefaultTimeMap(),
      durationTicks: 7_680,
      gridResolutionTicks: 240,
    });

    expect(recorder.labels).toEqual(["1", "2"]);
    expect(recorder.fillRects.length).toBeGreaterThan(0);
  });
});

function createNote(id: string, pitch: number, startTick: number): Note {
  return {
    id,
    instrumentId: "instrument",
    pitch,
    startTick,
    durationTicks: 480,
    velocity: 100,
    status: "active",
  };
}

function createPaintRecorder(): PaintRecorder {
  const fillRects: Array<readonly [number, number, number, number]> = [];
  const fillOperations: Array<{ color: string; alpha: number }> = [];
  const labels: string[] = [];
  const labelPositions: Array<readonly [number, number]> = [];
  let currentFillStyle: string | CanvasGradient | CanvasPattern = "";
  let currentGlobalAlpha = 1;
  const context = {
    get fillStyle(): string | CanvasGradient | CanvasPattern {
      return currentFillStyle;
    },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      currentFillStyle = value;
    },
    font: "",
    get globalAlpha(): number {
      return currentGlobalAlpha;
    },
    set globalAlpha(value: number) {
      currentGlobalAlpha = value;
    },
    textAlign: "left",
    textBaseline: "alphabetic",
    fillRect(x: number, y: number, width: number, height: number): void {
      fillRects.push([x, y, width, height]);
      fillOperations.push({
        color: String(currentFillStyle),
        alpha: currentGlobalAlpha,
      });
    },
    strokeRect(): void {},
    fillText(label: string, x: number, y: number): void {
      labels.push(label);
      labelPositions.push([x, y]);
    },
    measureText(): TextMetrics {
      return { width: 8 } as TextMetrics;
    },
    createPattern(): CanvasPattern | null {
      return null;
    },
  } as unknown as CanvasRenderingContext2D;

  return { fillRects, fillOperations, labels, labelPositions, context };
}
