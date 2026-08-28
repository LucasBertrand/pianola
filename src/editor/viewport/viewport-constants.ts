import {
  PROJECT_CONSTANTS,
} from "../../domain/project/project-constants";

const CLASSIC_PIANO_PITCH_COUNT = 88;
const CLASSIC_PIANO_HIGHEST_MIDI_PITCH = 108;
const CLASSIC_PIANO_LOWEST_MIDI_PITCH =
  CLASSIC_PIANO_HIGHEST_MIDI_PITCH - CLASSIC_PIANO_PITCH_COUNT + 1;

/** Viewport ranges and rendering-scale safeguards. */
export const VIEWPORT_CONSTANTS = Object.freeze({
  minimumMidiPitch: PROJECT_CONSTANTS.minimumMidiPitch,
  maximumMidiPitch: PROJECT_CONSTANTS.maximumMidiPitch,
  displayedPitchCount: CLASSIC_PIANO_PITCH_COUNT,
  lowestDisplayedMidiPitch: CLASSIC_PIANO_LOWEST_MIDI_PITCH,
  highestDisplayedMidiPitch: CLASSIC_PIANO_HIGHEST_MIDI_PITCH,
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
