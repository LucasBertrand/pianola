import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import type {
  ViewportState,
} from "../../editor-core/geometry/converter";
import type {
  EditorRuntime,
} from "../../application/editor-session/editor-runtime";
import {
  ViewportController,
  type ViewportControlState,
} from "../../editor-core/viewport/viewport-controller";

export interface ViewportControls {
  readonly appShellRef: RefObject<HTMLElement | null>;
  readonly stageRef: RefObject<HTMLDivElement | null>;
  readonly horizontalZoomInputRef: RefObject<HTMLInputElement | null>;
  readonly horizontalScrollInputRef: RefObject<HTMLInputElement | null>;
  readonly verticalScrollInputRef: RefObject<HTMLInputElement | null>;
  readonly verticalZoomInputRef: RefObject<HTMLInputElement | null>;
  readonly timelinePositionRef: RefObject<HTMLOutputElement | null>;
  readonly timelineTimeRef: RefObject<HTMLOutputElement | null>;
  readonly beginHorizontalViewportInteraction: () => void;
  readonly endHorizontalViewportInteraction: () => void;
  readonly publishViewport: (viewport: ViewportState) => void;
  readonly restoreViewport: (
    viewport: ViewportState,
    totalTicks: number,
  ) => void;
}

/** Binds the testable viewport controller to DOM refs and browser events. */
export function useViewportControls(
  runtime: EditorRuntime,
  followPlayback: boolean,
  seekPlayback: (tick: number) => void,
  onDimensionsInitialized?: () => void,
): ViewportControls {
  const appShellRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const horizontalZoomInputRef = useRef<HTMLInputElement | null>(null);
  const horizontalScrollInputRef = useRef<HTMLInputElement | null>(null);
  const verticalScrollInputRef = useRef<HTMLInputElement | null>(null);
  const verticalZoomInputRef = useRef<HTMLInputElement | null>(null);
  const timelinePositionRef = useRef<HTMLOutputElement | null>(null);
  const timelineTimeRef = useRef<HTMLOutputElement | null>(null);
  const controller = useMemo(
    () => new ViewportController(runtime),
    [runtime],
  );

  controller.setFollowPlayback(followPlayback);

  const synchronizeInputs = useCallback(
    (state: ViewportControlState): void => {
      if (horizontalZoomInputRef.current !== null) {
        horizontalZoomInputRef.current.min = String(
          state.minimumHorizontalZoom,
        );
        horizontalZoomInputRef.current.value = String(state.viewport.zoomX);
      }

      if (horizontalScrollInputRef.current !== null) {
        horizontalScrollInputRef.current.max = String(
          state.maximumHorizontalScroll,
        );
        horizontalScrollInputRef.current.value = String(
          state.viewport.scrollX,
        );
      }

      if (verticalZoomInputRef.current !== null) {
        verticalZoomInputRef.current.min = String(
          state.minimumVerticalZoom,
        );
        verticalZoomInputRef.current.value = String(state.viewport.zoomY);
      }

      if (verticalScrollInputRef.current !== null) {
        verticalScrollInputRef.current.max = String(
          state.maximumVerticalScroll,
        );
        verticalScrollInputRef.current.value = String(
          state.viewport.scrollY,
        );
      }
    },
    [],
  );
  const publishViewport = useCallback(
    (viewport: ViewportState): void => {
      synchronizeInputs(controller.publishViewport(viewport));
    },
    [controller, synchronizeInputs],
  );
  const beginHorizontalViewportInteraction = useCallback((): void => {
    controller.beginHorizontalInteraction();
  }, [controller]);
  const endHorizontalViewportInteraction = useCallback((): void => {
    synchronizeInputs(controller.endHorizontalInteraction());
  }, [controller, synchronizeInputs]);
  const restoreViewport = useCallback(
    (viewport: ViewportState, totalTicks: number): void => {
      synchronizeInputs(controller.restoreViewport(viewport, totalTicks));
    },
    [controller, synchronizeInputs],
  );

  const onDimensionsInitializedRef = useRef(onDimensionsInitialized);

  useEffect(() => {
    onDimensionsInitializedRef.current = onDimensionsInitialized;
  }, [onDimensionsInitialized]);

  useEffect(() => {
    const stage = stageRef.current;

    if (stage === null) {
      return undefined;
    }

    let initialized = false;
    const updateDimensions = (width: number, height: number): void => {
      synchronizeInputs(controller.updateDimensions(width, height));
      if (!initialized) {
        initialized = true;
        onDimensionsInitializedRef.current?.();
      }
    };
    const bounds = stage.getBoundingClientRect();
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry !== undefined) {
        updateDimensions(entry.contentRect.width, entry.contentRect.height);
      }
    });

    updateDimensions(bounds.width, bounds.height);
    resizeObserver.observe(stage);

    return (): void => {
      resizeObserver.disconnect();
    };
  }, [controller, synchronizeInputs]);

  useEffect(() => {
    const updateProjectStatus = (): void => {
      synchronizeInputs(controller.synchronize());

      if (appShellRef.current !== null) {
        appShellRef.current.dataset["projectRevision"] = String(
          controller.getProjectRevision(),
        );
      }

      const maximumPlayheadTick = controller.getMaximumPlayheadTick();

      if (runtime.playheadTick.get() > maximumPlayheadTick) {
        seekPlayback(maximumPlayheadTick);
      }
    };
    const unsubscribe = runtime.projectStore.subscribe(updateProjectStatus);

    updateProjectStatus();
    return unsubscribe;
  }, [controller, runtime, seekPlayback, synchronizeInputs]);

  useEffect(() => {
    const updateTimelineStatus = (): void => {
      const status = controller.getTimelineStatus();

      if (timelinePositionRef.current !== null) {
        timelinePositionRef.current.value = status.musicalPosition;
      }

      if (timelineTimeRef.current !== null) {
        timelineTimeRef.current.value = status.elapsedTime;
      }
    };
    const unsubscribePlayhead = runtime.playheadTick.subscribe(
      updateTimelineStatus,
    );
    const unsubscribeGrid = runtime.gridResolutionTicks.subscribe(
      updateTimelineStatus,
    );
    const unsubscribeProject = runtime.projectStore.subscribe(
      updateTimelineStatus,
    );

    updateTimelineStatus();

    return (): void => {
      unsubscribePlayhead();
      unsubscribeGrid();
      unsubscribeProject();
    };
  }, [controller, runtime]);

  useEffect(() => {
    if (!followPlayback) {
      return undefined;
    }

    const followPlayhead = (): void => {
      synchronizeInputs(controller.followPlayhead());
    };
    const unsubscribe = runtime.playheadTick.subscribe(followPlayhead);

    followPlayhead();
    return unsubscribe;
  }, [controller, followPlayback, runtime, synchronizeInputs]);

  useEffect(() => {
    const synchronizeViewport = (): void => {
      synchronizeInputs(controller.synchronize());
    };
    const unsubscribeViewport = runtime.viewport.subscribe(
      synchronizeViewport,
    );
    const unsubscribeGrid = runtime.gridResolutionTicks.subscribe(
      synchronizeViewport,
    );
    const unsubscribeProject = runtime.projectStore.subscribe(
      synchronizeViewport,
    );

    synchronizeViewport();

    return (): void => {
      unsubscribeViewport();
      unsubscribeGrid();
      unsubscribeProject();
    };
  }, [controller, runtime, synchronizeInputs]);

  useEffect(() => {
    const horizontalScrollInput = horizontalScrollInputRef.current;
    const horizontalZoomInput = horizontalZoomInputRef.current;
    const verticalScrollInput = verticalScrollInputRef.current;
    const verticalZoomInput = verticalZoomInputRef.current;

    if (
      horizontalScrollInput === null
      || horizontalZoomInput === null
      || verticalScrollInput === null
      || verticalZoomInput === null
    ) {
      return undefined;
    }

    let animationFrameId: number | null = null;
    const flushInputs = (): void => {
      animationFrameId = null;
      synchronizeInputs(controller.flushPendingInputs());
    };
    const scheduleFlush = (): void => {
      if (animationFrameId === null) {
        animationFrameId = window.requestAnimationFrame(flushInputs);
      }
    };
    const flushPendingInputs = (): void => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        flushInputs();
      }
    };
    const handleHorizontalScrollInput = (): void => {
      controller.queueHorizontalScroll(horizontalScrollInput.valueAsNumber);
      scheduleFlush();
    };
    const handleHorizontalZoomInput = (): void => {
      controller.queueHorizontalZoom(horizontalZoomInput.valueAsNumber);
      scheduleFlush();
    };
    const handleVerticalScrollInput = (): void => {
      controller.queueVerticalScroll(verticalScrollInput.valueAsNumber);
      scheduleFlush();
    };
    const handleVerticalZoomInput = (): void => {
      controller.queueVerticalZoom(verticalZoomInput.valueAsNumber);
      scheduleFlush();
    };
    const handleHorizontalInteractionStart = (): void => {
      beginHorizontalViewportInteraction();
    };
    const handleHorizontalInteractionEnd = (): void => {
      flushPendingInputs();
      endHorizontalViewportInteraction();
    };
    const preventLongPressAction = (event: Event): void => {
      event.preventDefault();
    };
    const rangeInputs = [
      horizontalScrollInput,
      horizontalZoomInput,
      verticalScrollInput,
      verticalZoomInput,
    ] as const;

    horizontalScrollInput.addEventListener("input", handleHorizontalScrollInput, {
      passive: true,
    });
    horizontalZoomInput.addEventListener("input", handleHorizontalZoomInput, {
      passive: true,
    });
    verticalScrollInput.addEventListener("input", handleVerticalScrollInput, {
      passive: true,
    });
    verticalZoomInput.addEventListener("input", handleVerticalZoomInput, {
      passive: true,
    });

    for (const input of [horizontalScrollInput, horizontalZoomInput]) {
      input.addEventListener("pointerdown", handleHorizontalInteractionStart);
      input.addEventListener("pointerup", handleHorizontalInteractionEnd);
      input.addEventListener("pointercancel", handleHorizontalInteractionEnd);
      input.addEventListener(
        "lostpointercapture",
        handleHorizontalInteractionEnd,
      );
    }

    for (const rangeInput of rangeInputs) {
      rangeInput.addEventListener("contextmenu", preventLongPressAction);
      rangeInput.addEventListener("dragstart", preventLongPressAction);
      rangeInput.addEventListener("selectstart", preventLongPressAction);
    }

    return (): void => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      horizontalScrollInput.removeEventListener(
        "input",
        handleHorizontalScrollInput,
      );
      horizontalZoomInput.removeEventListener(
        "input",
        handleHorizontalZoomInput,
      );
      verticalScrollInput.removeEventListener(
        "input",
        handleVerticalScrollInput,
      );
      verticalZoomInput.removeEventListener(
        "input",
        handleVerticalZoomInput,
      );

      for (const input of [horizontalScrollInput, horizontalZoomInput]) {
        input.removeEventListener(
          "pointerdown",
          handleHorizontalInteractionStart,
        );
        input.removeEventListener("pointerup", handleHorizontalInteractionEnd);
        input.removeEventListener(
          "pointercancel",
          handleHorizontalInteractionEnd,
        );
        input.removeEventListener(
          "lostpointercapture",
          handleHorizontalInteractionEnd,
        );
      }

      for (const rangeInput of rangeInputs) {
        rangeInput.removeEventListener("contextmenu", preventLongPressAction);
        rangeInput.removeEventListener("dragstart", preventLongPressAction);
        rangeInput.removeEventListener("selectstart", preventLongPressAction);
      }
    };
  }, [
    beginHorizontalViewportInteraction,
    controller,
    endHorizontalViewportInteraction,
    synchronizeInputs,
  ]);

  return {
    appShellRef,
    stageRef,
    horizontalZoomInputRef,
    horizontalScrollInputRef,
    verticalScrollInputRef,
    verticalZoomInputRef,
    timelinePositionRef,
    timelineTimeRef,
    beginHorizontalViewportInteraction,
    endHorizontalViewportInteraction,
    publishViewport,
    restoreViewport,
  };
}
