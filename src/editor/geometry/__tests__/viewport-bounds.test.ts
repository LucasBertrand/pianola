import {
  describe,
  expect,
  test,
} from "vitest";
import {
  VIEWPORT_CONSTANTS,
} from "../../viewport/viewport-constants";
import type {
  ViewportState,
} from "../converter";
import {
  constrainViewportToContent,
  getMaximumHorizontalScroll,
  getMaximumVerticalScroll,
  getMinimumHorizontalZoom,
  getMinimumVerticalZoom,
  getPagedScrollXForTick,
  getPlaybackFollowScrollX,
  getScrollXToRevealTick,
} from "../viewport-bounds";

const VIEWPORT: ViewportState = {
  zoomX: 1,
  zoomY: 1,
  scrollX: 800,
  scrollY: 0,
  pitchHeight: 18,
  ticksPerPixel: 5,
  devicePixelRatio: 1,
};

describe("viewport bounds", () => {
  test("uses the 88-key classical piano range for vertical content", () => {
    expect(VIEWPORT_CONSTANTS.displayedPitchCount).toBe(88);
    expect(VIEWPORT_CONSTANTS.lowestDisplayedMidiPitch).toBe(21);
    expect(VIEWPORT_CONSTANTS.highestDisplayedMidiPitch).toBe(108);
    expect(
      VIEWPORT_CONSTANTS.highestDisplayedMidiPitch
      - VIEWPORT_CONSTANTS.lowestDisplayedMidiPitch
      + 1,
    ).toBe(VIEWPORT_CONSTANTS.displayedPitchCount);

    expect(getMinimumVerticalZoom(1_584, 18)).toBe(1);
    expect(getMaximumVerticalScroll(VIEWPORT, 720)).toBe(864);
  });

  test("derives zoom limits from content and viewport dimensions", () => {
    const unconstrained = {
      ...VIEWPORT,
      zoomX: 0.01,
      zoomY: 0.01,
      scrollX: 500,
      scrollY: 500,
      devicePixelRatio: 2,
    };
    const viewportWidthCssPixels = 1_200;
    const viewportHeightCssPixels = 720;
    const totalTicks = 61_440;
    const minimumZoomX = getMinimumHorizontalZoom(
      viewportWidthCssPixels,
      totalTicks,
      unconstrained.ticksPerPixel,
    );
    const minimumZoomY = getMinimumVerticalZoom(
      viewportHeightCssPixels,
      unconstrained.pitchHeight,
    );
    const constrained = constrainViewportToContent(
      unconstrained,
      viewportWidthCssPixels,
      viewportHeightCssPixels,
      totalTicks,
    );

    expect(constrained.zoomX).toBe(minimumZoomX);
    expect(constrained.zoomY).toBe(minimumZoomY);
    expect(getMaximumHorizontalScroll(
      constrained,
      viewportWidthCssPixels,
      totalTicks,
    )).toBe(0);
    expect(getMaximumVerticalScroll(
      constrained,
      viewportHeightCssPixels,
    )).toBe(0);
  });

  test("pages only after the playhead crosses a visible edge", () => {
    const viewport = {
      ...VIEWPORT,
      scrollX: 0,
    };

    expect(getPagedScrollXForTick(viewport, 800, 12_000, 3_999)).toBe(0);
    expect(getPagedScrollXForTick(viewport, 800, 12_000, 4_000)).toBe(800);
    expect(getPagedScrollXForTick(viewport, 800, 12_000, 8_000)).toBe(1_600);
    expect(getPagedScrollXForTick(viewport, 800, 12_000, 12_000)).toBe(1_600);
  });

  test("reveals external playhead moves while preserving visible positions", () => {
    expect(getScrollXToRevealTick(VIEWPORT, 800, 16_000, 5_000)).toBe(800);
    expect(getScrollXToRevealTick(VIEWPORT, 800, 16_000, 8_500)).toBe(1_700);
    expect(getScrollXToRevealTick(VIEWPORT, 800, 16_000, 500)).toBe(100);
  });

  test("suspends playback following during horizontal navigation", () => {
    expect(getPlaybackFollowScrollX(
      VIEWPORT,
      800,
      16_000,
      8_500,
      true,
    )).toBe(800);
    expect(getPlaybackFollowScrollX(
      VIEWPORT,
      800,
      16_000,
      8_500,
      false,
    )).toBe(1_700);
  });
});
