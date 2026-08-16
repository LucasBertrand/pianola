import {
  APPLICATION_COLORS,
} from "../../../config/application-colors";
import {
  RENDERING_CONSTANTS,
} from "../../../config/rendering-config";
import {
  type ProjectClock,
} from "../../../domain/transport/transport";
import {
  getBeatTicks,
  getMeasureBeatBoundaryTicks,
  getMeasureSpans,
  getMeasureSubdivisionTicks,
  type TimeMap,
} from "../../../domain/transport/time-map";
import {
  MAX_MIDI_PITCH,
  MIN_MIDI_PITCH,
  type CoordinateConverter,
} from "../../../editor/geometry/converter";
import type {
  Rect,
} from "../../../editor/geometry/rect";
import {
  getPitchScaleDegreeColorIndex,
  getPitchSnapRootPitchClass,
  isPitchAllowedByTonalPattern,
  type PitchSnapSettings,
} from "../../../music/pitch-snap";
import {
  APPLICATION_SURFACE_COLOR,
} from "./theme";

const BLACK_KEY_ROW_COLOR =
  RENDERING_CONSTANTS.gridBlackKeyRowColor;
const ALTERNATE_MEASURE_COLOR =
  RENDERING_CONSTANTS.gridAlternateMeasureColor;
const PITCH_LINE_COLOR =
  RENDERING_CONSTANTS.gridPitchLineColor;
const SUBDIVISION_LINE_COLOR =
  RENDERING_CONSTANTS.gridSubdivisionLineColor;
const BEAT_LINE_COLOR =
  RENDERING_CONSTANTS.gridBeatLineColor;
const BAR_LINE_COLOR =
  RENDERING_CONSTANTS.gridBarLineColor;
const MIN_GRID_LINE_SPACING_CSS_PIXELS =
  RENDERING_CONSTANTS.minimumGridLineSpacingCssPixels;
const MAX_GRID_LINES_PER_PASS =
  RENDERING_CONSTANTS.maximumGridLinesPerPass;
const TONAL_SNAP_PITCH_ROW_COLOR =
  RENDERING_CONSTANTS.tonalSnapPitchRowColor;
const TONAL_SNAP_TONIC_ROW_COLOR =
  RENDERING_CONSTANTS.tonalSnapTonicRowColor;
const ACTIVE_PITCH_LANE_COLOR =
  RENDERING_CONSTANTS.activePitchLaneColor;

/** Complete immutable input required by the grid painter. */
export interface GridPaintSnapshot {
  readonly context: CanvasRenderingContext2D;
  readonly widthCssPixels: number;
  readonly heightCssPixels: number;
  readonly devicePixelRatio: number;
  readonly converter: CoordinateConverter;
  readonly visibleRegion: Rect;
  readonly gridResolutionTicks: number;
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly highlightedPitch: number | null;
  readonly clock: ProjectClock;
  readonly timeMap: TimeMap;
  readonly durationTicks: number;
}

export function paintGrid(snapshot: GridPaintSnapshot): void {
  const {
    context,
    widthCssPixels: width,
    heightCssPixels: height,
    devicePixelRatio,
    converter,
    visibleRegion: region,
    gridResolutionTicks,
    pitchSnapSettings,
    highlightedPitch,
    clock,
    timeMap,
    durationTicks,
  } = snapshot;

  context.fillStyle = APPLICATION_SURFACE_COLOR;
  context.fillRect(0, 0, width, height);

  const firstPitch = Math.max(
    MIN_MIDI_PITCH,
    Math.ceil(region.minPitch),
  );
  const lastPitch = Math.min(
    MAX_MIDI_PITCH,
    Math.floor(region.maxPitch),
  );

  context.fillStyle = BLACK_KEY_ROW_COLOR;

  for (let pitch = firstPitch; pitch <= lastPitch; pitch += 1) {
    if (isBlackKey(pitch)) {
      const y = converter.pitchToCssPixelY(pitch);
      const nextY = converter.pitchToCssPixelY(pitch - 1);
      context.fillRect(0, y, width, nextY - y);
    }
  }

  paintAlternatingMeasures(
    context,
    converter,
    region,
    width,
    height,
    clock,
    timeMap,
    durationTicks,
  );

  if (pitchSnapSettings.visualGuideEnabled) {
    for (let pitch = firstPitch; pitch <= lastPitch; pitch += 1) {
      if (!isPitchAllowedByTonalPattern(pitch, pitchSnapSettings)) {
        continue;
      }

      const y = converter.pitchToCssPixelY(pitch);
      const nextY = converter.pitchToCssPixelY(pitch - 1);
      const pitchClass = ((pitch % 12) + 12) % 12;
      const degreeColorIndex = getPitchScaleDegreeColorIndex(
        pitch,
        pitchSnapSettings,
      );
      const degreePitchRowColor = degreeColorIndex === null
        ? undefined
        : APPLICATION_COLORS.pianoRoll.degreePitchRows[degreeColorIndex];
      const degreeRootRowColor = degreeColorIndex === null
        ? undefined
        : APPLICATION_COLORS.pianoRoll.degreeRootRows[degreeColorIndex];

      context.fillStyle = pitchClass
        === getPitchSnapRootPitchClass(pitchSnapSettings)
        ? degreeRootRowColor ?? TONAL_SNAP_TONIC_ROW_COLOR
        : degreePitchRowColor ?? TONAL_SNAP_PITCH_ROW_COLOR;
      context.fillRect(0, y, width, nextY - y);
    }
  }

  if (
    highlightedPitch !== null
    && highlightedPitch >= firstPitch
    && highlightedPitch <= lastPitch
  ) {
    const y = converter.pitchToCssPixelY(highlightedPitch);
    const nextY = converter.pitchToCssPixelY(highlightedPitch - 1);

    context.fillStyle = ACTIVE_PITCH_LANE_COLOR;
    context.fillRect(0, y, width, nextY - y);
  }

  for (let pitch = firstPitch; pitch <= lastPitch; pitch += 1) {
    fillHorizontalDeviceLine(
      context,
      converter.pitchToCssPixelY(pitch),
      width,
      devicePixelRatio,
      PITCH_LINE_COLOR,
    );
  }

  if (!Number.isSafeInteger(gridResolutionTicks) || gridResolutionTicks <= 0) {
    return;
  }

  const effectiveResolutionTicks = getEffectiveGridResolution(
    converter,
    region,
    gridResolutionTicks,
  );

  const measureSpans = getMeasureSpans(
    clock.ppqn,
    timeMap,
    durationTicks,
  );
  const subdivisionBoundaryTicks: number[] = [];
  const beatBoundaryTicks: number[] = [];
  const barBoundaryTicks: number[] = [];

  for (const span of measureSpans) {
    if (span.endTick <= region.startTick) {
      continue;
    }

    if (span.startTick > region.endTick) {
      break;
    }

    barBoundaryTicks.push(span.startTick);

    for (
      const subdivisionTick of getMeasureSubdivisionTicks(
        span,
        effectiveResolutionTicks,
      )
    ) {
      subdivisionBoundaryTicks.push(subdivisionTick);
    }

    const beatDurations = getBeatTicks(clock.ppqn, span.timeSignature);
    const beatStarts = getMeasureBeatBoundaryTicks(clock.ppqn, span);

    beatStarts.forEach((beatTick, i) => {
      const duration = beatDurations[i];
      if (
        beatTick !== span.startTick
        && duration !== undefined
        && duration % effectiveResolutionTicks === 0
      ) {
        beatBoundaryTicks.push(beatTick);
      }
    });
  }

  drawTickList(
    context,
    devicePixelRatio,
    converter,
    height,
    subdivisionBoundaryTicks,
    SUBDIVISION_LINE_COLOR,
  );
  drawTickList(
    context,
    devicePixelRatio,
    converter,
    height,
    beatBoundaryTicks,
    BEAT_LINE_COLOR,
  );
  drawTickList(
    context,
    devicePixelRatio,
    converter,
    height,
    barBoundaryTicks,
    BAR_LINE_COLOR,
  );
}

