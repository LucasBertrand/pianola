import {
  EDITOR_CONSTANTS,
  VIEWPORT_CONSTANTS,
} from "../../config/editor-config";
import {
  getActiveClip,
  type EditorSessionState,
} from "../../domain/project/project-document";
import {
  getClipDurationTicks,
  type ClipTimeline,
} from "../../domain/clips/clip";
import {
  getMeasurePosition,
  tickToSeconds,
  type TimeMap,
} from "../../domain/transport/time-map";
import type {
  ViewportState,
} from "../geometry/converter";
import type {
  Rect,
} from "../geometry/rect";
import {
  calculateVisibleRegion,
} from "../geometry/visible-region";
import {
  constrainViewportToContent,
  getMaximumHorizontalScroll,
  getMaximumVerticalScroll,
  getMinimumHorizontalZoom,
  getMinimumVerticalZoom,
  getPlaybackFollowScrollX,
} from "../geometry/viewport-bounds";
import type {
  MutableRenderSignal,
  ReadonlyRenderSignal,
} from "../model/render-signal";

/** Pure editor capabilities required to coordinate one viewport. */
export interface ViewportRuntimePort {
  readonly projectStore: {
    getState(): EditorSessionState;
  };
  readonly viewportWidth: MutableRenderSignal<number>;
  readonly viewportHeight: MutableRenderSignal<number>;
  readonly viewport: MutableRenderSignal<ViewportState>;
  readonly visibleRegion: MutableRenderSignal<Rect>;
  readonly playheadTick: ReadonlyRenderSignal<number>;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
}

const VIEW_INPUT_HORIZONTAL_SCROLL = 1;
const VIEW_INPUT_HORIZONTAL_ZOOM = 2;
const VIEW_INPUT_VERTICAL_SCROLL = 4;
const VIEW_INPUT_VERTICAL_ZOOM = 8;

export interface ViewportControlState {
  readonly viewport: ViewportState;
  readonly visibleRegion: Rect;
  readonly minimumHorizontalZoom: number;
  readonly maximumHorizontalScroll: number;
  readonly minimumVerticalZoom: number;
  readonly maximumVerticalScroll: number;
}

export interface TimelinePositionStatus {
  readonly musicalPosition: string;
  readonly elapsedTime: string;
}

/**
 * Owns viewport constraints, publication, playback following and pending input
 * batches. The React adapter supplies dimensions and animation-frame timing.
 */
export class ViewportController {
  private viewportWidth: number =
    VIEWPORT_CONSTANTS.initialWidthCssPixels;
  private viewportHeight: number =
    VIEWPORT_CONSTANTS.initialHeightCssPixels;
  private horizontalInteractionActive = false;
  private followPlayback = false;
  private pendingInputs = 0;
  private pendingHorizontalScroll = 0;
  private pendingHorizontalZoom = 1;
  private pendingVerticalScroll = 0;
  private pendingVerticalZoom = 1;

  public constructor(
    private readonly runtime: ViewportRuntimePort,
  ) {}

  public setFollowPlayback(followPlayback: boolean): void {
    this.followPlayback = followPlayback;
  }

  public updateDimensions(
    width: number,
    stageHeight: number,
  ): ViewportControlState {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(
      1,
      stageHeight - EDITOR_CONSTANTS.rulerHeightCssPixels,
    );
    this.runtime.viewportWidth.set(this.viewportWidth);
    this.runtime.viewportHeight.set(this.viewportHeight);
    return this.synchronize();
  }

  public synchronize(): ViewportControlState {
    const currentViewport = this.runtime.viewport.get();
    const nextViewport = constrainViewportToContent(
      currentViewport,
      this.viewportWidth,
      this.viewportHeight,
      this.getTotalTicks(),
    );

    if (!areViewportsEqual(nextViewport, currentViewport)) {
      return this.publishViewport(nextViewport);
    }

    const nextRegion = this.calculateRegion(nextViewport);
    const currentRegion = this.runtime.visibleRegion.get();

    if (!areRegionsEqual(nextRegion, currentRegion)) {
      this.runtime.visibleRegion.set(nextRegion);
    }

    return this.describe(nextViewport, nextRegion);
  }

  public publishViewport(viewport: ViewportState): ViewportControlState {
    const visibleRegion = this.calculateRegion(viewport);

    this.runtime.viewport.set(viewport);
    this.runtime.visibleRegion.set(visibleRegion);
    return this.describe(viewport, visibleRegion);
  }

  public restoreViewport(
    viewport: ViewportState,
    totalTicks: number,
  ): ViewportControlState {
    return this.publishViewport(
      constrainViewportToContent(
        viewport,
        this.viewportWidth,
        this.viewportHeight,
        totalTicks,
      ),
    );
  }

