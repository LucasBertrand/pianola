import {
  PROJECT_CONSTANTS,
  TONAL_SNAP_CONSTANTS,
} from "../../config/program-constants";

export type TonalPatternDefinition =
  (typeof TONAL_SNAP_CONSTANTS.patterns)[number];
export type TonalPatternId = TonalPatternDefinition["id"];
export type TonalPatternCategory =
  TonalPatternDefinition["category"];

export interface PitchSnapSettings {
  readonly enabled: boolean;
  readonly tonicPitchClass: number;
  readonly patternId: TonalPatternId;
}

export const DEFAULT_PITCH_SNAP_SETTINGS: PitchSnapSettings =
  Object.freeze({
    enabled: TONAL_SNAP_CONSTANTS.defaultEnabled,
    tonicPitchClass:
      TONAL_SNAP_CONSTANTS.defaultTonicPitchClass,
    patternId: TONAL_SNAP_CONSTANTS.defaultPatternId,
  });

const PATTERN_MASKS = createPatternMasks();

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

  if (isPitchAllowed(boundedPitch, settings)) {
    return boundedPitch;
  }

  for (let distance = 1; distance < 12; distance += 1) {
    const lowerPitch = boundedPitch - distance;
    const upperPitch = boundedPitch + distance;
    const lowerAllowed =
      lowerPitch >= PROJECT_CONSTANTS.minimumMidiPitch
      && isPitchAllowed(lowerPitch, settings);
    const upperAllowed =
      upperPitch <= PROJECT_CONSTANTS.maximumMidiPitch
      && isPitchAllowed(upperPitch, settings);

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

function isPitchAllowed(
  pitch: number,
  settings: PitchSnapSettings,
): boolean {
  const relativePitchClass =
    (
      pitch
      - settings.tonicPitchClass
      + 12
    ) % 12;
  const mask = PATTERN_MASKS[settings.patternId];

  return (mask & (1 << relativePitchClass)) !== 0;
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
