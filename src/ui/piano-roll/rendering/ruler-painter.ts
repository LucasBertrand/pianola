import {
  APPLICATION_COLORS,
} from "../../../config/application-colors";
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
  readonly timeMap: TimeMap;
  readonly durationTicks: number;
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
    timeMap,
    durationTicks,
    gridResolutionTicks,
  } = snapshot;
  const pixelsPerTick = viewport.zoomX / viewport.ticksPerPixel;
  const firstVisibleTick = viewport.scrollX / pixelsPerTick;
  const lastVisibleTick = Math.min(
    durationTicks,
    firstVisibleTick + widthCssPixels / pixelsPerTick,
  );
  const effectiveGridTicks = getVisibleGridResolution(
    gridResolutionTicks,
    pixelsPerTick,
  );

  context.fillStyle = APPLICATION_SURFACE_COLOR;
  context.fillRect(0, 0, widthCssPixels, heightCssPixels);

  const measureSpans = getMeasureSpans(clock.ppqn, timeMap, durationTicks);
  const subdivisionBoundaryTicks: number[] = [];

  for (const span of measureSpans) {
    if (span.endTick <= firstVisibleTick) {
      continue;
    }

    if (span.startTick > lastVisibleTick) {
      break;
    }

    for (
      const subdivisionTick of getMeasureSubdivisionTicks(
        span,
        effectiveGridTicks,
      )
    ) {
      subdivisionBoundaryTicks.push(subdivisionTick);
    }
  }

  drawRulerTickList(
    context,
    subdivisionBoundaryTicks,
    pixelsPerTick,
    viewport.scrollX,
    heightCssPixels,
    5,
    devicePixelRatio,
    APPLICATION_COLORS.pianoRoll.rulerSubdivision,
  );

  context.fillStyle = APPLICATION_COLORS.pianoRoll.rulerText;
  context.font = '9px "SFMono-Regular", Consolas, monospace';
  context.textBaseline = "top";

  for (const span of measureSpans) {
    if (span.endTick <= firstVisibleTick) {
      continue;
    }

    if (span.startTick > lastVisibleTick) {
      break;
    }

    const beatDurations = getBeatTicks(clock.ppqn, span.timeSignature);
    const filteredBeats = getMeasureBeatBoundaryTicks(clock.ppqn, span).filter(
      (tick, i) => {
        const duration = beatDurations[i];
        return tick !== span.startTick
          && duration !== undefined
          && duration % effectiveGridTicks === 0;
      },
    );
    drawRulerTickList(
      context,
      filteredBeats,
      pixelsPerTick,
      viewport.scrollX,
      heightCssPixels,
      10,
      devicePixelRatio,
      APPLICATION_COLORS.pianoRoll.rulerBeat,
    );
    drawRulerTickList(
      context,
      [span.startTick],
      pixelsPerTick,
      viewport.scrollX,
      heightCssPixels,
      heightCssPixels,
      devicePixelRatio,
      APPLICATION_COLORS.pianoRoll.rulerBar,
    );

    const x =
      span.startTick * pixelsPerTick - viewport.scrollX;

    const measureWidthPixels = (span.endTick - span.startTick) * pixelsPerTick;

    if (measureWidthPixels >= 20) {
      context.fillStyle = APPLICATION_COLORS.pianoRoll.rulerText;
      context.fillText(String(span.index + 1), x + 7, 2);
    }
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

function drawRulerTickList(
  context: CanvasRenderingContext2D,
  ticks: readonly number[],
  pixelsPerTick: number,
  scrollX: number,
  rulerHeight: number,
  markerHeight: number,
  devicePixelRatio: number,
  color: string,
): void {
  const lineWidth = 1 / devicePixelRatio;

  context.fillStyle = color;

  for (const tick of ticks) {
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
