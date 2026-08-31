import {
  PROJECT_CONSTANTS,
} from "../project/project-constants";
import { PITCH_SNAP_CONSTANTS } from "./pitch-snap-constants";
import { isSupportedPitchPatternId } from "./pitch-pattern-catalog";
import { ScaleType, ChordType, Interval, Note } from "@tonaljs/tonal";

function getPatternIntervals(
  patternType: PitchPatternType,
  patternId: string,
): readonly string[] {
  return patternType === "scale"
    ? ScaleType.get(patternId).intervals
    : ChordType.get(patternId).intervals;
}

function getRootChroma(rootNote: string): number {
  return Note.chroma(rootNote) || 0;
}

function getRelativePitchClass(
  pitch: number,
  rootNote: string,
): number {
  return (pitch - getRootChroma(rootNote) + 12) % 12;
}

export type PitchPatternType = "scale" | "chord";
export type PitchPatternId = string;

export interface PitchSnapSettings {
  readonly enabled: boolean;
  readonly visualGuideEnabled: boolean;
  readonly rootNote: string;
  readonly patternType: PitchPatternType;
  readonly patternId: PitchPatternId;
}

export const DEFAULT_PITCH_SNAP_SETTINGS: PitchSnapSettings =
  Object.freeze({
    enabled: PITCH_SNAP_CONSTANTS.defaultEnabled,
    visualGuideEnabled:
      PITCH_SNAP_CONSTANTS.defaultVisualGuideEnabled,
    rootNote:
      PITCH_SNAP_CONSTANTS.defaultRootNote,
    patternType: "scale",
    patternId: PITCH_SNAP_CONSTANTS.defaultPatternId,
  });

interface CachedPatternData {
  readonly mask: number;
  readonly semitones: readonly number[];
  readonly degreeLabels: ReadonlyMap<number, string>;
}

function buildPatternData(
  patternType: PitchPatternType,
  patternId: string,
): CachedPatternData {
  const intervals = getPatternIntervals(patternType, patternId);
  let mask = 0;
  const semitones: number[] = [];
  const degreeLabels = new Map<number, string>();

  for (const interval of intervals) {
    const s = Interval.semitones(interval);
    if (s !== undefined) {
      const pitchClass = s % 12;
      mask |= 1 << pitchClass;
      semitones.push(pitchClass);
      const intervalData = Interval.get(interval);
      const degree = patternType === "chord"
        ? intervalData.num
        : intervalData.simple;

      if (degree !== undefined && !degreeLabels.has(pitchClass)) {
        degreeLabels.set(
          pitchClass,
          formatDegreeLabel(degree, intervalData.alt ?? 0),
        );
      }
    }
  }

  return { mask, semitones, degreeLabels };
}

const PATTERN_CACHE = new Map<string, CachedPatternData>();

function getCachedPatternData(
  patternType: PitchPatternType,
  patternId: string,
): CachedPatternData {
  const key = `${patternType}:${patternId}`;
  let data = PATTERN_CACHE.get(key);
  if (data === undefined) {
    data = buildPatternData(patternType, patternId);
    PATTERN_CACHE.set(key, data);
  }
  return data;
}

export function snapPitchToPattern(
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

  if (isPitchIncludedInPattern(boundedPitch, settings)) {
    return boundedPitch;
  }

  for (let distance = 1; distance < 12; distance += 1) {
    const lowerPitch = boundedPitch - distance;
    const upperPitch = boundedPitch + distance;
    const lowerAllowed =
      lowerPitch >= PROJECT_CONSTANTS.minimumMidiPitch
      && isPitchIncludedInPattern(lowerPitch, settings);
    const upperAllowed =
      upperPitch <= PROJECT_CONSTANTS.maximumMidiPitch
      && isPitchIncludedInPattern(upperPitch, settings);

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

export function isPitchPatternId(
  patternType: PitchPatternType,
  value: string,
): value is PitchPatternId {
  return (
    patternType === "scale"
    && value === PITCH_SNAP_CONSTANTS.defaultPatternId
  ) || isSupportedPitchPatternId(patternType, value);
}

export function isPitchSnapRootNote(value: string): boolean {
  return (PITCH_SNAP_CONSTANTS.rootOptions as readonly string[])
    .includes(value);
}

export function isSupportedPitchSnapSelection(
  rootNote: string,
  patternType: PitchPatternType,
  patternId: string,
): boolean {
  if (!isPitchSnapRootNote(rootNote)) {
    return false;
  }

  if (rootNote === PITCH_SNAP_CONSTANTS.defaultRootNote) {
    return patternType === "scale"
      && patternId === PITCH_SNAP_CONSTANTS.defaultPatternId;
  }

  return isSupportedPitchPatternId(patternType, patternId);
}

export function isPitchIncludedInPattern(
  pitch: number,
  settings: PitchSnapSettings,
): boolean {
  const rpc = getRelativePitchClass(pitch, settings.rootNote);
  const { mask } = getCachedPatternData(settings.patternType, settings.patternId);
  return (mask & (1 << rpc)) !== 0;
}

export function getPitchSnapRootPitchClass(
  settings: PitchSnapSettings,
): number {
  return getRootChroma(settings.rootNote);
}

/** Finds the index (0-N) of a MIDI pitch in the selected mode/chord for coloring. */
export function getPitchScaleDegreeColorIndex(
  pitch: number,
  settings: PitchSnapSettings,
): number | null {
  if (!Number.isInteger(pitch)) {
    return null;
  }

  const rpc = getRelativePitchClass(pitch, settings.rootNote);
  const { semitones } = getCachedPatternData(settings.patternType, settings.patternId);

  for (let i = 0; i < semitones.length; i++) {
    if (semitones[i] === rpc) {
      return i;
    }
  }

  return null;
}

const CHROMATIC_DEGREE_LABELS = [
  "1",
  "♭2",
  "2",
  "♭3",
  "3",
  "4",
  "♭5",
  "5",
  "♭6",
  "6",
  "♭7",
  "7",
] as const;

/** Formats a pitch as a scale/chord degree in the active tonal context. */
export function getPitchPatternDegreeLabel(
  pitch: number,
  settings: PitchSnapSettings,
): string {
  if (!Number.isInteger(pitch)) {
    return "";
  }

  const relativePitchClass = getRelativePitchClass(
    pitch,
    settings.rootNote,
  );
  const contextualLabel = getCachedPatternData(
    settings.patternType,
    settings.patternId,
  ).degreeLabels.get(relativePitchClass);

  return contextualLabel
    ?? CHROMATIC_DEGREE_LABELS[relativePitchClass]
    ?? "";
}

function formatDegreeLabel(degree: number, alteration: number): string {
  const accidental = alteration < 0
    ? "♭".repeat(-alteration)
    : "♯".repeat(alteration);

  return `${accidental}${degree}`;
}
