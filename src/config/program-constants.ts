/**
 * Central program configuration.
 *
 * Values that define product limits, default behavior, interaction feel, or
 * cross-module rendering policy belong here. Constants that are private
 * implementation details of one algorithm should remain beside that
 * algorithm.
 */

const USER_VOICE_COLOR_PALETTE = Object.freeze([
  "#79a7ff",
  "#a77bf3",
  "#ff9b71",
  "#62d6b4",
  "#f0c66f",
  "#f17ca8",
] as const);

/** Persistent project defaults and hard domain limits. */
export const PROJECT_CONSTANTS = Object.freeze({
  ppqn: 960,
  schemaVersion: 5,
  defaultMeasureCount: 16,
  demoProjectTitle: "Untitled exploration",
  defaultTempoBpm: 120,
  demoTempoBpm: 112,
  defaultTimeSignatureNumerator: 4,
  defaultTimeSignatureDenominator: 4,
  minimumMeasureCount: 1,
  maximumMeasureCount: 256,
  defaultMasterGain: 0.72,
  defaultMasterMuted: false,
  minimumMasterGain: 0,
  maximumMasterGain: 1,
  defaultInstrumentPolyphony: 1,
  minimumInstrumentPolyphony: 1,
  maximumInstrumentPolyphony: 16,
  maximumEntityIdLength: 160,
  maximumProjectTitleLength: 200,
  maximumVoiceNameLength: 128,
  maximumVoiceCount: 256,
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
      color: USER_VOICE_COLOR_PALETTE[0],
    }),
    Object.freeze({
      id: "voice-bloom",
      name: "Bloom",
      color: USER_VOICE_COLOR_PALETTE[1],
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
  minimumNoteSeconds: 0.002,
  cancellationFadeSeconds: 0.006,
  busRampSeconds: 0.008,
  envelopeTimeConstantDivisor: 5,
} as const);

/** Viewport ranges and initial editor framing. */
export const VIEWPORT_CONSTANTS = Object.freeze({
  minimumMidiPitch: PROJECT_CONSTANTS.minimumMidiPitch,
  maximumMidiPitch: PROJECT_CONSTANTS.maximumMidiPitch,
  minimumHorizontalZoom: 0.1,
  maximumHorizontalZoom: 2.5,
  minimumVerticalZoom: 0.5,
  maximumVerticalZoom: 2.2,
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
  longPressDelayMs: 560,
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
  contextActionEventName: "piano-roll-context-action",
} as const);

/** Piano-roll layout and control response values. */
export const EDITOR_CONSTANTS = Object.freeze({
  rulerHeightCssPixels: 28,
  loopRegionHeightCssPixels: 22,
  envelopeSliderCurveExponent: 2.6,
  tempoMinimumBpm: 30,
  tempoMaximumBpm: 240,
  tempoStepBpm: 0.1,
  envelopeTimeMaximumSeconds: 2,
  envelopeTimeStepSeconds: 0.001,
  sustainStep: 0.005,
  gainStep: 0.01,
  parameterSliderPositionStep: 0.001,
  horizontalScrollStep: 48,
  verticalScrollStep: 4,
  zoomStep: 0.05,
  defaultDrawVelocity: 100,
  defaultInteractionTool: "select",
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

/** Rendering budgets and reusable application colors. */
export const RENDERING_CONSTANTS = Object.freeze({
  applicationSurfaceColor: "#111318",
  defaultNoteColor: "#6ea8fe",
  gridBlackKeyRowColor: "#121419",
  gridPitchLineColor: "#252a33",
  gridSubdivisionLineColor: "#242933",
  gridBeatLineColor: "#303744",
  gridBarLineColor: "#465164",
  minimumGridLineSpacingCssPixels: 4,
  maximumGridLinesPerPass: 4_096,
  pitchClassNoteColors: Object.freeze([
    "#ef5c65",
    "#f07c5d",
    "#eaa64f",
    "#d3c958",
    "#8bcf63",
    "#55c89e",
    "#4bc2d1",
    "#5797ea",
    "#7775e8",
    "#a66fdc",
    "#d56dbc",
    "#ea6f8d",
  ]),
  userVoiceColors: USER_VOICE_COLOR_PALETTE,
} as const);

/** Native document limits and browser download behavior. */
export const FILE_CONSTANTS = Object.freeze({
  nativeProjectFormat: "com.piano-roll.native-project",
  nativeProjectVersion: 5,
  nativeProjectExtension: ".pianoroll",
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
