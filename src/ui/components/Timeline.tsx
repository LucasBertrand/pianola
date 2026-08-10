import React, {
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  INTERACTION_CONSTANTS,
} from "../../config/program-constants";
import {
  APPLICATION_COLORS,
} from "../../config/application-colors";
import {
  getActiveClip,
  getActiveClipDurationTicks,
  type LoopRegion,
} from "../../domain/model";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  ViewportState,
} from "../../geometry/converter";
import {
  useCanvasRenderer,
  type CanvasFrame,
} from "../hooks/useCanvasRenderer";
import type {
  ReadonlyRenderSignal,
} from "../rendering/render-signal";
import {
  APPLICATION_SURFACE_COLOR,
} from "../rendering/theme";

export interface BarRulerProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly projectStore: ProjectStorePort;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly onSeekStart: () => void;
  readonly onSeekPreview: (tick: number) => void;
  readonly onSeekCommit: (tick: number) => void;
}

type LoopGestureMode =
  | "move"
  | "pending-layer"
  | "draw"
  | "set-start"
  | "set-end"
  | "resize-start"
  | "resize-end";

export interface TimelineLoopRegionProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly projectStore: ProjectStorePort;
  readonly gridResolutionTicks: ReadonlyRenderSignal<number>;
  readonly onCommit: (loop: LoopRegion) => void;
}

