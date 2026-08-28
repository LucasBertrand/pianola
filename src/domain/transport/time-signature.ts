import type { TimeSignature } from "./time-map-model";

export function areTimeSignaturesEqual(
  first: TimeSignature,
  second: TimeSignature,
): boolean {
  if (
    first.numerator !== second.numerator
    || first.denominator !== second.denominator
  ) {
    return false;
  }

  const firstGroups = getBeatGroups(first);
  const secondGroups = getBeatGroups(second);

  return firstGroups.length === secondGroups.length
    && firstGroups.every(
      (group, index) => group === secondGroups[index],
    );
}

/** Beat grouping in denominator units; sums to the numerator. */
export function getBeatGroups(
  timeSignature: TimeSignature,
): readonly number[] {
  if (timeSignature.beatGroups !== undefined) {
    return timeSignature.beatGroups;
  }

  if (
    timeSignature.denominator >= 8
    && timeSignature.numerator % 3 === 0
  ) {
    return new Array<number>(
      timeSignature.numerator / 3,
    ).fill(3);
  }

  return new Array<number>(timeSignature.numerator).fill(1);
}

/** Duration of one denominator unit (e.g. one eighth note in x/8). */
export function getTicksPerBeatUnit(
  ppqn: number,
  timeSignature: TimeSignature,
): number {
  return ppqn * 4 / timeSignature.denominator;
}

export function getTicksPerMeasure(
  ppqn: number,
  timeSignature: TimeSignature,
): number {
  return getTicksPerBeatUnit(ppqn, timeSignature) * timeSignature.numerator;
}

/** Duration in ticks of each beat, following the beat grouping. */
export function getBeatTicks(
  ppqn: number,
  timeSignature: TimeSignature,
): readonly number[] {
  const unitTicks = getTicksPerBeatUnit(ppqn, timeSignature);

  return getBeatGroups(timeSignature).map((group) => group * unitTicks);
}
