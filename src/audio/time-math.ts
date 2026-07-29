import type {
  LoopRegion,
  Tick,
} from "../domain/model";
import type {
  TempoMapSnapshot,
} from "./contracts";

export interface LoopTickProjection {
  readonly tick: Tick;
  readonly iteration: number;
}

export function tickDeltaToSeconds(
  deltaTicks: number,
  bpm: number,
  ppqn: number,
): number {
  assertFiniteNumber(deltaTicks, "deltaTicks");
  assertPositiveFiniteNumber(bpm, "bpm");
  assertPositiveSafeInteger(ppqn, "ppqn");

  const seconds = deltaTicks * 60 / (bpm * ppqn);

  if (!Number.isFinite(seconds)) {
    throw new RangeError("The tick delta is too large to convert to seconds.");
  }

  return seconds;
}

export function secondsToTickDelta(
  seconds: number,
  bpm: number,
  ppqn: number,
): number {
  assertFiniteNumber(seconds, "seconds");
  assertPositiveFiniteNumber(bpm, "bpm");
  assertPositiveSafeInteger(ppqn, "ppqn");

  const ticks = seconds * bpm * ppqn / 60;

  if (!Number.isFinite(ticks)) {
    throw new RangeError("The second delta is too large to convert to ticks.");
  }

  return ticks;
}

export function tickToSeconds(
  tick: number,
  tempoMap: TempoMapSnapshot,
  ppqn: number,
): number {
  assertFiniteNumber(tick, "tick");
  assertPositiveSafeInteger(ppqn, "ppqn");
  assertValidTempoMap(tempoMap);

  const segmentIndex = findSegmentIndex(tempoMap.startTicks, tick);
  const segmentStartTick = tempoMap.startTicks[segmentIndex];
  const segmentStartSeconds = tempoMap.startSeconds[segmentIndex];
  const bpm = tempoMap.bpms[segmentIndex];

  if (
    segmentStartTick === undefined
    || segmentStartSeconds === undefined
    || bpm === undefined
  ) {
    throw new RangeError("The tempo map does not contain a usable segment.");
  }

  return segmentStartSeconds
    + tickDeltaToSeconds(tick - segmentStartTick, bpm, ppqn);
}

export function secondsToTick(
  seconds: number,
  tempoMap: TempoMapSnapshot,
  ppqn: number,
): number {
  assertFiniteNumber(seconds, "seconds");
  assertPositiveSafeInteger(ppqn, "ppqn");
  assertValidTempoMap(tempoMap);

  const segmentIndex = findSegmentIndex(
    tempoMap.startSeconds,
    seconds,
  );
  const segmentStartTick = tempoMap.startTicks[segmentIndex];
  const segmentStartSeconds = tempoMap.startSeconds[segmentIndex];
  const bpm = tempoMap.bpms[segmentIndex];

  if (
    segmentStartTick === undefined
    || segmentStartSeconds === undefined
    || bpm === undefined
  ) {
    throw new RangeError("The tempo map does not contain a usable segment.");
  }

  return segmentStartTick
    + secondsToTickDelta(seconds - segmentStartSeconds, bpm, ppqn);
}

export function tickRangeToSeconds(
  startTick: number,
  endTick: number,
  tempoMap: TempoMapSnapshot,
  ppqn: number,
): number {
  assertFiniteNumber(startTick, "startTick");
  assertFiniteNumber(endTick, "endTick");

  if (endTick < startTick) {
    throw new RangeError("endTick must be greater than or equal to startTick.");
  }

  return tickToSeconds(endTick, tempoMap, ppqn)
    - tickToSeconds(startTick, tempoMap, ppqn);
}

export function getLoopDurationTicks(loop: LoopRegion): number {
  assertValidLoop(loop);
  return loop.endTick - loop.startTick;
}

export function projectTickIntoLoop(
  unwrappedTick: number,
  loop: LoopRegion,
): LoopTickProjection {
  assertFiniteNumber(unwrappedTick, "unwrappedTick");
  assertValidLoop(loop);

  if (unwrappedTick < loop.endTick) {
    return {
      tick: unwrappedTick,
      iteration: 0,
    };
  }

  const durationTicks = loop.endTick - loop.startTick;
  const elapsedLoopTicks = unwrappedTick - loop.startTick;
  const iteration = Math.floor(elapsedLoopTicks / durationTicks);
  const tick =
    loop.startTick
    + positiveModulo(elapsedLoopTicks, durationTicks);

  return {
    tick,
    iteration,
  };
}

function assertValidTempoMap(tempoMap: TempoMapSnapshot): void {
  const segmentCount = tempoMap.startTicks.length;

  if (
    segmentCount === 0
    || tempoMap.startSeconds.length !== segmentCount
    || tempoMap.bpms.length !== segmentCount
    || tempoMap.timeSignatures.length !== segmentCount
  ) {
    throw new RangeError(
      "Tempo map arrays must be non-empty and have equal lengths.",
    );
  }

  for (
    let segmentIndex = 0;
    segmentIndex < segmentCount;
    segmentIndex += 1
  ) {
    const startTick = tempoMap.startTicks[segmentIndex];
    const startSeconds = tempoMap.startSeconds[segmentIndex];
    const bpm = tempoMap.bpms[segmentIndex];

    if (
      startTick === undefined
      || startSeconds === undefined
      || bpm === undefined
    ) {
      throw new RangeError("Tempo map segment data is incomplete.");
    }

    assertFiniteNumber(startTick, "tempoMap.startTicks");
    assertFiniteNumber(startSeconds, "tempoMap.startSeconds");
    assertPositiveFiniteNumber(bpm, "tempoMap.bpms");

    if (segmentIndex === 0) {
      if (startTick !== 0 || startSeconds !== 0) {
        throw new RangeError(
          "The first tempo map segment must start at tick and second zero.",
        );
      }

      continue;
    }

    const previousStartTick =
      tempoMap.startTicks[segmentIndex - 1];
    const previousStartSeconds =
      tempoMap.startSeconds[segmentIndex - 1];

    if (
      previousStartTick === undefined
      || previousStartSeconds === undefined
      || startTick <= previousStartTick
      || startSeconds <= previousStartSeconds
    ) {
      throw new RangeError(
        "Tempo map segments must be strictly increasing.",
      );
    }
  }
}

function findSegmentIndex(
  segmentStarts: Float64Array,
  value: number,
): number {
  let low = 0;
  let high = segmentStarts.length;

  while (low < high) {
    const middle = low + ((high - low) >> 1);
    const segmentStart = segmentStarts[middle];

    if (segmentStart !== undefined && segmentStart <= value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return Math.max(0, low - 1);
}

function assertValidLoop(loop: LoopRegion): void {
  if (
    !Number.isSafeInteger(loop.startTick)
    || loop.startTick < 0
    || !Number.isSafeInteger(loop.endTick)
    || loop.endTick <= loop.startTick
  ) {
    throw new RangeError(
      "Loop ticks must be safe integers with startTick below endTick.",
    );
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite.`);
  }
}

function assertPositiveFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be positive and finite.`);
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}
