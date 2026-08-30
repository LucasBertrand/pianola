import {
  PROJECT_CONSTANTS,
} from "../../domain/project/project-constants";

/** Editor defaults and UI control response values. */
export const EDITOR_CONSTANTS = Object.freeze({
  rulerHeightCssPixels: 50,
  defaultPitchPreviewEnabled: true,
  envelopeSliderCurveExponent: 2.6,
  envelopeTimeStepSeconds: 0.001,
  sustainStep: 0.005,
  pulseWidthStep: 0.01,
  filterCutoffStepHz: 1,
  filterResonanceStep: 0.05,
  filterKeyTrackingStep: 0.01,
  filterEnvelopeAmountStepOctaves: 0.05,
  envelopeCurveStep: 0.01,
  gainStep: 0.01,
  parameterSliderPositionStep: 0.001,
  zoomStep: 0.05,
  defaultDrawVelocity: 100,
  defaultNoteColorMode: "pitch",
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
} as const);
