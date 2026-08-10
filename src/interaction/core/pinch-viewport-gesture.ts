import type {
  ViewportState,
} from "../../geometry/converter";
import {
  getMaximumHorizontalScroll,
  getMaximumVerticalScroll,
  getMinimumHorizontalZoom,
  getMinimumVerticalZoom,
} from "../../geometry/viewport-bounds";
import type {
  PointerSample,
} from "./input";

export type PinchZoomAxis = "horizontal" | "vertical" | "both";

export interface PinchViewportGestureSettings {
  readonly minimumDistanceCssPixels: number;
  readonly axisLockRatio: number;
  readonly minimumScale: number;
  readonly maximumScale: number;
  readonly scaleDeadZone: number;
  readonly maximumZoomX: number;
  readonly maximumZoomY: number;
}

/**
 * Owns the mutable mathematical state of a two-pointer viewport gesture.
 * Browser event capture and frame scheduling remain responsibilities of the
 * UI adapter; this class only converts pointer samples into a viewport value.
 */
export class PinchViewportGesture {
  private isActive = false;
  private zoomAxis: PinchZoomAxis = "both";
  private previousDistance = 1;
  private previousSpanX = 1;
  private previousSpanY = 1;
  private previousMidpointX = 0;
  private previousMidpointY = 0;

  public constructor(
    private readonly settings: PinchViewportGestureSettings,
  ) {}

  public get active(): boolean {
    return this.isActive;
  }

  public begin(
    first: PointerSample,
    second: PointerSample,
    offsetLeft: number,
    offsetTop: number,
  ): void {
    const deltaX = second.clientX - first.clientX;
    const deltaY = second.clientY - first.clientY;

    this.isActive = true;
    this.zoomAxis = classifyPinchZoomAxis(
      Math.abs(deltaX),
      Math.abs(deltaY),
      this.settings.axisLockRatio,
    );
    this.previousDistance = Math.max(
      this.settings.minimumDistanceCssPixels,
      Math.hypot(deltaX, deltaY),
    );
    this.previousSpanX = Math.max(
      this.settings.minimumDistanceCssPixels,
      Math.abs(deltaX),
    );
    this.previousSpanY = Math.max(
      this.settings.minimumDistanceCssPixels,
      Math.abs(deltaY),
    );
    this.previousMidpointX =
      (first.clientX + second.clientX) / 2 - offsetLeft;
    this.previousMidpointY =
      (first.clientY + second.clientY) / 2 - offsetTop;
  }

  public update(
    first: PointerSample,
    second: PointerSample,
    offsetLeft: number,
    offsetTop: number,
    viewportWidth: number,
    viewportHeight: number,
    totalTicks: number,
    currentViewport: ViewportState,
  ): ViewportState | null {
    if (!this.isActive) {
      return null;
    }

    const midpointX =
      (first.clientX + second.clientX) / 2 - offsetLeft;
    const midpointY =
      (first.clientY + second.clientY) / 2 - offsetTop;
    const deltaX = second.clientX - first.clientX;
    const deltaY = second.clientY - first.clientY;
    const distance = Math.max(
      this.settings.minimumDistanceCssPixels,
      Math.hypot(deltaX, deltaY),
    );
    const spanX = Math.max(
      this.settings.minimumDistanceCssPixels,
      Math.abs(deltaX),
    );
    const spanY = Math.max(
      this.settings.minimumDistanceCssPixels,
      Math.abs(deltaY),
    );
    const uniformScale = normalizePinchScale(
      distance / this.previousDistance,
      this.settings,
    );
    const scaleX =
      this.zoomAxis === "vertical"
        ? 1
        : this.zoomAxis === "horizontal"
          ? normalizePinchScale(
              spanX / this.previousSpanX,
              this.settings,
            )
          : uniformScale;
    const scaleY =
      this.zoomAxis === "horizontal"
        ? 1
        : this.zoomAxis === "vertical"
          ? normalizePinchScale(
              spanY / this.previousSpanY,
              this.settings,
            )
          : uniformScale;
    const currentPitchHeight =
      currentViewport.pitchHeight * currentViewport.zoomY;
    const anchorTick =
      (
        currentViewport.scrollX
        + this.previousMidpointX
      )
      * currentViewport.ticksPerPixel
      / currentViewport.zoomX;
    const anchorPitchRow =
      (
        currentViewport.scrollY
        + this.previousMidpointY
      )
      / currentPitchHeight;
    const zoomX = clamp(
      currentViewport.zoomX * scaleX,
      getMinimumHorizontalZoom(
        viewportWidth,
        totalTicks,
        currentViewport.ticksPerPixel,
      ),
      this.settings.maximumZoomX,
    );
    const zoomY = clamp(
      currentViewport.zoomY * scaleY,
      getMinimumVerticalZoom(
        viewportHeight,
        currentViewport.pitchHeight,
      ),
      this.settings.maximumZoomY,
    );
    const pitchHeight = currentViewport.pitchHeight * zoomY;
    const scaledViewport = {
      ...currentViewport,
      zoomX,
      zoomY,
    };
    const maximumScrollX = getMaximumHorizontalScroll(
      scaledViewport,
      viewportWidth,
      totalTicks,
    );
    const maximumScrollY = getMaximumVerticalScroll(
      scaledViewport,
      viewportHeight,
    );
    const scrollX = clamp(
      anchorTick * zoomX / currentViewport.ticksPerPixel
        - midpointX,
      0,
      maximumScrollX,
    );
    const scrollY = clamp(
      anchorPitchRow * pitchHeight - midpointY,
      0,
      maximumScrollY,
    );

    this.previousDistance = distance;
    this.previousSpanX = spanX;
    this.previousSpanY = spanY;
    this.previousMidpointX = midpointX;
    this.previousMidpointY = midpointY;

    return {
      ...currentViewport,
      zoomX,
      zoomY,
      scrollX,
      scrollY,
    };
  }

  public reset(): void {
    this.isActive = false;
  }
}

export function classifyPinchZoomAxis(
  spanX: number,
  spanY: number,
  axisLockRatio: number,
): PinchZoomAxis {
  if (spanX >= spanY * axisLockRatio) {
    return "horizontal";
  }

  if (spanY >= spanX * axisLockRatio) {
    return "vertical";
  }

  return "both";
}

function normalizePinchScale(
  scale: number,
  settings: PinchViewportGestureSettings,
): number {
  if (
    !Number.isFinite(scale)
    || Math.abs(scale - 1) <= settings.scaleDeadZone
  ) {
    return 1;
  }

  return clamp(
    scale,
    settings.minimumScale,
    settings.maximumScale,
  );
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, value));
}
