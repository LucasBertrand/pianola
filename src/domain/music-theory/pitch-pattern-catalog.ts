import { Chord } from "@tonaljs/tonal";
import { formatAccidentals } from "./pitch-notation";

export interface PitchPatternOption {
  readonly id: string;
  readonly label: string;
}

export interface PitchPatternGroup {
  readonly label: string;
  readonly options: readonly PitchPatternOption[];
}

function createScaleOption(id: string): PitchPatternOption {
  return Object.freeze({ id, label: id });
}

function createChordOption(id: string): PitchPatternOption {
  const chord = Chord.getChord(id);

  if (chord.empty) {
    throw new Error(`Tonal does not recognize chord type "${id}".`);
  }

  return Object.freeze({
    id,
    label: `${chord.symbol} (${chord.name})`,
  });
}

function createGroup(
  label: string,
  ids: readonly string[],
  createOption: (id: string) => PitchPatternOption,
): PitchPatternGroup {
  return Object.freeze({
    label,
    options: Object.freeze(ids.map(createOption)),
  });
}

/** Supported scale choices, grouped for the pitch-pattern selector. */
export const SCALE_PATTERN_GROUPS: readonly PitchPatternGroup[] = Object.freeze([
  createGroup("Diatonic modes", [
    "ionian",
    "dorian",
    "phrygian",
    "lydian",
    "mixolydian",
    "aeolian",
    "locrian",
  ], createScaleOption),
  createGroup("Minor and derivative scales", [
    "harmonic minor",
    "melodic minor",
    "phrygian dominant",
    "double harmonic major",
    "hungarian minor",
  ], createScaleOption),
  createGroup("Pentatonic and blues", [
    "major pentatonic",
    "minor pentatonic",
    "blues",
  ], createScaleOption),
  createGroup("Traditional scales", [
    "hirajoshi",
    "in-sen",
  ], createScaleOption),
  createGroup("Symmetric scales", [
    "whole tone",
    "diminished",
  ], createScaleOption),
]);

/** Supported chord choices, including suspended and extended chords. */
export const CHORD_PATTERN_GROUPS: readonly PitchPatternGroup[] = Object.freeze([
  createGroup("Major", [
    "M",
    "maj7",
    "maj9",
    "maj13",
  ], createChordOption),
  createGroup("Minor", [
    "m",
    "m7",
    "mM7",
    "m9",
    "mM9",
    "m11",
    "m13",
  ], createChordOption),
  createGroup("Sixths", [
    "6",
    "m6",
    "69",
    "m69",
  ], createChordOption),
  createGroup("Dominant", [
    "7",
    "9",
    "7b9",
    "7#9",
    "11",
    "13",
  ], createChordOption),
  createGroup("Suspended", [
    "sus2",
    "sus4",
    "sus24",
    "7sus4",
    "9sus4",
    "13sus4",
  ], createChordOption),
  createGroup("Diminished", [
    "dim",
    "dim7",
    "m7b5",
  ], createChordOption),
  createGroup("Augmented", [
    "aug",
  ], createChordOption),
]);

export const SUPPORTED_SCALE_PATTERN_IDS: readonly string[] = Object.freeze(
  SCALE_PATTERN_GROUPS.flatMap((group) =>
    group.options.map((option) => option.id)
  ),
);

export const SUPPORTED_CHORD_PATTERN_IDS: readonly string[] = Object.freeze(
  CHORD_PATTERN_GROUPS.flatMap((group) =>
    group.options.map((option) => option.id)
  ),
);

const SUPPORTED_SCALE_PATTERN_ID_SET = new Set(SUPPORTED_SCALE_PATTERN_IDS);
const SUPPORTED_CHORD_PATTERN_ID_SET = new Set(SUPPORTED_CHORD_PATTERN_IDS);

export function isSupportedPitchPatternId(
  patternType: "scale" | "chord",
  patternId: string,
): boolean {
  return patternType === "scale"
    ? SUPPORTED_SCALE_PATTERN_ID_SET.has(patternId)
    : SUPPORTED_CHORD_PATTERN_ID_SET.has(patternId);
}

/** Formats a rooted chord with Tonal's own symbol instead of an alias guess. */
export function formatChordSymbol(
  rootNote: string,
  chordId: string,
): string {
  const chord = Chord.getChord(chordId, rootNote);

  if (chord.empty) {
    throw new Error(
      `Tonal does not recognize chord type "${chordId}" at root "${rootNote}".`,
    );
  }

  return formatAccidentals(chord.symbol);
}
