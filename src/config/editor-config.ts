import {
  PROJECT_CONSTANTS,
} from "./domain-limits";

/** Viewport ranges, editor defaults, and UI control response values. */
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
export const EDITOR_CONSTANTS = Object.freeze({
  rulerHeightCssPixels: 50,
  defaultPitchPreviewEnabled: true,
  envelopeSliderCurveExponent: 2.6,
  tempoMinimumBpm: 30,
  tempoMaximumBpm: 240,
  tempoStepBpm: 0.1,
  envelopeTimeMaximumSeconds: 2,
  envelopeDecayMaximumSeconds: 10,
  envelopeTimeStepSeconds: 0.001,
  sustainStep: 0.005,
  pulseWidthStep: 0.01,
  filterCutoffStepHz: 1,
  filterResonanceStep: 0.05,
  filterEnvelopeAmountStepOctaves: 0.05,
  gainStep: 0.01,
  parameterSliderPositionStep: 0.001,
  zoomStep: 0.05,
  defaultDrawVelocity: 100,
  defaultNoteColorMode: "instrument",
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
