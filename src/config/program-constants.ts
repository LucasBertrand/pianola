/**
 * Central program configuration.
 *
 * Values that define product limits, default behavior, interaction feel, or
 * cross-module rendering policy belong here. Constants that are private
 * implementation details of one algorithm should remain beside that
 * algorithm.
 */
import {
  APPLICATION_COLORS,
} from "./application-colors";

/** Product identity shared by runtime features and generated file names. */
export const APPLICATION_CONSTANTS = Object.freeze({
  productName: "Pianola",
  productSlug: "pianola",
  defaultProjectTitle: "Pianola Project",
  demoProjectTitle: "Pianola Demo",
} as const);

/** Persistent project defaults and hard domain limits. */
export const PROJECT_CONSTANTS = Object.freeze({
  ppqn: 960,
  schemaVersion: 7,
  defaultMeasureCount: 16,
  demoProjectTitle: APPLICATION_CONSTANTS.demoProjectTitle,
  defaultTempoBpm: 120,
  demoTempoBpm: 112,
  defaultTimeSignatureNumerator: 4,
  defaultTimeSignatureDenominator: 4,
  minimumMeasureCount: 1,
  maximumMeasureCount: 256,
  defaultMasterGain: 0.72,
  defaultMasterMuted: false,
  defaultMasterTuningFrequencyHz: 440,
  minimumMasterTuningFrequencyHz: 400,
  maximumMasterTuningFrequencyHz: 480,
  masterTuningStepHz: 0.1,
  minimumMasterGain: 0,
  maximumMasterGain: 1,
  defaultInstrumentPolyphony: 1,
  minimumInstrumentPolyphony: 1,
  maximumInstrumentPolyphony: 16,
  maximumEntityIdLength: 160,
  maximumProjectTitleLength: 200,
  // Clip limits protect native-file parsing and inspector usability.
  maximumClipNameLength: 128,
  maximumClipCount: 256,
  maximumVoiceNameLength: 128,
  maximumVoiceCount: 256,
  // This rendering and validation budget is applied independently per clip.
  maximumNoteCount: 250_000,
  maximumVoiceDescriptorCount: 128,
  maximumDescriptorParameterCount: 256,
  maximumHistoryEntries: 200,
  defaultLoopEnabled: false,
  minimumMidiPitch: 0,
  maximumMidiPitch: 127,
  minimumMidiVelocity: 0,
  maximumMidiVelocity: 127,
} as const);

/** Default settings applied whenever the application creates a voice. */
export const VOICE_CONSTANTS = Object.freeze({
  gain: 0.82,
  minimumGain: 0,
  maximumGain: 1,
  pan: 0,
  muted: false,
  locked: false,
  solo: false,
  defaultOscillatorWaveform: "sawtooth",
  oscillatorWaveformCycle: Object.freeze([
    "sawtooth",
    "sine",
    "square",
    "triangle",
  ] as const),
  oscillatorWaveformOptions: Object.freeze([
    Object.freeze({
      value: "sine",
      label: "Sine",
    }),
    Object.freeze({
      value: "triangle",
      label: "Triangle",
    }),
    Object.freeze({
      value: "sawtooth",
      label: "Saw",
    }),
    Object.freeze({
      value: "square",
      label: "Square",
    }),
  ] as const),
  demoVoices: Object.freeze([
    Object.freeze({
      id: "voice-atlas",
      name: "Atlas",
      color: APPLICATION_COLORS.notes.voicePalette[0],
    }),
    Object.freeze({
      id: "voice-bloom",
      name: "Bloom",
      color: APPLICATION_COLORS.notes.voicePalette[1],
    }),
  ] as const),
  oscillatorDetuneCents: 0,
  attackSeconds: 0.012,
  decaySeconds: 0.18,
  sustainLevel: 0.72,
  releaseSeconds: 0.42,
  filterCutoffHz: 12_000,
  filterResonance: 0.2,
  transposeSemitones: 0,
  timingOffsetTicks: 0,
  gateRatio: 1,
  velocityScale: 1,
  probability: 1,
} as const);

/** Default audio graph and lookahead scheduler behavior. */
export const AUDIO_CONSTANTS = Object.freeze({
  latencyHint: "interactive",
  schedulerPulseIntervalMs: 25,
  scheduleAheadSeconds: 0.12,
  lateEventToleranceSeconds: 0.035,
  latencyCompensationSeconds: 0.012,
  releaseTailSeconds: 2,
  minimumRestartLeadSeconds: 0.012,
  auditionNoteDurationSeconds: 0.4,
  auditionNoteVelocity: 104,
  fixedNoteEnvelopePeakLevel: 100 / 127,
  minimumNoteSeconds: 0.002,
  cancellationFadeSeconds: 0.006,
  busRampSeconds: 0.008,
  envelopeTimeConstantDivisor: 5,
} as const);