  public beginHorizontalInteraction(): void {
    this.horizontalInteractionActive = true;
  }

  public endHorizontalInteraction(): ViewportControlState {
    if (!this.horizontalInteractionActive) {
      return this.synchronize();
    }

    this.horizontalInteractionActive = false;
    return this.reconcileHorizontalPlaybackFollow();
  }

  public followPlayhead(): ViewportControlState {
    if (!this.followPlayback) {
      return this.synchronize();
    }

    const viewport = this.runtime.viewport.get();
    const scrollX = getPlaybackFollowScrollX(
      viewport,
      this.viewportWidth,
      this.getTotalTicks(),
      this.runtime.playheadTick.get(),
      this.horizontalInteractionActive,
    );

    return scrollX === viewport.scrollX
      ? this.synchronize()
      : this.publishViewport({ ...viewport, scrollX });
  }

  public queueHorizontalScroll(value: number): void {
    this.pendingHorizontalScroll = value;
    this.pendingInputs |= VIEW_INPUT_HORIZONTAL_SCROLL;
  }

  public queueHorizontalZoom(value: number): void {
    this.pendingHorizontalZoom = value;
    this.pendingInputs |= VIEW_INPUT_HORIZONTAL_ZOOM;
  }

  public queueVerticalScroll(value: number): void {
    this.pendingVerticalScroll = value;
    this.pendingInputs |= VIEW_INPUT_VERTICAL_SCROLL;
  }

  public queueVerticalZoom(value: number): void {
    this.pendingVerticalZoom = value;
    this.pendingInputs |= VIEW_INPUT_VERTICAL_ZOOM;
  }

  public hasPendingInputs(): boolean {
    return this.pendingInputs !== 0;
  }

  public flushPendingInputs(): ViewportControlState {
    const pendingInputs = this.pendingInputs;

    this.pendingInputs = 0;

    if ((pendingInputs & VIEW_INPUT_HORIZONTAL_ZOOM) !== 0) {
      this.applyHorizontalZoom(this.pendingHorizontalZoom);
    }

    if ((pendingInputs & VIEW_INPUT_HORIZONTAL_SCROLL) !== 0) {
      this.applyHorizontalScroll(this.pendingHorizontalScroll);
    }

    if ((pendingInputs & VIEW_INPUT_VERTICAL_ZOOM) !== 0) {
      this.applyVerticalZoom(this.pendingVerticalZoom);
    }

    if ((pendingInputs & VIEW_INPUT_VERTICAL_SCROLL) !== 0) {
      this.applyVerticalScroll(this.pendingVerticalScroll);
    }

    return this.synchronize();
  }

  public getProjectRevision(): number {
    return this.runtime.projectStore.getState().revision;
  }

  public getMaximumPlayheadTick(): number {
    return this.getTotalTicks();
  }

  public getTimelineStatus(): TimelinePositionStatus {
    const playheadTick = this.runtime.playheadTick.get();
    const state = this.runtime.projectStore.getState();
    const activeClip = getActiveClip(state);

    return {
      musicalPosition: formatMusicalPosition(
        playheadTick,
        state.clock.ppqn,
        activeClip.timeline,
        this.runtime.gridResolutionTicks.get(),
      ),
      elapsedTime: formatElapsedTime(
        playheadTick,
        state.clock.ppqn,
        activeClip.timeline.timeMap,
      ),
    };
  }

  private reconcileHorizontalPlaybackFollow(): ViewportControlState {
    if (!this.followPlayback) {
      return this.synchronize();
    }

    return this.followPlayhead();
  }

  private applyHorizontalZoom(zoomX: number): ViewportControlState {
    const viewport = this.runtime.viewport.get();
    const totalTicks = this.getTotalTicks();
    const constrainedZoomX = clamp(
      zoomX,
      getMinimumHorizontalZoom(
        this.viewportWidth,
        totalTicks,
        viewport.ticksPerPixel,
      ),
      VIEWPORT_CONSTANTS.maximumHorizontalZoom,
    );
    const centerTick = (viewport.scrollX + this.viewportWidth / 2)
      / (viewport.zoomX / viewport.ticksPerPixel);
    const nextViewport: ViewportState = {
      ...viewport,
      zoomX: constrainedZoomX,
      scrollX: 0,
    };
    const maximumScroll = getMaximumHorizontalScroll(
      nextViewport,
      this.viewportWidth,
      totalTicks,
    );
    const scrollX = clamp(
      centerTick * constrainedZoomX / viewport.ticksPerPixel
        - this.viewportWidth / 2,
      0,
      maximumScroll,
    );

    return this.publishViewport({ ...nextViewport, scrollX });
  }

