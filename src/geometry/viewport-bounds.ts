import {
  VIEWPORT_CONSTANTS,
} from "../config/program-constants";
import type {
  ViewportState,
} from "./converter";

const SCROLL_EPSILON_CSS_PIXELS = 0.000001;

/**
 * Returns the smallest horizontal zoom that keeps the complete clip exactly
 * inside the available width. The product maximum remains authoritative when
 * a very short clip cannot fill an unusually wide viewport.
 */
export function getMinimumHorizontalZoom(
  viewportWidth: number,
  totalTicks: number,
  ticksPerPixel: number,
): number {
  const fitZoom = sanitizeExtent(viewportWidth)
    * sanitizeExtent(ticksPerPixel)
    / sanitizeExtent(totalTicks);

  return clamp(
    fitZoom,
    VIEWPORT_CONSTANTS.minimumStoredZoom,
    VIEWPORT_CONSTANTS.maximumHorizontalZoom,
  );
}

/**
 * Returns the smallest vertical zoom that displays the complete MIDI pitch
 * range without scrolling.
 */
export function getMinimumVerticalZoom(
  viewportHeight: number,
  pitchHeight: number,
): number {
  const pitchCount =
    VIEWPORT_CONSTANTS.maximumMidiPitch
    - VIEWPORT_CONSTANTS.minimumMidiPitch
    + 1;
  const fitZoom = sanitizeExtent(viewportHeight)
    / (pitchCount * sanitizeExtent(pitchHeight));

  return clamp(
    fitZoom,
    VIEWPORT_CONSTANTS.minimumStoredZoom,
    VIEWPORT_CONSTANTS.maximumVerticalZoom,
  );
}

/** Keeps zoom and scroll valid after content or viewport dimensions change. */
export function constrainViewportToContent(
  viewport: ViewportState,
  viewportWidth: number,
  viewportHeight: number,
  totalTicks: number,
): ViewportState {
  const zoomX = clamp(
    viewport.zoomX,
    getMinimumHorizontalZoom(
      viewportWidth,
      totalTicks,
      viewport.ticksPerPixel,
    ),
    VIEWPORT_CONSTANTS.maximumHorizontalZoom,
  );
  const zoomY = clamp(
    viewport.zoomY,
    getMinimumVerticalZoom(viewportHeight, viewport.pitchHeight),
    VIEWPORT_CONSTANTS.maximumVerticalZoom,
  );
  const nextViewport = {
    ...viewport,
    zoomX,
    zoomY,
  };

  return {
    ...nextViewport,
    scrollX: clamp(
      viewport.scrollX,
      0,
      getMaximumHorizontalScroll(
        nextViewport,
        viewportWidth,
        totalTicks,
      ),
    ),
    scrollY: clamp(
      viewport.scrollY,
      0,
      getMaximumVerticalScroll(nextViewport, viewportHeight),
    ),
  };
}

export function getMaximumHorizontalScroll(
  viewport: ViewportState,
  viewportWidth: number,
  totalTicks: number,
): number {
  return normalizeScrollMaximum(
    sanitizeExtent(totalTicks)
      * viewport.zoomX
      / viewport.ticksPerPixel
      - sanitizeExtent(viewportWidth),
  );
}

export function getMaximumVerticalScroll(
  viewport: ViewportState,
  viewportHeight: number,
): number {
  const pitchCount =
    VIEWPORT_CONSTANTS.maximumMidiPitch
    - VIEWPORT_CONSTANTS.minimumMidiPitch
    + 1;

  return normalizeScrollMaximum(
    pitchCount * viewport.pitchHeight * viewport.zoomY
      - sanitizeExtent(viewportHeight),
  );
}

function normalizeScrollMaximum(value: number): number {
  return value <= SCROLL_EPSILON_CSS_PIXELS ? 0 : value;
}

function sanitizeExtent(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, value));
}
