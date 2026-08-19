import { PROJECT_CONSTANTS } from "../config/domain-limits";
import { TONAL_SNAP_CONSTANTS } from "../config/music-config";
import { ScaleType, ChordType, Interval, Note } from "@tonaljs/tonal";

export type TonalPatternType = "scale" | "chord";
export type TonalPatternId = string;

export interface PitchSnapSettings {
  readonly enabled: boolean;
  readonly visualGuideEnabled: boolean;
  readonly rootNote: string;
  readonly patternType: TonalPatternType;
  readonly patternId: TonalPatternId;
}

export const DEFAULT_PITCH_SNAP_SETTINGS: PitchSnapSettings =
  Object.freeze({
    enabled: TONAL_SNAP_CONSTANTS.defaultEnabled,
    visualGuideEnabled:
      TONAL_SNAP_CONSTANTS.defaultVisualGuideEnabled,
    rootNote:
      TONAL_SNAP_CONSTANTS.defaultRootNote,
    patternType: "scale",
    patternId: TONAL_SNAP_CONSTANTS.defaultPatternId,
  });

function getMaskForPattern(patternType: TonalPatternType, patternId: string): number {
  let mask = 0;
  let intervals: readonly string[] = [];

  if (patternType === "scale") {
    const scale = ScaleType.get(patternId);
    intervals = scale.intervals;
  } else {
    const chord = ChordType.get(patternId);
    intervals = chord.intervals;
  }

  for (const interval of intervals) {
    const semitones = Interval.semitones(interval);
    if (semitones !== undefined) {
      mask |= 1 << (semitones % 12);
    }
  }

  return mask;
}

const PATTERN_MASKS = new Map<string, number>();

function getCachedMask(patternType: TonalPatternType, patternId: string): number {
  const key = `${patternType}:${patternId}`;
  let mask = PATTERN_MASKS.get(key);
  if (mask === undefined) {
    mask = getMaskForPattern(patternType, patternId);
    PATTERN_MASKS.set(key, mask);
  }
  return mask;
}

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
  _value: string,
): _value is TonalPatternId {
  // It's a bit harder to strictly validate now since we accept any Tonal ID.
  // We'll assume the dialog only provides valid ones.
  return true; 
}

export function isPitchAllowedByTonalPattern(
  pitch: number,
  settings: PitchSnapSettings,
): boolean {
  const relativePitchClass =
    (
      pitch
      - (Note.chroma(settings.rootNote) || 0)
      + 12
    ) % 12;
  const mask = getCachedMask(settings.patternType, settings.patternId);
  return (mask & (1 << relativePitchClass)) !== 0;
}

export function getPitchSnapRootPitchClass(
  settings: PitchSnapSettings,
): number {
  return Note.chroma(settings.rootNote) || 0;
}

/** Finds the index (0-N) of a MIDI pitch in the selected mode/chord for coloring. */
export function getPitchScaleDegreeColorIndex(
  pitch: number,
  settings: PitchSnapSettings,
): number | null {
  if (!Number.isInteger(pitch)) {
    return null;
  }

  const relativePitchClass = (
    pitch
    - (Note.chroma(settings.rootNote) || 0)
    + 12
  ) % 12;

  let intervals: readonly string[] = [];
  if (settings.patternType === "scale") {
    intervals = ScaleType.get(settings.patternId).intervals;
  } else {
    intervals = ChordType.get(settings.patternId).intervals;
  }

  for (let i = 0; i < intervals.length; i++) {
    const interval = intervals[i];
    if (interval === undefined) continue;
    const semitones = Interval.semitones(interval);
    if (semitones !== undefined && (semitones % 12) === relativePitchClass) {
      return i;
    }
  }

  return null;
}