export function TimelineLoopRegion(
  props: TimelineLoopRegionProps,
): React.JSX.Element {
  const {
    viewport,
    projectStore,
    gridResolutionTicks,
    onCommit,
  } = props;
  const layerRef = useRef<HTMLDivElement | null>(null);
  const bandRef = useRef<HTMLButtonElement | null>(null);
  const startFlagRef = useRef<HTMLButtonElement | null>(null);
  const endFlagRef = useRef<HTMLButtonElement | null>(null);
  const boundaryLayerRef = useRef<HTMLDivElement | null>(null);
  const startBoundaryRef = useRef<HTMLElement | null>(null);
  const endBoundaryRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const band = bandRef.current;
    const startFlag = startFlagRef.current;
    const endFlag = endFlagRef.current;
    const boundaryLayer = boundaryLayerRef.current;
    const startBoundary = startBoundaryRef.current;
    const endBoundary = endBoundaryRef.current;

    if (
      layer === null
      || band === null
      || startFlag === null
      || endFlag === null
      || boundaryLayer === null
      || startBoundary === null
      || endBoundary === null
    ) {
      return undefined;
    }

    let activePointerId = -1;
    let gestureMode: LoopGestureMode | null = null;
    let originClientX = 0;
    let originStartTick = 0;
    let originEndTick = 0;
    let draftStartTick = 0;
    let draftEndTick = 0;
    let snapResolutionTicks = 1;
    let projectDurationTicks = 1;
    let layerLeft = 0;
    let drawAnchorTick = 0;
    let pendingClickMode: "set-start" | "set-end" =
      "set-start";

    const updateElements = (
      startTick: number,
      endTick: number,
      enabled: boolean,
    ): void => {
      const currentViewport = viewport.get();
      const pixelsPerTick =
        currentViewport.zoomX / currentViewport.ticksPerPixel;
      const startX =
        startTick * pixelsPerTick - currentViewport.scrollX;
      const endX =
        endTick * pixelsPerTick - currentViewport.scrollX;

      band.style.transform =
        `translate3d(${startX}px, 0, 0)`;
      band.style.width = `${Math.max(1, endX - startX)}px`;
      startFlag.style.transform =
        `translate3d(${startX - 11}px, 0, 0)`;
      endFlag.style.transform =
        `translate3d(${endX - 11}px, 0, 0)`;
      startBoundary.style.transform =
        `translate3d(${startX}px, 0, 0)`;
      endBoundary.style.transform =
        `translate3d(${endX}px, 0, 0)`;
      startBoundary.style.display = "block";
      endBoundary.style.display = "block";
      layer.dataset["enabled"] = String(enabled);
      boundaryLayer.dataset["enabled"] = String(enabled);
    };
    const updateFromState = (): void => {
      if (activePointerId !== -1) {
        return;
      }

      const transport = getActiveClip(
        projectStore.getState(),
      ).transportSettings;

      updateElements(
        transport.loop.startTick,
        transport.loop.endTick,
        transport.loopEnabled,
      );
    };
    const updateDraft = (clientX: number): void => {
      if (gestureMode === null) {
        return;
      }

      const currentViewport = viewport.get();
      const rawDeltaTicks =
        (clientX - originClientX)
        * currentViewport.ticksPerPixel
        / currentViewport.zoomX;
      const minimumDurationTicks = Math.min(
        snapResolutionTicks,
        Math.max(1, originEndTick - originStartTick),
      );
      const pointerHasMoved = clientX !== originClientX;

      if (gestureMode === "pending-layer") {
        return;
      }

      if (gestureMode === "draw") {
        const absolutePointerTick =
          (
            currentViewport.scrollX
            + clientX
            - layerLeft
          )
          * currentViewport.ticksPerPixel
          / currentViewport.zoomX;
        const snappedPointerTick =
          Math.round(
            absolutePointerTick / snapResolutionTicks,
          ) * snapResolutionTicks;
        const boundedPointerTick = Math.min(
          projectDurationTicks,
          Math.max(0, snappedPointerTick),
        );
        const drawMinimumDurationTicks = Math.min(
          snapResolutionTicks,
          projectDurationTicks,
        );

        if (boundedPointerTick < drawAnchorTick) {
          draftStartTick = boundedPointerTick;
          draftEndTick = Math.max(
            drawAnchorTick,
            boundedPointerTick + drawMinimumDurationTicks,
          );
        } else {
          draftStartTick = drawAnchorTick;
          draftEndTick = Math.min(
            projectDurationTicks,
            Math.max(
              drawAnchorTick + drawMinimumDurationTicks,
              boundedPointerTick,
            ),
          );
        }
      } else if (gestureMode === "set-start") {
        const absolutePointerTick =
          (
            currentViewport.scrollX
            + clientX
            - layerLeft
          )
          * currentViewport.ticksPerPixel
          / currentViewport.zoomX;
        const snappedStartTick =
          Math.round(
            absolutePointerTick / snapResolutionTicks,
          ) * snapResolutionTicks;
        const maximumStartTick = Math.max(
          0,
          originEndTick - minimumDurationTicks,
        );

        draftStartTick = Math.min(
          maximumStartTick,
          Math.max(0, snappedStartTick),
        );
        draftEndTick = originEndTick;
      } else if (gestureMode === "set-end") {
        const absolutePointerTick =
          (
            currentViewport.scrollX
            + clientX
            - layerLeft
          )
          * currentViewport.ticksPerPixel
          / currentViewport.zoomX;
        const snappedEndTick =
          Math.round(
            absolutePointerTick / snapResolutionTicks,
          ) * snapResolutionTicks;

        draftStartTick = originStartTick;
        draftEndTick = Math.max(
          originStartTick + minimumDurationTicks,
          Math.min(projectDurationTicks, snappedEndTick),
        );
      } else if (gestureMode === "resize-start") {
        const snappedStartTick = pointerHasMoved
          ? Math.round(
              (originStartTick + rawDeltaTicks)
              / snapResolutionTicks,
            ) * snapResolutionTicks
          : originStartTick;

        draftStartTick = Math.min(
          originEndTick - minimumDurationTicks,
          Math.max(0, snappedStartTick),
        );
        draftEndTick = originEndTick;
      } else if (gestureMode === "resize-end") {
        const snappedEndTick = pointerHasMoved
          ? Math.round(
              (originEndTick + rawDeltaTicks)
              / snapResolutionTicks,
            ) * snapResolutionTicks
          : originEndTick;

        draftStartTick = originStartTick;
        draftEndTick = Math.max(
          originStartTick + minimumDurationTicks,
          Math.min(
            projectDurationTicks,
            snappedEndTick,
          ),
        );
      } else {
        const durationTicks =
          originEndTick - originStartTick;
        const snappedStartTick = pointerHasMoved
          ? Math.round(
              (originStartTick + rawDeltaTicks)
              / snapResolutionTicks,
            ) * snapResolutionTicks
          : originStartTick;
        const movedStartTick = Math.min(
          projectDurationTicks - durationTicks,
          Math.max(0, snappedStartTick),
        );

        draftStartTick = movedStartTick;
        draftEndTick = movedStartTick + durationTicks;
      }

      updateElements(
        draftStartTick,
        draftEndTick,
        getActiveClip(
          projectStore.getState(),
        ).transportSettings.loopEnabled,
      );
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (
        event.button !== 0
        || activePointerId !== -1
      ) {
        return;
      }

      const gestureTarget =
        (event.target as Element).closest<HTMLElement>(
          "[data-loop-mode]",
        );
      const requestedMode =
        gestureTarget?.dataset["loopMode"];
      const state = projectStore.getState();
      const loop = getActiveClip(state).transportSettings.loop;
      const layerBounds = layer.getBoundingClientRect();
      const currentViewport = viewport.get();
      const absolutePointerTick =
        (
          currentViewport.scrollX
          + event.clientX
          - layerBounds.left
        )
        * currentViewport.ticksPerPixel
        / currentViewport.zoomX;
      const resolvedMode =
        requestedMode === undefined
        && event.target === layer
          ? "pending-layer"
          : requestedMode;

      if (
        resolvedMode !== "move"
        && resolvedMode !== "pending-layer"
        && resolvedMode !== "draw"
        && resolvedMode !== "set-start"
        && resolvedMode !== "set-end"
        && resolvedMode !== "resize-start"
        && resolvedMode !== "resize-end"
      ) {
        return;
      }

      activePointerId = event.pointerId;
      gestureMode = resolvedMode;
      originClientX = event.clientX;
      originStartTick = loop.startTick;
      originEndTick = loop.endTick;
      draftStartTick = loop.startTick;
      draftEndTick = loop.endTick;
      snapResolutionTicks = Math.max(
        1,
        gridResolutionTicks.get(),
      );
      projectDurationTicks = getActiveClipDurationTicks(state);
      layerLeft = layerBounds.left;
      pendingClickMode =
        absolutePointerTick
          <= (loop.startTick + loop.endTick) / 2
          ? "set-start"
          : "set-end";
      const drawMinimumDurationTicks = Math.min(
        snapResolutionTicks,
        projectDurationTicks,
      );
      drawAnchorTick = Math.min(
        Math.max(
          0,
          projectDurationTicks - drawMinimumDurationTicks,
        ),
        Math.max(
          0,
          Math.round(
            absolutePointerTick / snapResolutionTicks,
          ) * snapResolutionTicks,
        ),
      );
      layer.setPointerCapture(event.pointerId);

      if (
        resolvedMode === "set-start"
        || resolvedMode === "set-end"
      ) {
        updateDraft(event.clientX);
      }

      event.preventDefault();
    };
    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      if (
        gestureMode === "pending-layer"
        && Math.abs(event.clientX - originClientX)
          > INTERACTION_CONSTANTS.tapMovementToleranceCssPixels
      ) {
        gestureMode = "draw";
      }

      updateDraft(event.clientX);
      event.preventDefault();
    };
    const finishPointer = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      if (gestureMode === "pending-layer") {
        gestureMode = pendingClickMode;
      }

      updateDraft(event.clientX);
      const nextStartTick = draftStartTick;
      const nextEndTick = draftEndTick;
      const changed =
        nextStartTick !== originStartTick
        || nextEndTick !== originEndTick;

      activePointerId = -1;
      gestureMode = null;

      if (layer.hasPointerCapture(event.pointerId)) {
        layer.releasePointerCapture(event.pointerId);
      }

      if (changed) {
        onCommit({
          startTick: nextStartTick,
          endTick: nextEndTick,
        });
      } else {
        updateFromState();
      }

      event.preventDefault();
    };
    const cancelPointer = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      activePointerId = -1;
      gestureMode = null;
      updateFromState();
    };
    const unsubscribeViewport =
      viewport.subscribe(updateFromState);
    const unsubscribeProject =
      projectStore.subscribe(updateFromState);

    layer.addEventListener("pointerdown", handlePointerDown);
    layer.addEventListener("pointermove", handlePointerMove);
    layer.addEventListener("pointerup", finishPointer);
    layer.addEventListener("pointercancel", cancelPointer);
    layer.addEventListener(
      "lostpointercapture",
      cancelPointer,
    );
    updateFromState();

    return (): void => {
      unsubscribeViewport();
      unsubscribeProject();
      layer.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
      layer.removeEventListener(
        "pointermove",
        handlePointerMove,
      );
      layer.removeEventListener("pointerup", finishPointer);
      layer.removeEventListener(
        "pointercancel",
        cancelPointer,
      );
      layer.removeEventListener(
        "lostpointercapture",
        cancelPointer,
      );
    };
  }, [
    gridResolutionTicks,
    onCommit,
    projectStore,
    viewport,
  ]);

  return (
    <>
      <div
        ref={layerRef}
        className="timeline-loop-layer"
        aria-label="Loop region"
      >
        <button
          ref={bandRef}
          className="timeline-loop-band"
          type="button"
          data-loop-mode="move"
          title="Move loop region"
          aria-label="Move loop region"
        />
        <button
          ref={startFlagRef}
          className="timeline-loop-flag is-start"
          type="button"
          data-loop-mode="resize-start"
          title="Adjust loop start"
          aria-label="Adjust loop start"
        >
          <svg viewBox="0 0 22 20" aria-hidden="true">
            <path d="M11 2v16M11 3h8l-3.5 4L19 11h-8" />
          </svg>
        </button>
        <button
          ref={endFlagRef}
          className="timeline-loop-flag is-end"
          type="button"
          data-loop-mode="resize-end"
          title="Adjust loop end"
          aria-label="Adjust loop end"
        >
          <svg viewBox="0 0 22 20" aria-hidden="true">
            <path d="M11 2v16M11 3H3l3.5 4L3 11h8" />
          </svg>
        </button>
      </div>
      <div
        ref={boundaryLayerRef}
        className="timeline-loop-boundaries"
        data-enabled="false"
        aria-hidden="true"
      >
        <i ref={startBoundaryRef} />
        <i ref={endBoundaryRef} />
      </div>
    </>
  );
}

