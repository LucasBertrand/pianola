import type {
  ClipTimeline,
} from "../../domain/clips/clip";
import type {
  LoopRegion,
} from "../../domain/transport/transport";
import {
  getBeatTicks,
  getMeasureSpans,
  tickToSeconds,
} from "../../domain/transport/time-map";

export interface FormattedLoopDuration {
  readonly musical: string;
  readonly absolute: string;
}

/** Formats a loop length independently from its position on the timeline. */
export function formatLoopDuration(
  ppqn: number,
  timeline: ClipTimeline,
  loop: LoopRegion,
  gridResolutionTicks: number,
): FormattedLoopDuration {
  const startTick = Math.max(0, Math.min(
    timeline.durationTicks,
    loop.startTick,
  ));
  const endTick = Math.max(startTick, Math.min(
    timeline.durationTicks,
    loop.endTick,
  ));
  let measureCount = 0;
  let beatCount = 0;
  let residualTicks = 0;

  for (const span of getMeasureSpans(
    ppqn,
    timeline.timeMap,
    timeline.durationTicks,
  )) {
    if (span.endTick <= startTick || span.startTick >= endTick) {
      continue;
    }

    if (startTick <= span.startTick && endTick >= span.endTick) {
      measureCount += 1;
      continue;
    }

    let beatStartTick = span.startTick;

    for (const beatTicks of getBeatTicks(ppqn, span.timeSignature)) {
      const beatEndTick = beatStartTick + beatTicks;
      const overlapStartTick = Math.max(startTick, beatStartTick);
      const overlapEndTick = Math.min(endTick, beatEndTick);

      if (overlapEndTick > overlapStartTick) {
        if (
          overlapStartTick === beatStartTick
          && overlapEndTick === beatEndTick
        ) {
          beatCount += 1;
        } else {
          residualTicks += overlapEndTick - overlapStartTick;
        }
      }

      beatStartTick = beatEndTick;
    }
  }

  const subdivisionCount = Math.floor(
    residualTicks / Math.max(1, gridResolutionTicks),
  );
  const elapsedSeconds = Math.max(
    0,
    tickToSeconds(ppqn, timeline.timeMap, endTick)
      - tickToSeconds(ppqn, timeline.timeMap, startTick),
  );

  return {
    musical:
      `${String(measureCount)}.${String(beatCount)}`
      + `.${String(subdivisionCount)}`,
    absolute: formatAbsoluteDuration(elapsedSeconds),
  };
}

function formatAbsoluteDuration(totalSeconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(totalSeconds * 1_000));
  const milliseconds = totalMilliseconds % 1_000;
  const totalWholeSeconds = Math.floor(totalMilliseconds / 1_000);
  const seconds = totalWholeSeconds % 60;
  const totalMinutes = Math.floor(totalWholeSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const clock = hours > 0
    ? `${String(hours).padStart(2, "0")}:`
      + `${String(minutes).padStart(2, "0")}:`
      + String(seconds).padStart(2, "0")
    : `${String(minutes).padStart(2, "0")}:`
      + String(seconds).padStart(2, "0");

  return `${clock}.${String(milliseconds).padStart(3, "0")}`;
}
