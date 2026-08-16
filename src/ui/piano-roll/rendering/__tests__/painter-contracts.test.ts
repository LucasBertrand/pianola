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
import { paintGrid } from "../grid-painter";
import { paintNotes } from "../note-painter";
import { paintRuler } from "../ruler-painter";

interface PaintRecorder {
  readonly fillRects: Array<readonly [number, number, number, number]>;
  readonly labels: string[];
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
          locked: false,
        },
      },
      instrumentOrder: ["instrument"],
      colorMode: "instrument",
      pitchLabelSettings: DEFAULT_PITCH_SNAP_SETTINGS,
    });

    expect(notes.map((note) => note.id)).toEqual(["first", "second"]);
    expect(recorder.fillRects).toHaveLength(2);
    expect(recorder.labels).toHaveLength(2);
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
    enabled: true,
  };
}

function createPaintRecorder(): PaintRecorder {
  const fillRects: Array<readonly [number, number, number, number]> = [];
  const labels: string[] = [];
  const context = {
    fillStyle: "",
    font: "",
    globalAlpha: 1,
    textAlign: "left",
    textBaseline: "alphabetic",
    fillRect(x: number, y: number, width: number, height: number): void {
      fillRects.push([x, y, width, height]);
    },
    strokeRect(): void {},
    fillText(label: string): void {
      labels.push(label);
    },
    measureText(): TextMetrics {
      return { width: 8 } as TextMetrics;
    },
    createPattern(): CanvasPattern | null {
      return null;
    },
  } as unknown as CanvasRenderingContext2D;

  return { fillRects, labels, context };
}