  private applyHorizontalScroll(requestedScrollX: number): ViewportControlState {
    const viewport = this.runtime.viewport.get();

    return this.publishViewport({
      ...viewport,
      scrollX: clamp(
        requestedScrollX,
        0,
        getMaximumHorizontalScroll(
          viewport,
          this.viewportWidth,
          this.getTotalTicks(),
        ),
      ),
    });
  }

  private applyVerticalScroll(requestedScrollY: number): ViewportControlState {
    const viewport = this.runtime.viewport.get();

    return this.publishViewport({
      ...viewport,
      scrollY: clamp(
        requestedScrollY,
        0,
        getMaximumVerticalScroll(viewport, this.viewportHeight),
      ),
    });
  }

  private applyVerticalZoom(zoomY: number): ViewportControlState {
    const viewport = this.runtime.viewport.get();
    const constrainedZoomY = clamp(
      zoomY,
      getMinimumVerticalZoom(this.viewportHeight, viewport.pitchHeight),
      VIEWPORT_CONSTANTS.maximumVerticalZoom,
    );
    const centerRow = (viewport.scrollY + this.viewportHeight / 2)
      / (viewport.pitchHeight * viewport.zoomY);
    const nextViewport: ViewportState = {
      ...viewport,
      zoomY: constrainedZoomY,
      scrollY: 0,
    };
    const maximumScroll = getMaximumVerticalScroll(
      nextViewport,
      this.viewportHeight,
    );
    const scrollY = clamp(
      centerRow * viewport.pitchHeight * constrainedZoomY
        - this.viewportHeight / 2,
      0,
      maximumScroll,
    );

    return this.publishViewport({ ...nextViewport, scrollY });
  }

  private getTotalTicks(): number {
    return getClipDurationTicks(
      getActiveClip(this.runtime.projectStore.getState()),
    );
  }

  private calculateRegion(viewport: ViewportState): Rect {
    return calculateVisibleRegion(
      viewport,
      this.viewportWidth,
      this.viewportHeight,
      this.getTotalTicks(),
    );
  }

  private describe(
    viewport: ViewportState,
    visibleRegion: Rect,
  ): ViewportControlState {
    const totalTicks = this.getTotalTicks();

    return {
      viewport,
      visibleRegion,
      minimumHorizontalZoom: getMinimumHorizontalZoom(
        this.viewportWidth,
        totalTicks,
        viewport.ticksPerPixel,
      ),
      maximumHorizontalScroll: getMaximumHorizontalScroll(
        viewport,
        this.viewportWidth,
        totalTicks,
      ),
      minimumVerticalZoom: getMinimumVerticalZoom(
        this.viewportHeight,
        viewport.pitchHeight,
      ),
      maximumVerticalScroll: getMaximumVerticalScroll(
        viewport,
        this.viewportHeight,
      ),
    };
  }
}

export function formatMusicalPosition(
  tick: number,
  ppqn: number,
  timeline: ClipTimeline,
  gridResolutionTicks: number,
): string {
  const safeTick = Math.max(0, Math.round(tick));
  const position = getMeasurePosition(
    ppqn,
    timeline.timeMap,
    timeline.durationTicks,
    safeTick,
  );
  const subdivisionIndex = Math.floor(
    position.tickInBeat / Math.max(1, gridResolutionTicks),
  );

  return `${String(position.measureIndex + 1)}.${String(position.beatIndex + 1)}.${String(subdivisionIndex + 1)}`;
}

export function formatElapsedTime(
  tick: number,
  ppqn: number,
  timeMap: TimeMap,
): string {
  const totalSeconds = tickToSeconds(
    Math.max(1, ppqn),
    timeMap,
    Math.max(0, tick),
  );
  const totalWholeSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(totalWholeSeconds / 3_600);
  const minutes = Math.floor((totalWholeSeconds % 3_600) / 60);
  const seconds = totalWholeSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function areViewportsEqual(
  first: ViewportState,
  second: ViewportState,
): boolean {
  return first.zoomX === second.zoomX
    && first.zoomY === second.zoomY
    && first.scrollX === second.scrollX
    && first.scrollY === second.scrollY
    && first.pitchHeight === second.pitchHeight
    && first.ticksPerPixel === second.ticksPerPixel
    && first.devicePixelRatio === second.devicePixelRatio;
}

function areRegionsEqual(first: Rect, second: Rect): boolean {
  return first.startTick === second.startTick
    && first.endTick === second.endTick
    && first.minPitch === second.minPitch
    && first.maxPitch === second.maxPitch;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
