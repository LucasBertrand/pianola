import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import {
  VIEWPORT_CONSTANTS,
} from "../../../config/editor-config";

export type CanvasRenderMode = "continuous" | "on-demand";

export interface CanvasFrame {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly widthCssPixels: number;
  readonly heightCssPixels: number;
  readonly devicePixelRatio: number;
  readonly timestampMs: number;
  readonly deltaMs: number;
}

export interface UseCanvasRendererOptions {
  readonly render: (frame: CanvasFrame) => void;
  readonly mode?: CanvasRenderMode;
  readonly clearBeforeRender?: boolean;
  readonly contextAttributes?: CanvasRenderingContext2DSettings;
}

export interface CanvasRendererController {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly invalidate: () => void;
}

interface MutableCanvasFrame {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  widthCssPixels: number;
  heightCssPixels: number;
  devicePixelRatio: number;
  timestampMs: number;
  deltaMs: number;
}

let cachedMaximumDevicePixelRatio: number | null = null;

export function useCanvasRenderer(
  options: UseCanvasRendererOptions,
): CanvasRendererController {
  const {
    render,
    mode = "on-demand",
    clearBeforeRender = true,
    contextAttributes,
  } = options;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderRef = useRef(render);
  const dirtyRef = useRef(true);
  const scheduleFrameRef = useRef<(() => void) | null>(null);

  renderRef.current = render;

  const invalidate = useCallback((): void => {
    dirtyRef.current = true;
    scheduleFrameRef.current?.();
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return undefined;
    }

    const context = canvas.getContext("2d", contextAttributes);

    if (context === null) {
      throw new Error("A 2D rendering context is required.");
    }

    const frame: MutableCanvasFrame = {
      canvas,
      context,
      widthCssPixels: 0,
      heightCssPixels: 0,
      devicePixelRatio: 1,
      timestampMs: 0,
      deltaMs: 0,
    };
    let widthCssPixels = 0;
    let heightCssPixels = 0;
    let previousTimestampMs = 0;
    let animationFrameId: number | null = null;
    let disposed = false;

    const scheduleFrame = (): void => {
      if (disposed || animationFrameId !== null) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(renderFrame);
    };

    const updateMeasuredSize = (width: number, height: number): void => {
      if (
        width === widthCssPixels
        && height === heightCssPixels
      ) {
        return;
      }

      widthCssPixels = width;
      heightCssPixels = height;
      dirtyRef.current = true;
      scheduleFrame();
    };

    const renderFrame = (timestampMs: number): void => {
      animationFrameId = null;

      if (disposed) {
        return;
      }

      const devicePixelRatio = getDevicePixelRatio();
      const backingWidth = Math.max(
        1,
        Math.round(widthCssPixels * devicePixelRatio),
      );
      const backingHeight = Math.max(
        1,
        Math.round(heightCssPixels * devicePixelRatio),
      );
      const backingStoreChanged =
        canvas.width !== backingWidth
        || canvas.height !== backingHeight;

      if (backingStoreChanged) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
        dirtyRef.current = true;
      }

      const shouldRender = mode === "continuous" || dirtyRef.current;

      if (shouldRender) {
        dirtyRef.current = false;
        context.setTransform(1, 0, 0, 1, 0, 0);

        if (clearBeforeRender) {
          context.clearRect(0, 0, canvas.width, canvas.height);
        }

        context.save();
        context.setTransform(
          devicePixelRatio,
          0,
          0,
          devicePixelRatio,
          0,
          0,
        );

        frame.widthCssPixels = widthCssPixels;
        frame.heightCssPixels = heightCssPixels;
        frame.devicePixelRatio = devicePixelRatio;
        frame.timestampMs = timestampMs;
        frame.deltaMs = previousTimestampMs === 0
          ? 0
          : timestampMs - previousTimestampMs;

        try {
          renderRef.current(frame);
        } finally {
          context.restore();
        }

        previousTimestampMs = timestampMs;
      }

      if (mode === "continuous") {
        scheduleFrame();
      }
    };

    scheduleFrameRef.current = scheduleFrame;

    const initialBounds = canvas.getBoundingClientRect();
    updateMeasuredSize(initialBounds.width, initialBounds.height);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry !== undefined) {
        updateMeasuredSize(
          entry.contentRect.width,
          entry.contentRect.height,
        );
      }
    });
    const handleWindowResize = (): void => {
      dirtyRef.current = true;
      scheduleFrame();
    };
    let devicePixelRatioQuery: MediaQueryList | null = null;

    const observeDevicePixelRatio = (): void => {
      if (devicePixelRatioQuery !== null) {
        devicePixelRatioQuery.removeEventListener(
          "change",
          handleDevicePixelRatioChange,
        );
      }

      devicePixelRatioQuery = window.matchMedia(
        `(resolution: ${getDevicePixelRatio()}dppx)`,
      );
      devicePixelRatioQuery.addEventListener(
        "change",
        handleDevicePixelRatioChange,
        {
          once: true,
        },
      );
    };

    const handleDevicePixelRatioChange = (): void => {
      observeDevicePixelRatio();
      dirtyRef.current = true;
      scheduleFrame();
    };

    resizeObserver.observe(canvas);
    window.addEventListener("resize", handleWindowResize, {
      passive: true,
    });
    observeDevicePixelRatio();
    scheduleFrame();

    return (): void => {
      disposed = true;
      scheduleFrameRef.current = null;
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      devicePixelRatioQuery?.removeEventListener(
        "change",
        handleDevicePixelRatioChange,
      );

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [
    clearBeforeRender,
    contextAttributes,
    mode,
  ]);

  return useMemo(
    () => ({
      canvasRef,
      invalidate,
    }),
    [invalidate],
  );
}

function getDevicePixelRatio(): number {
  const ratio = window.devicePixelRatio;

  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 1;
  }

  return Math.min(ratio, getMaximumDevicePixelRatio());
}

function getMaximumDevicePixelRatio(): number {
  if (cachedMaximumDevicePixelRatio === null) {
    cachedMaximumDevicePixelRatio = window.matchMedia(
      "(pointer: coarse)",
    ).matches
        ? VIEWPORT_CONSTANTS.maximumCoarsePointerDevicePixelRatio
        : VIEWPORT_CONSTANTS.maximumCanvasDevicePixelRatio;
  }

  return cachedMaximumDevicePixelRatio;
}
