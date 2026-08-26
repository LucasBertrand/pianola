import {
  VIEWPORT_CONSTANTS,
} from "../../config/editor-config";
import {
  getClipDurationTicks,
  type Clip,
} from "../../domain/clips/clip";
import type {
  ViewportState,
} from "../geometry/converter";

export function computeClipFitViewport(
  clip: Pick<Clip, "timeline" | "tracksByInstrumentId">,
  viewportWidth: number,
  viewportHeight: number,
): ViewportState {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);

  const durationTicks = Math.max(1, getClipDurationTicks(clip));
  
  let minPitch = Number.MAX_SAFE_INTEGER;
  let maxPitch = Number.MIN_SAFE_INTEGER;
  let hasNotes = false;

  for (const track of Object.values(clip.tracksByInstrumentId)) {
    for (const note of Object.values(track.notesById)) {
      hasNotes = true;
      if (note.pitch < minPitch) {
        minPitch = note.pitch;
      }
      if (note.pitch > maxPitch) {
        maxPitch = note.pitch;
      }
    }
  }

  const defaultTicksPerPixel = VIEWPORT_CONSTANTS.initialTicksPerPixel;
  const defaultPitchHeight = VIEWPORT_CONSTANTS.initialPitchHeightCssPixels;

  const idealZoomX = (safeWidth * defaultTicksPerPixel) / durationTicks;
  const zoomX = Math.min(
    VIEWPORT_CONSTANTS.maximumHorizontalZoom,
    Math.max(VIEWPORT_CONSTANTS.minimumStoredZoom, idealZoomX)
  );

  let zoomY: number = VIEWPORT_CONSTANTS.initialVerticalZoom;
  let scrollY = 0;

  if (!hasNotes) {
    zoomY = VIEWPORT_CONSTANTS.initialVerticalZoom;
    const centerPitch = 60; // Middle C
    const centerPitchRow = VIEWPORT_CONSTANTS.highestDisplayedMidiPitch - centerPitch + 0.5;
    const scrollYCenter = centerPitchRow * defaultPitchHeight * zoomY - safeHeight / 2;
    const maxScrollY = Math.max(0, VIEWPORT_CONSTANTS.displayedPitchCount * defaultPitchHeight * zoomY - safeHeight);
    scrollY = Math.max(0, Math.min(maxScrollY, scrollYCenter));
  } else {
    const padding = 7;
    const paddedMinPitch = Math.max(VIEWPORT_CONSTANTS.lowestDisplayedMidiPitch, minPitch - padding);
    const paddedMaxPitch = Math.min(VIEWPORT_CONSTANTS.highestDisplayedMidiPitch, maxPitch + padding);

    const pitchRange = Math.max(1, paddedMaxPitch - paddedMinPitch + 1);

    const idealZoomY = safeHeight / (pitchRange * defaultPitchHeight);
    zoomY = Math.min(
      VIEWPORT_CONSTANTS.maximumVerticalZoom,
      Math.max(VIEWPORT_CONSTANTS.minimumStoredZoom, idealZoomY)
    );

    const centerPitch = (paddedMinPitch + paddedMaxPitch) / 2;
    const centerPitchRow = VIEWPORT_CONSTANTS.highestDisplayedMidiPitch - centerPitch + 0.5;
    const maxScrollY = Math.max(0, VIEWPORT_CONSTANTS.displayedPitchCount * defaultPitchHeight * zoomY - safeHeight);

    scrollY = Math.max(0, Math.min(maxScrollY, centerPitchRow * defaultPitchHeight * zoomY - safeHeight / 2));
  }

  return {
    zoomX,
    zoomY,
    scrollX: 0,
    scrollY,
    pitchHeight: defaultPitchHeight,
    ticksPerPixel: defaultTicksPerPixel,
    devicePixelRatio: VIEWPORT_CONSTANTS.initialDevicePixelRatio,
  };
}
