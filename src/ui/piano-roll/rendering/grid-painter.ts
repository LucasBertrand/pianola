import {
  APPLICATION_COLORS,
} from "../../../config/application-colors";
import {
  RENDERING_CONSTANTS,
} from "../../../config/rendering-config";
import {
  type ProjectClock,
  type TimeSignature,
} from "../../../domain/transport/transport";
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
  readonly timeSignature: TimeSignature;
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
    timeSignature,
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
    timeSignature,
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

  drawTickLines(
    context,
    devicePixelRatio,
    converter,
    region,
    height,
    effectiveResolutionTicks,
    SUBDIVISION_LINE_COLOR,
  );
  const ticksPerBeat = clock.ppqn * 4 / timeSignature.denominator;

  drawTickLines(
    context,
    devicePixelRatio,
    converter,
    region,
    height,
    ticksPerBeat,
    BEAT_LINE_COLOR,
  );
  drawTickLines(
    context,
    devicePixelRatio,
    converter,
    region,
    height,
    ticksPerBeat * timeSignature.numerator,
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
  timeSignature: TimeSignature,
): void {
  const ticksPerMeasure =
    clock.ppqn * 4 / timeSignature.denominator * timeSignature.numerator;

  if (!Number.isSafeInteger(ticksPerMeasure) || ticksPerMeasure <= 0) {
    return;
  }

  let measureIndex = Math.max(
    0,
    Math.floor(region.startTick / ticksPerMeasure),
  );

  if (measureIndex % 2 === 0) {
    measureIndex += 1;
  }

  context.fillStyle = ALTERNATE_MEASURE_COLOR;

  for (
    let startTick = measureIndex * ticksPerMeasure;
    startTick < region.endTick;
    startTick += ticksPerMeasure * 2
  ) {
    const startX = Math.max(0, converter.tickToCssPixelX(startTick));
    const endX = Math.min(
      width,
      converter.tickToCssPixelX(startTick + ticksPerMeasure),
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

function drawTickLines(
  context: CanvasRenderingContext2D,
  devicePixelRatio: number,
  converter: CoordinateConverter,
  region: Rect,
  height: number,
  resolutionTicks: number,
  color: string,
): void {
  if (!Number.isFinite(resolutionTicks) || resolutionTicks <= 0) {
    return;
  }

  const firstTick =
    Math.floor(region.startTick / resolutionTicks) * resolutionTicks;

  for (
    let tick = firstTick;
    tick <= region.endTick;
    tick += resolutionTicks
  ) {
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
