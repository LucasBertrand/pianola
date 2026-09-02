import {
  VIEWPORT_CONSTANTS,
} from "./viewport-constants";
import type {
  ViewportState,
} from "../geometry/converter";

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
  const fitZoom = sanitizeExtent(viewportHeight)
    / (
      VIEWPORT_CONSTANTS.displayedPitchCount
      * sanitizeExtent(pitchHeight)
    );

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
  return normalizeScrollMaximum(
    VIEWPORT_CONSTANTS.displayedPitchCount
      * viewport.pitchHeight * viewport.zoomY
      - sanitizeExtent(viewportHeight),
  );
}

/**
 * Resolves the horizontal page containing a playhead tick. Pages are anchored
 * at the clip origin and are exactly one visible viewport wide.
 */
export function getPagedScrollXForTick(
  viewport: ViewportState,
  viewportWidth: number,
  totalTicks: number,
  playheadTick: number,
): number {
  const safeWidth = sanitizeExtent(viewportWidth);
  const playheadPixel = Math.max(0, playheadTick)
    * viewport.zoomX
    / viewport.ticksPerPixel;
  const pageStartPixel = Math.floor(playheadPixel / safeWidth)
    * safeWidth;

  return Math.min(
    pageStartPixel,
    getMaximumHorizontalScroll(
      viewport,
      safeWidth,
      totalTicks,
    ),
  );
}

/**
 * Preserves the current framing while the playhead is visible. After the
 * playhead leaves either horizontal edge, the next framing starts exactly at
 * its position. The end of the clip is the only case where content bounds can
 * prevent left alignment.
 */
export function getScrollXToRevealTick(
  viewport: ViewportState,
  viewportWidth: number,
  totalTicks: number,
  playheadTick: number,
): number {
  const safeWidth = sanitizeExtent(viewportWidth);
  const maximumScrollX = getMaximumHorizontalScroll(
    viewport,
    safeWidth,
    totalTicks,
  );
  const currentScrollX = clamp(
    viewport.scrollX,
    0,
    maximumScrollX,
  );
  const playheadPixel = Math.max(0, playheadTick)
    * viewport.zoomX
    / viewport.ticksPerPixel;

  if (
    playheadPixel >= currentScrollX
    && playheadPixel <= currentScrollX + safeWidth
  ) {
    return currentScrollX;
  }

  return Math.min(playheadPixel, maximumScrollX);
}

/**
 * Resolves playback following without competing with direct manipulation.
 * A suspended interaction owns the viewport completely. Once released, the
 * current framing is preserved while the playhead remains visible and normal
 * page following resumes only after the playhead crosses a viewport edge.
 */
export function getPlaybackFollowScrollX(
  viewport: ViewportState,
  viewportWidth: number,
  totalTicks: number,
  playheadTick: number,
  suspended: boolean,
): number {
  if (suspended) {
    return viewport.scrollX;
  }

  return getScrollXToRevealTick(
    viewport,
    viewportWidth,
    totalTicks,
    playheadTick,
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