export function BarRuler(
  props: BarRulerProps,
): React.JSX.Element {
  const {
    viewport,
    projectStore,
    gridResolutionTicks,
    onSeekStart,
    onSeekPreview,
    onSeekCommit,
  } = props;
  const paintRuler = useCallback(
    (frame: CanvasFrame): void => {
      const currentViewport = viewport.get();
      const projectState = projectStore.getState();
      const activeClip = getActiveClip(projectState);
      const transport = activeClip.transportSettings;
      const totalTicks = getActiveClipDurationTicks(projectState);
      const pixelsPerTick =
        currentViewport.zoomX / currentViewport.ticksPerPixel;
      const firstVisibleTick =
        currentViewport.scrollX / pixelsPerTick;
      const lastVisibleTick =
        Math.min(
          totalTicks,
          firstVisibleTick
          + frame.widthCssPixels / pixelsPerTick,
        );
      const ticksPerBeat =
        transport.ppqn
        * 4
        / transport.timeSignature.denominator;
      const ticksPerBar =
        ticksPerBeat * transport.timeSignature.numerator;
      const effectiveGridTicks = getVisibleGridResolution(
        gridResolutionTicks.get(),
        pixelsPerTick,
      );
      const context = frame.context;

      context.fillStyle = APPLICATION_SURFACE_COLOR;
      context.fillRect(
        0,
        0,
        frame.widthCssPixels,
        frame.heightCssPixels,
      );
      drawRulerTicks(
        context,
        firstVisibleTick,
        lastVisibleTick,
        effectiveGridTicks,
        pixelsPerTick,
        currentViewport.scrollX,
        frame.heightCssPixels,
        5,
        frame.devicePixelRatio,
        APPLICATION_COLORS.pianoRoll.rulerSubdivision,
      );
      drawRulerTicks(
        context,
        firstVisibleTick,
        lastVisibleTick,
        ticksPerBeat,
        pixelsPerTick,
        currentViewport.scrollX,
        frame.heightCssPixels,
        10,
        frame.devicePixelRatio,
        APPLICATION_COLORS.pianoRoll.rulerBeat,
      );
      drawRulerTicks(
        context,
        firstVisibleTick,
        lastVisibleTick,
        ticksPerBar,
        pixelsPerTick,
        currentViewport.scrollX,
        frame.heightCssPixels,
        frame.heightCssPixels,
        frame.devicePixelRatio,
        APPLICATION_COLORS.pianoRoll.rulerBar,
      );

      context.fillStyle = APPLICATION_COLORS.pianoRoll.rulerText;
      context.font =
        '9px "SFMono-Regular", Consolas, monospace';
      context.textBaseline = "top";

      const firstBarIndex = Math.max(
        0,
        Math.floor(firstVisibleTick / ticksPerBar),
      );
      const lastBarIndex = Math.ceil(
        lastVisibleTick / ticksPerBar,
      );
      const maximumBarIndex = activeClip.measureCount - 1;

      for (
        let barIndex = firstBarIndex;
        barIndex <= Math.min(lastBarIndex, maximumBarIndex);
        barIndex += 1
      ) {
        const x =
          barIndex * ticksPerBar * pixelsPerTick
          - currentViewport.scrollX;

        context.fillText(String(barIndex + 1), x + 7, 7);
      }

    },
    [
      gridResolutionTicks,
      projectStore,
      viewport,
    ],
  );
  const renderer = useCanvasRenderer({
    render: paintRuler,
    mode: "on-demand",
    clearBeforeRender: true,
  });

  useEffect(() => {
    const unsubscribeViewport = viewport.subscribe(
      renderer.invalidate,
    );
    const unsubscribeGrid = gridResolutionTicks.subscribe(
      renderer.invalidate,
    );
    const unsubscribeProject = projectStore.subscribe(
      renderer.invalidate,
    );

    renderer.invalidate();

    return (): void => {
      unsubscribeViewport();
      unsubscribeGrid();
      unsubscribeProject();
    };
  }, [
    gridResolutionTicks,
    projectStore,
    renderer.invalidate,
    viewport,
  ]);

  useEffect(() => {
    const canvas = renderer.canvasRef.current;

    if (canvas === null) {
      return undefined;
    }

    let activePointerId = -1;
    let draftTick = 0;

    const updatePlayhead = (clientX: number): number => {
      const bounds = canvas.getBoundingClientRect();
      const currentViewport = viewport.get();
      const localX = clientX - bounds.left;
      const rawTick =
        (currentViewport.scrollX + localX)
        * currentViewport.ticksPerPixel
        / currentViewport.zoomX;
      const resolutionTicks = gridResolutionTicks.get();
      const snappedTick =
        Math.round(rawTick / resolutionTicks) * resolutionTicks;

      draftTick = Math.min(
        getActiveClipDurationTicks(projectStore.getState()),
        Math.max(0, snappedTick),
      );
      onSeekPreview(draftTick);
      return draftTick;
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }

      activePointerId = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      onSeekStart();
      updatePlayhead(event.clientX);
      event.preventDefault();
    };
    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      updatePlayhead(event.clientX);
      event.preventDefault();
    };
    const finishPointer = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      const committedTick = updatePlayhead(event.clientX);
      activePointerId = -1;

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }

      onSeekCommit(committedTick);
      event.preventDefault();
    };
    const cancelPointer = (event: PointerEvent): void => {
      if (event.pointerId === activePointerId) {
        activePointerId = -1;
        onSeekCommit(draftTick);
      }
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", finishPointer);
    canvas.addEventListener("pointercancel", cancelPointer);
    canvas.addEventListener(
      "lostpointercapture",
      cancelPointer,
    );

    return (): void => {
      canvas.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
      canvas.removeEventListener(
        "pointermove",
        handlePointerMove,
      );
      canvas.removeEventListener("pointerup", finishPointer);
      canvas.removeEventListener(
        "pointercancel",
        cancelPointer,
      );
      canvas.removeEventListener(
        "lostpointercapture",
        cancelPointer,
      );
    };
  }, [
    gridResolutionTicks,
    onSeekCommit,
    onSeekPreview,
    onSeekStart,
    projectStore,
    renderer.canvasRef,
    viewport,
  ]);

  return (
    <canvas
      ref={renderer.canvasRef}
      className="bar-ruler"
      aria-label="Timeline ruler. Drag to set the playhead."
    />
  );
}

