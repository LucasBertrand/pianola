import type {
  AudioWorkletTimelineInstrument,
} from "./audio-worklet-protocol";

export function lowerBound(values: Float64Array, target: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const middle = low + ((high - low) >> 1);
    const value = values[middle];

    if (value !== undefined && value < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

export function findTempoIndexAtTick(
  starts: Float64Array,
  tick: number,
): number {
  let low = 0;
  let high = starts.length;

  while (low < high) {
    const middle = low + ((high - low) >> 1);
    const start = starts[middle];

    if (start !== undefined && start <= tick) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return Math.max(0, low - 1);
}

/** Collects only held-note leaves whose interval can contain the requested tick. */
export function collectHeldNoteIndexes(
  instrument: AudioWorkletTimelineInstrument,
  tick: number,
  maximumCount: number,
  output: Uint32Array,
): number {
  if (tick <= 0 || instrument.endTickTreeLeafCount === 0) {
    return 0;
  }

  const upperNoteIndex = lowerBound(instrument.startTicks, tick);

  return collectHeldNoteTree(
    instrument,
    1,
    0,
    instrument.endTickTreeLeafCount,
    upperNoteIndex,
    tick,
    maximumCount,
    0,
    output,
  );
}

function collectHeldNoteTree(
  instrument: AudioWorkletTimelineInstrument,
  nodeIndex: number,
  rangeStart: number,
  rangeEnd: number,
  upperNoteIndex: number,
  tick: number,
  maximumCount: number,
  visitedCount: number,
  output: Uint32Array,
): number {
  if (
    visitedCount >= maximumCount
    || rangeStart >= upperNoteIndex
    || (
      instrument.maximumEndTickTree[nodeIndex]
      ?? Number.NEGATIVE_INFINITY
    ) <= tick
  ) {
    return visitedCount;
  }

  if (rangeEnd - rangeStart === 1) {
    const startTick = instrument.startTicks[rangeStart];
    const durationTicks = instrument.durationTicks[rangeStart];

    if (
      startTick !== undefined
      && durationTicks !== undefined
      && startTick < tick
      && startTick + durationTicks > tick
    ) {
      output[visitedCount] = rangeStart;
      return visitedCount + 1;
    }

    return visitedCount;
  }

  const rangeMiddle = rangeStart + ((rangeEnd - rangeStart) >> 1);
  // Prefer recently started notes when the instrument polyphony is bounded.
  const afterRight = collectHeldNoteTree(
    instrument,
    nodeIndex * 2 + 1,
    rangeMiddle,
    rangeEnd,
    upperNoteIndex,
    tick,
    maximumCount,
    visitedCount,
    output,
  );

  return collectHeldNoteTree(
    instrument,
    nodeIndex * 2,
    rangeStart,
    rangeMiddle,
    upperNoteIndex,
    tick,
    maximumCount,
    afterRight,
    output,
  );
}
