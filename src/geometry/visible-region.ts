import {
  VIEWPORT_CONSTANTS,
} from "../config/program-constants";
import type {
  ViewportState,
} from "./converter";
import type {
  Rect,
} from "./rect";

/** Derives visible musical bounds from one viewport snapshot. */
export function calculateVisibleRegion(
  viewport: ViewportState,
  widthCssPixels: number,
  heightCssPixels: number,
  totalTicks: number,
): Rect {
  const startTick =
    viewport.scrollX * viewport.ticksPerPixel / viewport.zoomX;
  const endTick =
    (viewport.scrollX + widthCssPixels)
    * viewport.ticksPerPixel
    / viewport.zoomX;
  const pitchHeight = viewport.pitchHeight * viewport.zoomY;
  const maxPitch =
    VIEWPORT_CONSTANTS.maximumMidiPitch
    - Math.floor(viewport.scrollY / pitchHeight);
  const minPitch =
    VIEWPORT_CONSTANTS.maximumMidiPitch
    - Math.floor(
      (viewport.scrollY + heightCssPixels) / pitchHeight,
    );

  return {
    startTick: Math.max(0, startTick),
    endTick: Math.min(totalTicks, endTick),
    minPitch: Math.max(
      VIEWPORT_CONSTANTS.minimumMidiPitch,
      minPitch,
    ),
    maxPitch: Math.min(
      VIEWPORT_CONSTANTS.maximumMidiPitch,
      maxPitch,
    ),
  };
}