export interface RollPlayheadProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly playheadTick: ReadonlyRenderSignal<number>;
}

export function RollPlayhead(
  props: RollPlayheadProps,
): React.JSX.Element {
  const {
    viewport,
    playheadTick,
  } = props;
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updatePosition = (): void => {
      const element = elementRef.current;

      if (element === null) {
        return;
      }

      const currentViewport = viewport.get();
      const x =
        playheadTick.get()
        * currentViewport.zoomX
        / currentViewport.ticksPerPixel
        - currentViewport.scrollX;

      element.style.transform = `translate3d(${x}px, 0, 0)`;
    };
    const unsubscribeViewport = viewport.subscribe(updatePosition);
    const unsubscribePlayhead = playheadTick.subscribe(updatePosition);

    updatePosition();

    return (): void => {
      unsubscribeViewport();
      unsubscribePlayhead();
    };
  }, [
    playheadTick,
    viewport,
  ]);

  return (
    <div
      ref={elementRef}
      className="roll-playhead"
      aria-hidden="true"
    />
  );
}

function getVisibleGridResolution(
  requestedTicks: number,
  pixelsPerTick: number,
): number {
  let resolutionTicks = requestedTicks;

  while (
    resolutionTicks * pixelsPerTick < 4
    && Number.isSafeInteger(resolutionTicks * 2)
  ) {
    resolutionTicks *= 2;
  }

  return resolutionTicks;
}

function drawRulerTicks(
  context: CanvasRenderingContext2D,
  firstVisibleTick: number,
  lastVisibleTick: number,
  intervalTicks: number,
  pixelsPerTick: number,
  scrollX: number,
  rulerHeight: number,
  markerHeight: number,
  devicePixelRatio: number,
  color: string,
): void {
  if (!Number.isFinite(intervalTicks) || intervalTicks <= 0) {
    return;
  }

  const firstTick =
    Math.floor(firstVisibleTick / intervalTicks) * intervalTicks;
  const lineWidth = 1 / devicePixelRatio;

  context.fillStyle = color;

  for (
    let tick = firstTick;
    tick <= lastVisibleTick;
    tick += intervalTicks
  ) {
    const rawX = tick * pixelsPerTick - scrollX;
    const x =
      Math.round(rawX * devicePixelRatio) / devicePixelRatio;

    context.fillRect(
      x,
      rulerHeight - markerHeight,
      lineWidth,
      markerHeight,
    );
  }
}