/** Viewport ranges and initial editor framing. */
export const VIEWPORT_CONSTANTS = Object.freeze({
  minimumMidiPitch: PROJECT_CONSTANTS.minimumMidiPitch,
  maximumMidiPitch: PROJECT_CONSTANTS.maximumMidiPitch,
  maximumHorizontalZoom: 2.5,
  maximumVerticalZoom: 2.2,
  // This is only a serialization and numerical-safety guard. The actual
  // minimum zoom is calculated from the clip extent and viewport dimensions.
  minimumStoredZoom: 0.000001,
  initialPitchHeightCssPixels: 18,
  initialMaximumVisiblePitch: 84,
  initialTicksPerPixel: 5,
  initialWidthCssPixels: 1_600,
  initialHeightCssPixels: 900,
  initialHorizontalZoom: 1,
  initialVerticalZoom: 1,
  initialDevicePixelRatio: 1,
  maximumCanvasDevicePixelRatio: 2,
  maximumCoarsePointerDevicePixelRatio: 1.5,
} as const);

/** Touch, pointer, keyboard-preview, and pinch gesture tuning. */
export const INTERACTION_CONSTANTS = Object.freeze({
  longPressDelayMs: 300,
  penLongPressDelayMs: 280,
  longPressMovementToleranceCssPixels: 12,
  pianoKeyLongPressDelayMs: 520,
  pianoKeyPenLongPressDelayMs: 280,
  pianoKeyLongPressMovementToleranceCssPixels: 10,
  voiceNameLongPressDelayMs: 520,
  voiceNameLongPressMovementToleranceCssPixels: 10,
  touchDoubleTapDelayMs: 360,
  touchDoubleTapDistanceCssPixels: 24,
  tapMovementToleranceCssPixels: 10,
  mouseResizeHandleCssPixels: 8,
  touchResizeHandleCssPixels: 16,
  mouseNoteHitEnvelopeCssPixels: 2,
  touchNoteHitEnvelopeCssPixels: 10,
  minimumPinchDistanceCssPixels: 8,
  pinchAxisLockRatio: 1.35,
  minimumPinchScale: 0.82,
  maximumPinchScale: 1.22,
  pinchScaleDeadZone: 0.003,
} as const);

/**
 * Tonal pitch-snap presets.
 *
 * Intervals are semitone offsets from the selected tonic. Keeping the
 * interval formulas here makes the musical vocabulary easy to extend without
 * changing the interaction algorithm.
 */
