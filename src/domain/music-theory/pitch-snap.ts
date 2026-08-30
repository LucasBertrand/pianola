import {
  PROJECT_CONSTANTS,
} from "../project/project-constants";
import { Note } from "musictheoryjs";
import { PITCH_SNAP_CONSTANTS } from "./pitch-snap-constants";
import {
  getPitchPatternSemitones,
  isSupportedPitchPatternId,
} from "./pitch-pattern-catalog";

export type PitchPatternType = "scale" | "chord";
export type PitchPatternId = string;

export interface PitchSnapSettings {
  readonly enabled: boolean;
  readonly visualGuideEnabled: boolean;
  readonly rootNote: string;
  readonly patternType: PitchPatternType;
  readonly patternId: PitchPatternId;
}

export const DEFAULT_PITCH_SNAP_SETTINGS: PitchSnapSettings = Object.freeze({
  enabled: PITCH_SNAP_CONSTANTS.defaultEnabled,
  visualGuideEnabled: PITCH_SNAP_CONSTANTS.defaultVisualGuideEnabled,
  rootNote: PITCH_SNAP_CONSTANTS.defaultRootNote,
  patternType: "scale",
  patternId: PITCH_SNAP_CONSTANTS.defaultPatternId,
});

const PATTERN_MASKS = new Map<string, number>();

function getMaskForPattern(patternType: PitchPatternType, patternId: string): number {
  let mask = 0;
  for (const semitones of getPitchPatternSemitones(patternType, patternId)) {
    mask |= 1 << semitones;
  }
  return mask;
}

function getCachedMask(patternType: PitchPatternType, patternId: string): number {
  const key = `${patternType}:${patternId}`;
  let mask = PATTERN_MASKS.get(key);
  if (mask === undefined) {
    mask = getMaskForPattern(patternType, patternId);
    PATTERN_MASKS.set(key, mask);
  }
  return mask;
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

  if (!settings.enabled) return boundedPitch;
  if (isPitchIncludedInPattern(boundedPitch, settings)) return boundedPitch;

  for (let distance = 1; distance < 12; distance += 1) {
    const lowerPitch = boundedPitch - distance;
    const upperPitch = boundedPitch + distance;
    const lowerAllowed = lowerPitch >= PROJECT_CONSTANTS.minimumMidiPitch
      && isPitchIncludedInPattern(lowerPitch, settings);
    const upperAllowed = upperPitch <= PROJECT_CONSTANTS.maximumMidiPitch
      && isPitchIncludedInPattern(upperPitch, settings);

    if (lowerAllowed && upperAllowed) {
      return movementDirection > 0 ? upperPitch : lowerPitch;
    }
    if (lowerAllowed) return lowerPitch;
    if (upperAllowed) return upperPitch;
  }

  return boundedPitch;
}

export function isPitchPatternId(
  patternType: PitchPatternType,
  value: string,
): value is PitchPatternId {
  return (patternType === "scale" && value === PITCH_SNAP_CONSTANTS.defaultPatternId)
    || isSupportedPitchPatternId(patternType, value);
}

export function isPitchSnapRootNote(value: string): boolean {
  return (PITCH_SNAP_CONSTANTS.rootOptions as readonly string[]).includes(value);
}

export function isSupportedPitchSnapSelection(
  rootNote: string,
  patternType: PitchPatternType,
  patternId: string,
): boolean {
  if (!isPitchSnapRootNote(rootNote)) return false;
  if (rootNote === PITCH_SNAP_CONSTANTS.defaultRootNote) {
    return patternType === "scale" && patternId === PITCH_SNAP_CONSTANTS.defaultPatternId;
  }
  return isSupportedPitchPatternId(patternType, patternId);
}

export function isPitchIncludedInPattern(
  pitch: number,
  settings: PitchSnapSettings,
): boolean {
  const relativePitchClass = (pitch - getRootPitchClass(settings) + 12) % 12;
  return (getCachedMask(settings.patternType, settings.patternId) & (1 << relativePitchClass)) !== 0;
}

export function getPitchSnapRootPitchClass(settings: PitchSnapSettings): number {
  return getRootPitchClass(settings);
}

/** Finds the index (0-N) of a MIDI pitch in the selected mode/chord for coloring. */
export function getPitchScaleDegreeColorIndex(
  pitch: number,
  settings: PitchSnapSettings,
): number | null {
  if (!Number.isInteger(pitch)) return null;

  const relativePitchClass = (pitch - getRootPitchClass(settings) + 12) % 12;
  const index = getPitchPatternSemitones(
    settings.patternType,
    settings.patternId,
  ).findIndex((semitone) => semitone === relativePitchClass);
  return index === -1 ? null : index;
}

function getRootPitchClass(settings: PitchSnapSettings): number {
  return settings.rootNote === PITCH_SNAP_CONSTANTS.defaultRootNote
    ? 0
    : Note.from(settings.rootNote).pitchClass;
}
