import {
  PROJECT_CONSTANTS,
  TONAL_SNAP_CONSTANTS,
} from "../config/program-constants";

export type TonalPatternDefinition =
  (typeof TONAL_SNAP_CONSTANTS.patterns)[number];
export type TonalPatternId = TonalPatternDefinition["id"];

export interface PitchSnapSettings {
  readonly enabled: boolean;
  readonly visualGuideEnabled: boolean;
  readonly tonicPitchClass: number;
  readonly patternId: TonalPatternId;
  readonly scaleDegreeIndex: number | null;
}

export const DEFAULT_PITCH_SNAP_SETTINGS: PitchSnapSettings =
  Object.freeze({
    enabled: TONAL_SNAP_CONSTANTS.defaultEnabled,
    visualGuideEnabled:
      TONAL_SNAP_CONSTANTS.defaultVisualGuideEnabled,
    tonicPitchClass:
      TONAL_SNAP_CONSTANTS.defaultTonicPitchClass,
    patternId: TONAL_SNAP_CONSTANTS.defaultPatternId,
    scaleDegreeIndex:
      TONAL_SNAP_CONSTANTS.defaultScaleDegreeIndex,
  });

const PATTERN_MASKS = createPatternMasks();
const SCALE_DEGREE_MASKS = createScaleDegreeMasks();

export function snapPitchToTonalPattern(
  pitch: number,
  settings: PitchSnapSettings,
  movementDirection: number,
): number {
  const roundedPitch = Math.round(pitch);
  const boundedPitch = Math.min(
    PROJECT_CONSTANTS.maximumMidiPitch,
    Math.max(PROJECT_CONSTANTS.minimumMidiPitch, roundedPitch),
  );

  if (!settings.enabled) {
    return boundedPitch;
  }

  if (isPitchAllowedByTonalPattern(boundedPitch, settings)) {
    return boundedPitch;
  }

  for (let distance = 1; distance < 12; distance += 1) {
    const lowerPitch = boundedPitch - distance;
    const upperPitch = boundedPitch + distance;
    const lowerAllowed =
      lowerPitch >= PROJECT_CONSTANTS.minimumMidiPitch
      && isPitchAllowedByTonalPattern(lowerPitch, settings);
    const upperAllowed =
      upperPitch <= PROJECT_CONSTANTS.maximumMidiPitch
      && isPitchAllowedByTonalPattern(upperPitch, settings);

    if (lowerAllowed && upperAllowed) {
      return movementDirection > 0
        ? upperPitch
        : lowerPitch;
    }

    if (lowerAllowed) {
      return lowerPitch;
    }

    if (upperAllowed) {
      return upperPitch;
    }
  }

  return boundedPitch;
}

export function isTonalPatternId(
  value: string,
): value is TonalPatternId {
  return Object.prototype.hasOwnProperty.call(
    PATTERN_MASKS,
    value,
  );
}

export function isPitchAllowedByTonalPattern(
  pitch: number,
  settings: PitchSnapSettings,
): boolean {
  const relativePitchClass =
    (
      pitch
      - settings.tonicPitchClass
      + 12
    ) % 12;
  const degreeMasks = SCALE_DEGREE_MASKS[settings.patternId];
  const degreeMask =
    settings.scaleDegreeIndex === null
      ? undefined
      : degreeMasks[settings.scaleDegreeIndex];
  const mask = degreeMask ?? PATTERN_MASKS[settings.patternId];

  return (mask & (1 << relativePitchClass)) !== 0;
}

export function getTonalPatternDefinition(
  patternId: TonalPatternId,
): TonalPatternDefinition {
  for (
    let patternIndex = 0;
    patternIndex < TONAL_SNAP_CONSTANTS.patterns.length;
    patternIndex += 1
  ) {
    const pattern = TONAL_SNAP_CONSTANTS.patterns[patternIndex];

    if (pattern?.id === patternId) {
      return pattern;
    }
  }

  return TONAL_SNAP_CONSTANTS.patterns[0];
}

export function getPitchSnapRootPitchClass(
  settings: PitchSnapSettings,
): number {
  if (settings.scaleDegreeIndex === null) {
    return settings.tonicPitchClass;
  }

  const pattern = getTonalPatternDefinition(settings.patternId);
  const interval = pattern.intervals[settings.scaleDegreeIndex];

  return interval === undefined
    ? settings.tonicPitchClass
    : (settings.tonicPitchClass + interval) % 12;
}

/**
 * Returns the diatonic color family for one mode degree.
 *
 * The value follows musical letter position rather than chromatic distance:
 * 0 is I, 1 is II, and so on through 6 for VII. Consequently bII and II,
 * or bIII and III, deliberately share the same family. Pentatonic modes keep
 * their missing degrees instead of compressing five notes into five colors.
 */