export const TONAL_SNAP_CONSTANTS = Object.freeze({
  defaultEnabled: false,
  defaultVisualGuideEnabled: false,
  defaultTonicPitchClass: 0,
  defaultPatternId: "ionian",
  defaultScaleDegreeIndex: null,
  scaleDegreeRomanNumerals: Object.freeze([
    "I",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
  ] as const),
  // Labels are neutral fallbacks; the UI derives the preferred enharmonic
  // spelling from the selected pattern and its total accidental cost.
  tonicOptions: Object.freeze([
    Object.freeze({ value: 0, label: "C" }),
    Object.freeze({ value: 1, label: "C#" }),
    Object.freeze({ value: 2, label: "D" }),
    Object.freeze({ value: 3, label: "D#" }),
    Object.freeze({ value: 4, label: "E" }),
    Object.freeze({ value: 5, label: "F" }),
    Object.freeze({ value: 6, label: "F#" }),
    Object.freeze({ value: 7, label: "G" }),
    Object.freeze({ value: 8, label: "G#" }),
    Object.freeze({ value: 9, label: "A" }),
    Object.freeze({ value: 10, label: "A#" }),
    Object.freeze({ value: 11, label: "B" }),
  ] as const),
  patternFamilies: Object.freeze([
    Object.freeze({
      id: "diatonic",
      label: "Diatonic modes",
    }),
    Object.freeze({
      id: "minor-altered",
      label: "Minor and altered",
    }),
    Object.freeze({
      id: "pentatonic-folk",
      label: "Pentatonic and folk",
    }),
    Object.freeze({
      id: "symmetric",
      label: "Symmetric scales",
    }),
  ] as const),
  patterns: Object.freeze([
    Object.freeze({
      id: "ionian",
      label: "Ionian",
      family: "diatonic",
      intervals: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    }),
    Object.freeze({
      id: "dorian",
      label: "Dorian",
      family: "diatonic",
      intervals: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    }),
    Object.freeze({
      id: "phrygian",
      label: "Phrygian",
      family: "diatonic",
      intervals: Object.freeze([0, 1, 3, 5, 7, 8, 10]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    }),
    Object.freeze({
      id: "lydian",
      label: "Lydian",
      family: "diatonic",
      intervals: Object.freeze([0, 2, 4, 6, 7, 9, 11]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    }),
    Object.freeze({
      id: "mixolydian",
      label: "Mixolydian",
      family: "diatonic",
      intervals: Object.freeze([0, 2, 4, 5, 7, 9, 10]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    }),
    Object.freeze({
      id: "aeolian",
      label: "Aeolian",
      family: "diatonic",
      intervals: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    }),
    Object.freeze({
      id: "locrian",
      label: "Locrian",
      family: "diatonic",
      intervals: Object.freeze([0, 1, 3, 5, 6, 8, 10]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    }),
    Object.freeze({
      id: "harmonic-minor",
      label: "Harmonic minor",
      family: "minor-altered",
      intervals: Object.freeze([0, 2, 3, 5, 7, 8, 11]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    }),
    Object.freeze({
      id: "melodic-minor",
      label: "Melodic minor (ascending)",
      family: "minor-altered",
      intervals: Object.freeze([0, 2, 3, 5, 7, 9, 11]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    }),
    Object.freeze({
      id: "phrygian-dominant",
      label: "Phrygian dominant",
      family: "minor-altered",
      intervals: Object.freeze([0, 1, 4, 5, 7, 8, 10]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    }),
    Object.freeze({
      id: "double-harmonic-major",
      label: "Double harmonic major",
      family: "minor-altered",
      intervals: Object.freeze([0, 1, 4, 5, 7, 8, 11]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    }),
    Object.freeze({
      id: "hungarian-minor",
      label: "Hungarian minor",
      family: "minor-altered",
      intervals: Object.freeze([0, 2, 3, 6, 7, 8, 11]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    }),
    Object.freeze({
      id: "major-pentatonic",
      label: "Major pentatonic",
      family: "pentatonic-folk",
      intervals: Object.freeze([0, 2, 4, 7, 9]),
      letterOffsets: Object.freeze([0, 1, 2, 4, 5]),
    }),
    Object.freeze({
      id: "minor-pentatonic",
      label: "Minor pentatonic",
      family: "pentatonic-folk",
      intervals: Object.freeze([0, 3, 5, 7, 10]),
      letterOffsets: Object.freeze([0, 2, 3, 4, 6]),
    }),
    Object.freeze({
      id: "blues",
      label: "Blues",
      family: "pentatonic-folk",
      intervals: Object.freeze([0, 3, 5, 6, 7, 10]),
      letterOffsets: Object.freeze([0, 2, 3, 3, 4, 6]),
    }),
    Object.freeze({
      id: "hirajoshi",
      label: "Hirajoshi",
      family: "pentatonic-folk",
      intervals: Object.freeze([0, 2, 3, 7, 8]),
      letterOffsets: Object.freeze([0, 1, 2, 4, 5]),
    }),
    Object.freeze({
      id: "in-sen",
      label: "In Sen",
      family: "pentatonic-folk",
      intervals: Object.freeze([0, 1, 5, 7, 10]),
      letterOffsets: Object.freeze([0, 1, 3, 4, 6]),
    }),
    Object.freeze({
      id: "whole-tone",
      label: "Whole tone",
      family: "symmetric",
      intervals: Object.freeze([0, 2, 4, 6, 8, 10]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5]),
    }),
    Object.freeze({
      id: "diminished-whole-half",
      label: "Diminished (whole-half)",
      family: "symmetric",
      intervals: Object.freeze([0, 2, 3, 5, 6, 8, 9, 11]),
      letterOffsets: Object.freeze([0, 1, 2, 3, 4, 5, 5, 6]),
    }),
    Object.freeze({
      id: "diminished-half-whole",
      label: "Diminished (half-whole)",
      family: "symmetric",
      intervals: Object.freeze([0, 1, 3, 4, 6, 7, 9, 10]),
      letterOffsets: Object.freeze([0, 1, 2, 2, 3, 4, 5, 6]),
    }),
  ] as const),
} as const);

/** Piano-roll layout and control response values. */
export const EDITOR_CONSTANTS = Object.freeze({
  rulerHeightCssPixels: 28,
  loopRegionHeightCssPixels: 22,
  defaultPitchPreviewEnabled: true,
  envelopeSliderCurveExponent: 2.6,
  tempoMinimumBpm: 30,
  tempoMaximumBpm: 240,
  tempoStepBpm: 0.1,
  envelopeTimeMaximumSeconds: 2,
  envelopeTimeStepSeconds: 0.001,
  sustainStep: 0.005,
  gainStep: 0.01,
  parameterSliderPositionStep: 0.001,
  zoomStep: 0.05,
  defaultDrawVelocity: 100,
  defaultNoteColorMode: "voice",
  defaultGridBaseResolutionTicks: PROJECT_CONSTANTS.ppqn / 4,
  defaultGridSubdivision: "straight",
  transportMeterOptions: Object.freeze([
    Object.freeze({
      value: "3/4",
      label: "3 / 4",
    }),
    Object.freeze({
      value: "4/4",
      label: "4 / 4",
    }),
    Object.freeze({
      value: "5/4",
      label: "5 / 4",
    }),
    Object.freeze({
      value: "6/8",
      label: "6 / 8",
    }),
  ] as const),
  gridResolutionOptions: Object.freeze([
    Object.freeze({
      ticks: PROJECT_CONSTANTS.ppqn,
      label: "1 / 4",
    }),
    Object.freeze({
      ticks: PROJECT_CONSTANTS.ppqn / 2,
      label: "1 / 8",
    }),
    Object.freeze({
      ticks: PROJECT_CONSTANTS.ppqn / 4,
      label: "1 / 16",
    }),
    Object.freeze({
      ticks: PROJECT_CONSTANTS.ppqn / 8,
      label: "1 / 32",
    }),
    Object.freeze({
      ticks: PROJECT_CONSTANTS.ppqn / 16,
      label: "1 / 64",
    }),
  ] as const),
  gridSubdivisionOptions: Object.freeze([
    Object.freeze({
      value: "straight",
      label: "Straight",
    }),
    Object.freeze({
      value: "triplet",
      label: "Triplet",
    }),
    Object.freeze({
      value: "dotted",
      label: "Dotted",
    }),
  ] as const),
  demoNoteCount: 100,
  demoInitialNoteSpanTicks: PROJECT_CONSTANTS.ppqn * 4 * 8,
} as const);

/** Rendering budgets and colors sourced from the central application theme. */
export const RENDERING_CONSTANTS = Object.freeze({
  defaultNoteColor: APPLICATION_COLORS.notes.default,
  noteLabelMinimumHeightCssPixels: 11,
  noteLabelHorizontalPaddingCssPixels: 2,
  noteLabelFontSizeCssPixels: 9,
  noteLabelColor: APPLICATION_COLORS.notes.label,
  tonalSnapPitchRowColor:
    APPLICATION_COLORS.pianoRoll.tonalSnapPitchRow,
  tonalSnapTonicRowColor:
    APPLICATION_COLORS.pianoRoll.tonalSnapRootRow,
  activePitchLaneColor:
    APPLICATION_COLORS.pianoRoll.activePitchLane,
  gridBlackKeyRowColor:
    APPLICATION_COLORS.pianoRoll.blackKeyRow,
  gridPitchLineColor: APPLICATION_COLORS.pianoRoll.pitchLine,
  gridSubdivisionLineColor:
    APPLICATION_COLORS.pianoRoll.subdivisionLine,
  gridBeatLineColor: APPLICATION_COLORS.pianoRoll.beatLine,
  gridBarLineColor: APPLICATION_COLORS.pianoRoll.barLine,
  minimumGridLineSpacingCssPixels: 4,
  maximumGridLinesPerPass: 4_096,
  userVoiceColors: APPLICATION_COLORS.notes.voicePalette,
} as const);

/** Native document limits and browser download behavior. */
export const FILE_CONSTANTS = Object.freeze({
  nativeProjectFormat: "app.pianola.native-project",
  nativeProjectVersion: 1,
  nativeProjectExtension: ".pianola",
  nativeProjectMaximumBytes: 32 * 1024 * 1024,
  objectUrlRevokeDelayMs: 1_000,
} as const);

/** Standard MIDI File limits and deterministic export defaults. */
export const MIDI_CONSTANTS = Object.freeze({
  fileExtension: ".mid",
  acceptedFileExtensions: Object.freeze([".mid", ".midi"]),
  acceptedMimeTypes: Object.freeze(["audio/midi", "audio/x-midi"]),
  maximumFileBytes: 32 * 1024 * 1024,
  maximumOutputBytes: 32 * 1024 * 1024,
  maximumTrackBytes: 16 * 1024 * 1024,
  maximumTextBytes: 64 * 1024,
  maximumTrackCount: 512,
  maximumReadEventsPerTrack: 250_000,
  maximumReadTotalEventCount: 300_000,
  maximumWriteEventsPerTrack: 500_100,
  maximumWriteTotalEventCount: 600_000,
  maximumImportedNoteCount: 100_000,
  maximumVariableLengthQuantity: 0x0fff_ffff,
  maximumPpqn: 0x7fff,
  maximumMetaEventBytes: 4 * 1024 * 1024,
  exportFormat: 1,
  exportChannelCount: 16,
  minimumImportedDurationTicks: 1,
} as const);
