import {
  APPLICATION_COLORS,
} from "../../../config/application-colors";
import type {
  ProjectClock,
  TimeSignature,
} from "../../../domain/model";
import type {
  ViewportState,
} from "../../../editor/geometry/converter";
import {
  APPLICATION_SURFACE_COLOR,
} from "./theme";

export interface RulerPaintSnapshot {
  readonly context: CanvasRenderingContext2D;
  readonly widthCssPixels: number;
  readonly heightCssPixels: number;
  readonly devicePixelRatio: number;
  readonly viewport: ViewportState;
  readonly clock: ProjectClock;
  readonly timeSignature: TimeSignature;
  readonly durationTicks: number;
  readonly measureCount: number;
  readonly gridResolutionTicks: number;
}

export function paintRuler(snapshot: RulerPaintSnapshot): void {
  const {
    context,
    widthCssPixels,
    heightCssPixels,
    devicePixelRatio,
    viewport,
    clock,
    timeSignature,
    durationTicks,
    measureCount,
    gridResolutionTicks,
  } = snapshot;
  const pixelsPerTick = viewport.zoomX / viewport.ticksPerPixel;
  const firstVisibleTick = viewport.scrollX / pixelsPerTick;
  const lastVisibleTick = Math.min(
    durationTicks,
    firstVisibleTick + widthCssPixels / pixelsPerTick,
  );
  const ticksPerBeat = clock.ppqn * 4 / timeSignature.denominator;
  const ticksPerBar = ticksPerBeat * timeSignature.numerator;
  const effectiveGridTicks = getVisibleGridResolution(
    gridResolutionTicks,
    pixelsPerTick,
  );

  context.fillStyle = APPLICATION_SURFACE_COLOR;
  context.fillRect(0, 0, widthCssPixels, heightCssPixels);
  drawRulerTicks(
    context,
    firstVisibleTick,
    lastVisibleTick,
    effectiveGridTicks,
    pixelsPerTick,
    viewport.scrollX,
    heightCssPixels,
    5,
    devicePixelRatio,
    APPLICATION_COLORS.pianoRoll.rulerSubdivision,
  );
  drawRulerTicks(
    context,
    firstVisibleTick,
    lastVisibleTick,
    ticksPerBeat,
    pixelsPerTick,
    viewport.scrollX,
    heightCssPixels,
    10,
    devicePixelRatio,
    APPLICATION_COLORS.pianoRoll.rulerBeat,
  );
  drawRulerTicks(
    context,
    firstVisibleTick,
    lastVisibleTick,
    ticksPerBar,
    pixelsPerTick,
    viewport.scrollX,
    heightCssPixels,
    heightCssPixels,
    devicePixelRatio,
    APPLICATION_COLORS.pianoRoll.rulerBar,
  );

  context.fillStyle = APPLICATION_COLORS.pianoRoll.rulerText;
  context.font = '9px "SFMono-Regular", Consolas, monospace';
  context.textBaseline = "top";

  const firstBarIndex = Math.max(
    0,
    Math.floor(firstVisibleTick / ticksPerBar),
  );
  const lastBarIndex = Math.ceil(lastVisibleTick / ticksPerBar);

  for (
    let barIndex = firstBarIndex;
    barIndex <= Math.min(lastBarIndex, measureCount - 1);
    barIndex += 1
  ) {
    const x =
      barIndex * ticksPerBar * pixelsPerTick - viewport.scrollX;

    context.fillText(String(barIndex + 1), x + 7, 22);
  }
}

function getVisibleGridResolution(
  requestedTicks: number,
  pixelsPerTick: number,
): number {
  let resolutionTicks = requestedTicks;

  while (
    resolutionTicks * pixelsPerTick < 4
    && Number.isSafeInteger(resolutionTicks * 2)
  ) {
    resolutionTicks *= 2;
  }

  return resolutionTicks;
}

function drawRulerTicks(
  context: CanvasRenderingContext2D,
  firstVisibleTick: number,
  lastVisibleTick: number,
  intervalTicks: number,
  pixelsPerTick: number,
  scrollX: number,
  rulerHeight: number,
  markerHeight: number,
  devicePixelRatio: number,
  color: string,
): void {
  if (!Number.isFinite(intervalTicks) || intervalTicks <= 0) {
    return;
  }

  const firstTick =
    Math.floor(firstVisibleTick / intervalTicks) * intervalTicks;
  const lineWidth = 1 / devicePixelRatio;

  context.fillStyle = color;

  for (
    let tick = firstTick;
    tick <= lastVisibleTick;
    tick += intervalTicks
  ) {
    const rawX = tick * pixelsPerTick - scrollX;
    const x = Math.round(rawX * devicePixelRatio) / devicePixelRatio;

    context.fillRect(
      x,
      rulerHeight - markerHeight,
      lineWidth,
      markerHeight,
    );
  }
}