function paintAlternatingMeasures(
  context: CanvasRenderingContext2D,
  converter: CoordinateConverter,
  region: Rect,
  width: number,
  height: number,
  clock: ProjectClock,
  timeMap: TimeMap,
  durationTicks: number,
): void {
  const measureSpans = getMeasureSpans(
    clock.ppqn,
    timeMap,
    durationTicks,
  );

  context.fillStyle = ALTERNATE_MEASURE_COLOR;

  for (const span of measureSpans) {
    if (span.endTick <= region.startTick) {
      continue;
    }

    if (span.startTick >= region.endTick) {
      break;
    }

    if (span.index % 2 === 0) {
      continue;
    }

    const startX = Math.max(0, converter.tickToCssPixelX(span.startTick));
    const endX = Math.min(
      width,
      converter.tickToCssPixelX(span.endTick),
    );

    if (endX > startX) {
      context.fillRect(startX, 0, endX - startX, height);
    }
  }
}

function getEffectiveGridResolution(
  converter: CoordinateConverter,
  region: Rect,
  requestedResolutionTicks: number,
): number {
  let resolutionTicks = requestedResolutionTicks;
  let lineSpacing = Math.abs(
    converter.tickToCssPixelX(resolutionTicks)
    - converter.tickToCssPixelX(0),
  );
  const visibleTickSpan = Math.max(0, region.endTick - region.startTick);

  while (
    lineSpacing < MIN_GRID_LINE_SPACING_CSS_PIXELS
    || visibleTickSpan / resolutionTicks > MAX_GRID_LINES_PER_PASS
  ) {
    resolutionTicks *= 2;
    lineSpacing *= 2;

    if (!Number.isSafeInteger(resolutionTicks)) {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  return resolutionTicks;
}

function drawTickList(
  context: CanvasRenderingContext2D,
  devicePixelRatio: number,
  converter: CoordinateConverter,
  height: number,
  ticks: readonly number[],
  color: string,
): void {
  for (const tick of ticks) {
    fillVerticalDeviceLine(
      context,
      converter.tickToCssPixelX(tick),
      height,
      devicePixelRatio,
      color,
    );
  }
}

function fillVerticalDeviceLine(
  context: CanvasRenderingContext2D,
  x: number,
  height: number,
  devicePixelRatio: number,
  color: string,
): void {
  const lineWidth = 1 / devicePixelRatio;
  const alignedX = Math.round(x * devicePixelRatio) / devicePixelRatio;

  context.fillStyle = color;
  context.fillRect(alignedX, 0, lineWidth, height);
}

function fillHorizontalDeviceLine(
  context: CanvasRenderingContext2D,
  y: number,
  width: number,
  devicePixelRatio: number,
  color: string,
): void {
  const lineHeight = 1 / devicePixelRatio;
  const alignedY = Math.round(y * devicePixelRatio) / devicePixelRatio;

  context.fillStyle = color;
  context.fillRect(0, alignedY, width, lineHeight);
}

function isBlackKey(pitch: number): boolean {
  const pitchClass = pitch % 12;

  return (
    pitchClass === 1
    || pitchClass === 3
    || pitchClass === 6
    || pitchClass === 8
    || pitchClass === 10
  );
}