export function getScaleDegreeColorIndex(
  settings: PitchSnapSettings,
  degreeIndex: number,
): number | null {
  const pattern = getTonalPatternDefinition(settings.patternId);
  const colorIndex = pattern.letterOffsets[degreeIndex];

  return colorIndex === undefined ? null : colorIndex;
}

/** Finds the diatonic color family of a MIDI pitch in the selected mode. */
export function getPitchScaleDegreeColorIndex(
  pitch: number,
  settings: PitchSnapSettings,
): number | null {
  if (!Number.isInteger(pitch)) {
    return null;
  }

  const pattern = getTonalPatternDefinition(settings.patternId);
  const relativePitchClass = (
    pitch
    - settings.tonicPitchClass
    + 12
  ) % 12;

  for (
    let intervalIndex = 0;
    intervalIndex < pattern.intervals.length;
    intervalIndex += 1
  ) {
    if (pattern.intervals[intervalIndex] === relativePitchClass) {
      return pattern.letterOffsets[intervalIndex] ?? null;
    }
  }

  return null;
}

export type ScaleDegreeTriadQuality =
  | "major"
  | "minor"
  | "diminished"
  | "augmented";

export function getScaleDegreeTriadIntervals(
  settings: PitchSnapSettings,
  degreeIndex: number,
): readonly [number, number, number] | null {
  const pattern = getTonalPatternDefinition(settings.patternId);

  if (
    degreeIndex < 0
    || degreeIndex >= pattern.intervals.length
  ) {
    return null;
  }

  const root = pattern.intervals[degreeIndex];
  const third = pattern.intervals[
    (degreeIndex + 2) % pattern.intervals.length
  ];
  const fifth = pattern.intervals[
    (degreeIndex + 4) % pattern.intervals.length
  ];

  if (root === undefined || third === undefined || fifth === undefined) {
    return null;
  }

  return Object.freeze([
    0,
    (third - root + 12) % 12,
    (fifth - root + 12) % 12,
  ] as const);
}

export function getScaleDegreeTriadQuality(
  settings: PitchSnapSettings,
  degreeIndex: number,
): ScaleDegreeTriadQuality | null {
  const intervals = getScaleDegreeTriadIntervals(
    settings,
    degreeIndex,
  );

  if (intervals === null) {
    return null;
  }

  const thirdDistance = intervals[1];
  const fifthDistance = intervals[2];

  if (thirdDistance === 4 && fifthDistance === 7) {
    return "major";
  }

  if (thirdDistance === 3 && fifthDistance === 7) {
    return "minor";
  }

  if (thirdDistance === 3 && fifthDistance === 6) {
    return "diminished";
  }

  if (thirdDistance === 4 && fifthDistance === 8) {
    return "augmented";
  }

  return null;
}

function createPatternMasks(): Readonly<
  Record<TonalPatternId, number>
> {
  const masks = {} as Record<TonalPatternId, number>;

  for (
    let patternIndex = 0;
    patternIndex < TONAL_SNAP_CONSTANTS.patterns.length;
    patternIndex += 1
  ) {
    const pattern =
      TONAL_SNAP_CONSTANTS.patterns[patternIndex];

    if (pattern === undefined) {
      continue;
    }

    let mask = 0;

    for (
      let intervalIndex = 0;
      intervalIndex < pattern.intervals.length;
      intervalIndex += 1
    ) {
      const interval = pattern.intervals[intervalIndex];

      if (interval !== undefined) {
        mask |= 1 << interval;
      }
    }

    masks[pattern.id] = mask;
  }

  return Object.freeze(masks);
}

function createScaleDegreeMasks(): Readonly<
  Record<TonalPatternId, readonly number[]>
> {
  const masks = {} as Record<TonalPatternId, readonly number[]>;

  for (
    let patternIndex = 0;
    patternIndex < TONAL_SNAP_CONSTANTS.patterns.length;
    patternIndex += 1
  ) {
    const pattern = TONAL_SNAP_CONSTANTS.patterns[patternIndex];

    if (pattern === undefined) {
      continue;
    }

    const degreeMasks: number[] = [];

    for (
      let degreeIndex = 0;
      degreeIndex < pattern.intervals.length;
      degreeIndex += 1
    ) {
      let mask = 0;

      for (let chordToneIndex = 0; chordToneIndex < 3; chordToneIndex += 1) {
        const intervalIndex =
          (degreeIndex + chordToneIndex * 2)
          % pattern.intervals.length;
        const interval = pattern.intervals[intervalIndex];

        if (interval !== undefined) {
          mask |= 1 << interval;
        }
      }

      degreeMasks.push(mask);
    }

    masks[pattern.id] = Object.freeze(degreeMasks);
  }

  return Object.freeze(masks);
}
