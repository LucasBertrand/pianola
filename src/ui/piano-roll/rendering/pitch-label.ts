import {
  PROJECT_CONSTANTS,
} from "../../../config/domain-limits";
import {
  TONAL_SNAP_CONSTANTS,
} from "../../../config/music-config";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
  getScaleDegreeTriadIntervals,
  getScaleDegreeTriadQuality,
  getTonalPatternDefinition,
  type PitchSnapSettings,
} from "../../../music/pitch-snap";

const NATURAL_PITCH_CLASSES = Object.freeze([
  0,
  2,
  4,
  5,
  7,
  9,
  11,
] as const);
const MAJOR_SCALE_INTERVALS = Object.freeze([
  0,
  2,
  4,
  5,
  7,
  9,
  11,
] as const);
const NATURAL_NOTE_NAMES = Object.freeze([
  "C",
  "D",
  "E",
  "F",
  "G",
  "A",
  "B",
] as const);

interface SpelledPitchClass {
  readonly label: string;
  readonly naturalPitchClass: number;
  readonly accidentalOffset: number;
}

const SHARP_FALLBACK = createChromaticFallback(true);
const FLAT_FALLBACK = createChromaticFallback(false);
const spellingCache = new Map<string, readonly SpelledPitchClass[]>();
const tonicLabelCache = new Map<string, string>();

export function getMidiNoteLabel(
  pitch: number,
  settings: PitchSnapSettings = DEFAULT_PITCH_SNAP_SETTINGS,
): string {
  if (
    !Number.isInteger(pitch)
    || pitch < PROJECT_CONSTANTS.minimumMidiPitch
    || pitch > PROJECT_CONSTANTS.maximumMidiPitch
  ) {
    return "";
  }

  const spelling = getPitchClassSpelling(settings)[pitch % 12];

  if (spelling === undefined) {
    return "";
  }

  const octave = Math.floor(
    (
      pitch
      - spelling.naturalPitchClass
      - spelling.accidentalOffset
    ) / 12,
  ) - 1;

  return `${spelling.label}${octave}`;
}

function getPitchClassLabel(
  pitchClass: number,
  settings: PitchSnapSettings,
): string {
  if (!Number.isInteger(pitchClass)) {
    return "";
  }

  const normalizedPitchClass = ((pitchClass % 12) + 12) % 12;

  return getPitchClassSpelling(settings)[normalizedPitchClass]?.label
    ?? "";
}

/**
 * Chooses the tonic spelling that minimizes accidentals for the complete
 * selected scale. This favors conventional keys such as Db major over C#
 * major while still adapting the choice to non-Ionian modes and scales.
 */
export function getPreferredTonicLabel(
  pitchClass: number,
  patternId: PitchSnapSettings["patternId"],
): string {
  const normalizedPitchClass = ((pitchClass % 12) + 12) % 12;
  const cacheKey = `${normalizedPitchClass}:${patternId}`;
  const cached = tonicLabelCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const pattern = getTonalPatternDefinition(patternId);
  let bestLetterIndex = 0;
  let bestAccidentalOffset = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (
    let tonicLetterIndex = 0;
    tonicLetterIndex < NATURAL_NOTE_NAMES.length;
    tonicLetterIndex += 1
  ) {
    const tonicNaturalPitchClass =
      NATURAL_PITCH_CLASSES[tonicLetterIndex];

    if (tonicNaturalPitchClass === undefined) {
      continue;
    }

    const tonicAccidentalOffset = normalizeAccidentalOffset(
      normalizedPitchClass - tonicNaturalPitchClass,
    );

    // Every chromatic tonic has a familiar natural, sharp, or flat name.
    if (Math.abs(tonicAccidentalOffset) > 1) {
      continue;
    }

    let accidentalCount = 0;
    let complexAccidentalPenalty = 0;

    for (
      let degreeIndex = 0;
      degreeIndex < pattern.intervals.length;
      degreeIndex += 1
    ) {
      const interval = pattern.intervals[degreeIndex];
      const letterOffset = pattern.letterOffsets[degreeIndex];

      if (interval === undefined || letterOffset === undefined) {
        continue;
      }

      const degreeLetterIndex =
        (tonicLetterIndex + letterOffset) % 7;
      const degreeNaturalPitchClass =
        NATURAL_PITCH_CLASSES[degreeLetterIndex];

      if (degreeNaturalPitchClass === undefined) {
        continue;
      }

      const degreePitchClass =
        (normalizedPitchClass + interval) % 12;
      const accidentalOffset = normalizeAccidentalOffset(
        degreePitchClass - degreeNaturalPitchClass,
      );
      const accidentalMagnitude = Math.abs(accidentalOffset);

      accidentalCount += accidentalMagnitude;

      if (accidentalMagnitude > 1) {
        complexAccidentalPenalty +=
          (accidentalMagnitude - 1) * 100;
      }
    }

    const score =
      complexAccidentalPenalty
      + accidentalCount * 10
      + Math.abs(tonicAccidentalOffset);

    if (score < bestScore) {
      bestScore = score;
      bestLetterIndex = tonicLetterIndex;
      bestAccidentalOffset = tonicAccidentalOffset;
    }
  }

  const label = createSpelledPitchClass(
    bestLetterIndex,
    bestAccidentalOffset,
  ).label;

  tonicLabelCache.set(cacheKey, label);
  return label;
}

export function getPitchLabelContextKey(
  settings: PitchSnapSettings,
): string {
  return `${settings.tonicPitchClass}:${settings.patternId}`;
}

export function getScaleDegreeLabel(
  settings: PitchSnapSettings,
  degreeIndex: number,
): string {
  const pattern = getTonalPatternDefinition(settings.patternId);
  const interval = pattern.intervals[degreeIndex];
  const letterOffset = pattern.letterOffsets[degreeIndex];
  const romanNumeral =
    letterOffset === undefined
      ? undefined
      : TONAL_SNAP_CONSTANTS.scaleDegreeRomanNumerals[
          letterOffset
        ];

  if (
    interval === undefined
    || letterOffset === undefined
    || romanNumeral === undefined
  ) {
    return "";
  }

  const naturalInterval = MAJOR_SCALE_INTERVALS[letterOffset];
  const degreeAccidental =
    naturalInterval === undefined
      ? ""
      : createDegreeAccidental(interval - naturalInterval);

  const quality = getScaleDegreeTriadQuality(settings, degreeIndex);
  const intervals = getScaleDegreeTriadIntervals(
    settings,
    degreeIndex,
  );
  const qualitySuffix =
    quality === "diminished"
      ? "\u00B0"
      : quality === "augmented"
        ? "+"
        : "";
  const qualityLabel = quality
    ?? (
      intervals === null
        ? "triad"
        : `${intervals[1]}-${intervals[2]}`
    );
  const pitchClass = (settings.tonicPitchClass + interval) % 12;
  const rootLabel = getPitchClassLabel(pitchClass, settings);

  return (
    `${degreeAccidental}${romanNumeral}${qualitySuffix}`
    + ` \u00B7 ${rootLabel} ${qualityLabel}`
  );
}

function createDegreeAccidental(offset: number): string {
  if (offset < 0) {
    return "b".repeat(-offset);
  }

  if (offset > 0) {
    return "#".repeat(offset);
  }

  return "";
}

function getPitchClassSpelling(
  settings: PitchSnapSettings,
): readonly SpelledPitchClass[] {
  const cacheKey = getPitchLabelContextKey(settings);
  const cached = spellingCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const pattern = getTonalPatternDefinition(settings.patternId);
  const tonicLabel = getPreferredTonicLabel(
    settings.tonicPitchClass,
    settings.patternId,
  );
  const tonicLetter = tonicLabel[0] ?? "C";
  const tonicLetterIndex = NATURAL_NOTE_NAMES.indexOf(
    tonicLetter as (typeof NATURAL_NOTE_NAMES)[number],
  );
  const spelledPattern: Array<SpelledPitchClass | undefined> =
    new Array(12);
  let accidentalBalance = 0;

  for (
    let intervalIndex = 0;
    intervalIndex < pattern.intervals.length;
    intervalIndex += 1
  ) {
    const interval = pattern.intervals[intervalIndex];
    const letterOffset = pattern.letterOffsets[intervalIndex];

    if (interval === undefined || letterOffset === undefined) {
      continue;
    }

    const letterIndex =
      (Math.max(0, tonicLetterIndex) + letterOffset) % 7;
    const naturalPitchClass = NATURAL_PITCH_CLASSES[letterIndex];

    if (naturalPitchClass === undefined) {
      continue;
    }

    const pitchClass =
      (settings.tonicPitchClass + interval) % 12;
    const accidentalOffset = normalizeAccidentalOffset(
      pitchClass - naturalPitchClass,
    );

    accidentalBalance += accidentalOffset;
    spelledPattern[pitchClass] = createSpelledPitchClass(
      letterIndex,
      accidentalOffset,
    );
  }

  const fallback = accidentalBalance < 0
    ? FLAT_FALLBACK
    : SHARP_FALLBACK;
  const spelling: SpelledPitchClass[] = [];

  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    const patternSpelling = spelledPattern[pitchClass];
    const fallbackSpelling = fallback[pitchClass];

    if (patternSpelling !== undefined) {
      spelling.push(patternSpelling);
    } else if (fallbackSpelling !== undefined) {
      spelling.push(fallbackSpelling);
    }
  }

  const frozen = Object.freeze(spelling);

  spellingCache.set(cacheKey, frozen);
  return frozen;
}

function createChromaticFallback(
  preferSharps: boolean,
): readonly SpelledPitchClass[] {
  const sharpLetterIndices = Object.freeze([
    0,
    0,
    1,
    1,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
  ] as const);
  const flatLetterIndices = Object.freeze([
    0,
    1,
    1,
    2,
    2,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
  ] as const);
  const letterIndices = preferSharps
    ? sharpLetterIndices
    : flatLetterIndices;
  const spelling: SpelledPitchClass[] = [];

  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    const letterIndex = letterIndices[pitchClass];
    const naturalPitchClass =
      letterIndex === undefined
        ? undefined
        : NATURAL_PITCH_CLASSES[letterIndex];

    if (letterIndex === undefined || naturalPitchClass === undefined) {
      continue;
    }

    spelling.push(
      createSpelledPitchClass(
        letterIndex,
        normalizeAccidentalOffset(
          pitchClass - naturalPitchClass,
        ),
      ),
    );
  }

  return Object.freeze(spelling);
}

function createSpelledPitchClass(
  letterIndex: number,
  accidentalOffset: number,
): SpelledPitchClass {
  const noteName = NATURAL_NOTE_NAMES[letterIndex] ?? "?";
  const accidental =
    accidentalOffset < 0
      ? "b".repeat(-accidentalOffset)
      : "#".repeat(accidentalOffset);

  return Object.freeze({
    label: `${noteName}${accidental}`,
    naturalPitchClass:
      NATURAL_PITCH_CLASSES[letterIndex] ?? 0,
    accidentalOffset,
  });
}

function normalizeAccidentalOffset(offset: number): number {
  let normalized = offset;

  while (normalized > 6) {
    normalized -= 12;
  }

  while (normalized < -6) {
    normalized += 12;
  }

  return normalized;
}
