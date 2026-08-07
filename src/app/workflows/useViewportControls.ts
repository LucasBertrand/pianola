import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import {
  EDITOR_CONSTANTS,
  VIEWPORT_CONSTANTS,
} from "../../config/program-constants";
import {
  getProjectDurationTicks,
  type TransportState,
} from "../../domain/model";
import type {
  ViewportState,
} from "../../geometry/converter";
import {
  calculateVisibleRegion,
} from "../../geometry/visible-region";
import type {
  EditorRuntime,
} from "../editor-runtime";

interface MutableViewportDimensions {
  width: number;
  height: number;
}

export interface ViewportControls {
  readonly appShellRef: RefObject<HTMLElement | null>;
  readonly stageRef: RefObject<HTMLDivElement | null>;
  readonly horizontalZoomInputRef:
    RefObject<HTMLInputElement | null>;
  readonly horizontalScrollInputRef:
    RefObject<HTMLInputElement | null>;
  readonly verticalScrollInputRef:
    RefObject<HTMLInputElement | null>;
  readonly verticalZoomInputRef:
    RefObject<HTMLInputElement | null>;
  readonly horizontalZoomLabelRef:
    RefObject<HTMLOutputElement | null>;
  readonly verticalZoomLabelRef:
    RefObject<HTMLOutputElement | null>;
  readonly timelinePositionRef:
    RefObject<HTMLOutputElement | null>;
  readonly timelineTimeRef:
    RefObject<HTMLOutputElement | null>;
  readonly publishViewport: (viewport: ViewportState) => void;
  readonly restoreViewport: (
    viewport: ViewportState,
    totalTicks: number,
  ) => void;
}

const VIEW_INPUT_HORIZONTAL_SCROLL = 1;
const VIEW_INPUT_HORIZONTAL_ZOOM = 2;
const VIEW_INPUT_VERTICAL_SCROLL = 4;
const VIEW_INPUT_VERTICAL_ZOOM = 8;
const RULER_HEIGHT_CSS_PIXELS =
  EDITOR_CONSTANTS.rulerHeightCssPixels;
const LOOP_REGION_HEIGHT_CSS_PIXELS =
  EDITOR_CONSTANTS.loopRegionHeightCssPixels;
const TIMELINE_HEADER_HEIGHT_CSS_PIXELS =
  RULER_HEIGHT_CSS_PIXELS + LOOP_REGION_HEIGHT_CSS_PIXELS;

export function useViewportControls(
  runtime: EditorRuntime,
  inspectorOpen: boolean,
  seekPlayback: (tick: number) => void,
): ViewportControls {
  const sceneRef = useRef(runtime);
  const appShellRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const zoomInputRef = useRef<HTMLInputElement | null>(null);
  const scrollInputRef = useRef<HTMLInputElement | null>(null);
  const pitchScrollInputRef = useRef<HTMLInputElement | null>(null);
  const pitchZoomInputRef = useRef<HTMLInputElement | null>(null);
  const zoomLabelRef = useRef<HTMLOutputElement | null>(null);
  const pitchZoomLabelRef = useRef<HTMLOutputElement | null>(null);
  const barLabelRef = useRef<HTMLOutputElement | null>(null);
  const timeLabelRef = useRef<HTMLOutputElement | null>(null);
  const dimensionsRef = useRef<MutableViewportDimensions>({
    width: VIEWPORT_CONSTANTS.initialWidthCssPixels,
    height: VIEWPORT_CONSTANTS.initialHeightCssPixels,
  });
  const scene = runtime;

  sceneRef.current = runtime;

  const publishViewport = useCallback(
    (viewport: ViewportState): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      currentScene.viewport.set(viewport);
      currentScene.visibleRegion.set(
        calculateVisibleRegion(
          viewport,
          dimensionsRef.current.width,
          dimensionsRef.current.height,
          getProjectDurationTicks(
            currentScene.projectStore.getState(),
          ),
        ),
      );
    },
    [],
  );

  useEffect(() => {
    const stage = stageRef.current;

    if (stage === null) {
      return undefined;
    }

    const updateDimensions = (
      width: number,
      stageHeight: number,
    ): void => {
      const height = Math.max(
        1,
        stageHeight - TIMELINE_HEADER_HEIGHT_CSS_PIXELS,
      );

      dimensionsRef.current.width = width;
      dimensionsRef.current.height = height;

      const currentScene = sceneRef.current;

      if (currentScene !== null) {
        const viewport = currentScene.viewport.get();
        const totalTicks = getProjectDurationTicks(
          currentScene.projectStore.getState(),
        );
        const maximumVerticalScroll = getMaximumVerticalScroll(
          viewport,
          height,
        );
        const scrollY = Math.min(
          maximumVerticalScroll,
          viewport.scrollY,
        );
        const maximumHorizontalScroll =
          getMaximumHorizontalScroll(viewport, width, totalTicks);
        const scrollX = Math.min(
          maximumHorizontalScroll,
          viewport.scrollX,
        );
        const nextViewport: ViewportState = {
          ...viewport,
          scrollX,
          scrollY,
        };

        if (pitchScrollInputRef.current !== null) {
          pitchScrollInputRef.current.max = String(
            maximumVerticalScroll,
          );
          pitchScrollInputRef.current.value = String(scrollY);
        }

        if (scrollInputRef.current !== null) {
          scrollInputRef.current.max = String(
            maximumHorizontalScroll,
          );
          scrollInputRef.current.value = String(scrollX);
          scrollInputRef.current.step = String(
            getHorizontalScrollStep(
              viewport,
              currentScene.gridResolutionTicks.get(),
            ),
          );
        }

        if (
          scrollX !== viewport.scrollX
          || scrollY !== viewport.scrollY
        ) {
          publishViewport(nextViewport);
        } else {
          currentScene.visibleRegion.set(
            calculateVisibleRegion(
              nextViewport,
              width,
              height,
              totalTicks,
            ),
          );
        }
      }
    };
    const bounds = stage.getBoundingClientRect();
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry !== undefined) {
        updateDimensions(
          entry.contentRect.width,
          entry.contentRect.height,
        );
      }
    });

    updateDimensions(bounds.width, bounds.height);
    resizeObserver.observe(stage);

    return (): void => {
      resizeObserver.disconnect();
    };
  }, [
    inspectorOpen,
    publishViewport,
  ]);

  useEffect(() => {
    const updateProjectStatus = (): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      const state = currentScene.projectStore.getState();
      const totalTicks = getProjectDurationTicks(state);
      const viewport = currentScene.viewport.get();
      const maximumHorizontalScroll =
        getMaximumHorizontalScroll(
          viewport,
          dimensionsRef.current.width,
          totalTicks,
        );
      const scrollX = Math.min(
        maximumHorizontalScroll,
        viewport.scrollX,
      );

      if (appShellRef.current !== null) {
        appShellRef.current.dataset["projectRevision"] =
          String(state.revision);
      }

      if (scrollInputRef.current !== null) {
        scrollInputRef.current.max = String(
          maximumHorizontalScroll,
        );
        scrollInputRef.current.value = String(scrollX);
      }

      const currentPlayheadTick = currentScene.playheadTick.get();

      if (currentPlayheadTick > totalTicks) {
        seekPlayback(totalTicks);
      }

      if (scrollX !== viewport.scrollX) {
        publishViewport({
          ...viewport,
          scrollX,
        });
      } else {
        const visibleRegion = currentScene.visibleRegion.get();
        const nextVisibleRegion = calculateVisibleRegion(
          viewport,
          dimensionsRef.current.width,
          dimensionsRef.current.height,
          totalTicks,
        );

        if (
          nextVisibleRegion.startTick !== visibleRegion.startTick
          || nextVisibleRegion.endTick !== visibleRegion.endTick
          || nextVisibleRegion.minPitch !== visibleRegion.minPitch
          || nextVisibleRegion.maxPitch !== visibleRegion.maxPitch
        ) {
          currentScene.visibleRegion.set(nextVisibleRegion);
        }
      }
    };
    const unsubscribe = scene.projectStore.subscribe(
      updateProjectStatus,
    );

    updateProjectStatus();
    return unsubscribe;
  }, [
    publishViewport,
    scene,
    seekPlayback,
  ]);

  useEffect(() => {
    const updatePlayheadPosition = (): void => {
      if (barLabelRef.current === null) {
        return;
      }

      const playheadTick = scene.playheadTick.get();
      const transport =
        scene.projectStore.getState().transportSettings;

      barLabelRef.current.value = formatMusicalPosition(
        playheadTick,
        transport,
        scene.gridResolutionTicks.get(),
      );

      if (timeLabelRef.current !== null) {
        timeLabelRef.current.value = formatElapsedTime(
          playheadTick,
          transport.ppqn,
          transport.bpm,
        );
      }
    };
    const unsubscribePlayhead =
      scene.playheadTick.subscribe(updatePlayheadPosition);
    const unsubscribeGrid =
      scene.gridResolutionTicks.subscribe(updatePlayheadPosition);
    const unsubscribeProject =
      scene.projectStore.subscribe(updatePlayheadPosition);

    updatePlayheadPosition();

    return (): void => {
      unsubscribePlayhead();
      unsubscribeGrid();
      unsubscribeProject();
    };
  }, [scene]);

  useEffect(() => {
    const syncViewportControls = (): void => {
      const viewport = scene.viewport.get();
      const totalTicks = getProjectDurationTicks(
        scene.projectStore.getState(),
      );
      const maximumHorizontalScroll =
        getMaximumHorizontalScroll(
          viewport,
          dimensionsRef.current.width,
          totalTicks,
        );
      const maximumVerticalScroll = getMaximumVerticalScroll(
        viewport,
        dimensionsRef.current.height,
      );
      const scrollX = Math.min(
        maximumHorizontalScroll,
        viewport.scrollX,
      );
      const scrollY = Math.min(
        maximumVerticalScroll,
        viewport.scrollY,
      );

      if (scrollInputRef.current !== null) {
        scrollInputRef.current.max = String(
          maximumHorizontalScroll,
        );
        scrollInputRef.current.value = String(
          scrollX,
        );
        scrollInputRef.current.step = String(
          getHorizontalScrollStep(
            viewport,
            scene.gridResolutionTicks.get(),
          ),
        );
      }

      if (zoomInputRef.current !== null) {
        zoomInputRef.current.value = String(viewport.zoomX);
      }

      if (pitchScrollInputRef.current !== null) {
        pitchScrollInputRef.current.max = String(
          maximumVerticalScroll,
        );
        pitchScrollInputRef.current.value = String(
          scrollY,
        );
      }

      if (pitchZoomInputRef.current !== null) {
        pitchZoomInputRef.current.value = String(
          viewport.zoomY,
        );
      }

      if (zoomLabelRef.current !== null) {
        zoomLabelRef.current.value =
          `${Math.round(viewport.zoomX * 100)}%`;
      }

      if (pitchZoomLabelRef.current !== null) {
        pitchZoomLabelRef.current.value =
          `${Math.round(viewport.zoomY * 100)}%`;
      }

      if (
        scrollX !== viewport.scrollX
        || scrollY !== viewport.scrollY
      ) {
        publishViewport({
          ...viewport,
          scrollX,
          scrollY,
        });
      }
    };
    const unsubscribe = scene.viewport.subscribe(
      syncViewportControls,
    );
    const unsubscribeGrid = scene.gridResolutionTicks.subscribe(
      syncViewportControls,
    );
    const unsubscribeProject = scene.projectStore.subscribe(
      syncViewportControls,
    );

    syncViewportControls();
    return (): void => {
      unsubscribe();
      unsubscribeGrid();
      unsubscribeProject();
    };
  }, [
    publishViewport,
    scene,
  ]);

  const applyHorizontalZoom = useCallback(
    (zoomX: number): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      const viewport = currentScene.viewport.get();
      const viewportWidth = dimensionsRef.current.width;
      const currentPixelsPerTick =
        viewport.zoomX / viewport.ticksPerPixel;
      const nextPixelsPerTick =
        zoomX / viewport.ticksPerPixel;
      const centerTick =
        (viewport.scrollX + viewportWidth / 2)
        / currentPixelsPerTick;
      const nextViewport: ViewportState = {
        ...viewport,
        zoomX,
        scrollX: 0,
      };
      const maximumScroll = getMaximumHorizontalScroll(
        nextViewport,
        viewportWidth,
        getProjectDurationTicks(
          currentScene.projectStore.getState(),
        ),
      );
      const scrollX = Math.min(
        maximumScroll,
        Math.max(
          0,
          centerTick * nextPixelsPerTick - viewportWidth / 2,
        ),
      );

      publishViewport({
        ...nextViewport,
        scrollX,
      });

      if (scrollInputRef.current !== null) {
        scrollInputRef.current.max = String(maximumScroll);
        scrollInputRef.current.value = String(scrollX);
        scrollInputRef.current.step = String(
          getHorizontalScrollStep(
            nextViewport,
            currentScene.gridResolutionTicks.get(),
          ),
        );
      }

      if (zoomLabelRef.current !== null) {
        zoomLabelRef.current.value = `${Math.round(zoomX * 100)}%`;
      }

    },
    [publishViewport],
  );

  const applyHorizontalScroll = useCallback(
    (requestedScrollX: number): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      const viewport = currentScene.viewport.get();
      const maximumScroll = getMaximumHorizontalScroll(
        viewport,
        dimensionsRef.current.width,
        getProjectDurationTicks(
          currentScene.projectStore.getState(),
        ),
      );
      const scrollX = Math.min(
        maximumScroll,
        Math.max(0, requestedScrollX),
      );

      publishViewport({
        ...viewport,
        scrollX,
      });

    },
    [publishViewport],
  );

  const applyVerticalScroll = useCallback(
    (requestedScrollY: number): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      const viewport = currentScene.viewport.get();
      const maximumScroll = getMaximumVerticalScroll(
        viewport,
        dimensionsRef.current.height,
      );

      publishViewport({
        ...viewport,
        scrollY: Math.min(
          maximumScroll,
          Math.max(0, requestedScrollY),
        ),
      });
    },
    [publishViewport],
  );

  const applyVerticalZoom = useCallback(
    (zoomY: number): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      const viewport = currentScene.viewport.get();
      const viewportHeight = dimensionsRef.current.height;
      const currentPitchHeight =
        viewport.pitchHeight * viewport.zoomY;
      const nextPitchHeight = viewport.pitchHeight * zoomY;
      const centerRow =
        (viewport.scrollY + viewportHeight / 2)
        / currentPitchHeight;
      const maximumScroll = Math.max(
        0,
        (
          VIEWPORT_CONSTANTS.maximumMidiPitch
          - VIEWPORT_CONSTANTS.minimumMidiPitch
          + 1
        ) * nextPitchHeight - viewportHeight,
      );
      const scrollY = Math.min(
        maximumScroll,
        Math.max(
          0,
          centerRow * nextPitchHeight - viewportHeight / 2,
        ),
      );

      publishViewport({
        ...viewport,
        zoomY,
        scrollY,
      });

      if (pitchScrollInputRef.current !== null) {
        pitchScrollInputRef.current.max = String(maximumScroll);
        pitchScrollInputRef.current.value = String(scrollY);
      }

      if (pitchZoomLabelRef.current !== null) {
        pitchZoomLabelRef.current.value =
          `${Math.round(zoomY * 100)}%`;
      }
    },
    [publishViewport],
  );

  useEffect(() => {
    const horizontalScrollInput = scrollInputRef.current;
    const horizontalZoomInput = zoomInputRef.current;
    const verticalScrollInput = pitchScrollInputRef.current;
    const verticalZoomInput = pitchZoomInputRef.current;

    if (
      horizontalScrollInput === null
      || horizontalZoomInput === null
      || verticalScrollInput === null
      || verticalZoomInput === null
    ) {
      return undefined;
    }

    let animationFrameId: number | null = null;
    let pendingInputs = 0;
    let horizontalScroll = 0;
    let horizontalZoom = 1;
    let verticalScroll = 0;
    let verticalZoom = 1;

    const flushInputs = (): void => {
      animationFrameId = null;
      const inputs = pendingInputs;

      pendingInputs = 0;

      if ((inputs & VIEW_INPUT_HORIZONTAL_ZOOM) !== 0) {
        applyHorizontalZoom(horizontalZoom);
      }

      if ((inputs & VIEW_INPUT_HORIZONTAL_SCROLL) !== 0) {
        applyHorizontalScroll(horizontalScroll);
      }

      if ((inputs & VIEW_INPUT_VERTICAL_ZOOM) !== 0) {
        applyVerticalZoom(verticalZoom);
      }

      if ((inputs & VIEW_INPUT_VERTICAL_SCROLL) !== 0) {
        applyVerticalScroll(verticalScroll);
      }
    };
    const scheduleFlush = (): void => {
      if (animationFrameId === null) {
        animationFrameId =
          window.requestAnimationFrame(flushInputs);
      }
    };
    const handleHorizontalScrollInput = (): void => {
      horizontalScroll = horizontalScrollInput.valueAsNumber;
      pendingInputs |= VIEW_INPUT_HORIZONTAL_SCROLL;
      scheduleFlush();
    };
    const handleHorizontalZoomInput = (): void => {
      horizontalZoom = horizontalZoomInput.valueAsNumber;
      pendingInputs |= VIEW_INPUT_HORIZONTAL_ZOOM;
      scheduleFlush();
    };
    const handleVerticalScrollInput = (): void => {
      verticalScroll = verticalScrollInput.valueAsNumber;
      pendingInputs |= VIEW_INPUT_VERTICAL_SCROLL;
      scheduleFlush();
    };
    const handleVerticalZoomInput = (): void => {
      verticalZoom = verticalZoomInput.valueAsNumber;
      pendingInputs |= VIEW_INPUT_VERTICAL_ZOOM;
      scheduleFlush();
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

    horizontalScrollInput.addEventListener(
      "input",
      handleHorizontalScrollInput,
      {
        passive: true,
      },
    );
    horizontalZoomInput.addEventListener(
      "input",
      handleHorizontalZoomInput,
      {
        passive: true,
      },
    );
    verticalScrollInput.addEventListener(
      "input",
      handleVerticalScrollInput,
      {
        passive: true,
      },
    );
    verticalZoomInput.addEventListener(
      "input",
      handleVerticalZoomInput,
      {
        passive: true,
      },
    );

    for (const rangeInput of rangeInputs) {
      rangeInput.addEventListener(
        "contextmenu",
        preventLongPressAction,
      );
      rangeInput.addEventListener(
        "dragstart",
        preventLongPressAction,
      );
      rangeInput.addEventListener(
        "selectstart",
        preventLongPressAction,
      );
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

      for (const rangeInput of rangeInputs) {
        rangeInput.removeEventListener(
          "contextmenu",
          preventLongPressAction,
        );
        rangeInput.removeEventListener(
          "dragstart",
          preventLongPressAction,
        );
        rangeInput.removeEventListener(
          "selectstart",
          preventLongPressAction,
        );
      }
    };
  }, [
    applyHorizontalScroll,
    applyHorizontalZoom,
    applyVerticalScroll,
    applyVerticalZoom,
  ]);



  const restoreViewport = useCallback(
    (viewport: ViewportState, totalTicks: number): void => {
      publishViewport({
        ...viewport,
        scrollX: Math.min(
          viewport.scrollX,
          getMaximumHorizontalScroll(
            viewport,
            dimensionsRef.current.width,
            totalTicks,
          ),
        ),
        scrollY: Math.min(
          viewport.scrollY,
          getMaximumVerticalScroll(
            viewport,
            dimensionsRef.current.height,
          ),
        ),
      });
    },
    [publishViewport],
  );

  return {
    appShellRef,
    stageRef,
    horizontalZoomInputRef: zoomInputRef,
    horizontalScrollInputRef: scrollInputRef,
    verticalScrollInputRef: pitchScrollInputRef,
    verticalZoomInputRef: pitchZoomInputRef,
    horizontalZoomLabelRef: zoomLabelRef,
    verticalZoomLabelRef: pitchZoomLabelRef,
    timelinePositionRef: barLabelRef,
    timelineTimeRef: timeLabelRef,
    publishViewport,
    restoreViewport,
  };
}

function getMaximumHorizontalScroll(
  viewport: ViewportState,
  viewportWidth: number,
  totalTicks: number,
): number {
  const contentWidth =
    totalTicks * viewport.zoomX / viewport.ticksPerPixel;

  return Math.max(0, contentWidth - viewportWidth);
}

function getHorizontalScrollStep(
  viewport: ViewportState,
  gridResolutionTicks: number,
): number {
  return (
    gridResolutionTicks
    * viewport.zoomX
    / viewport.ticksPerPixel
  );
}

function formatMusicalPosition(
  tick: number,
  transport: TransportState,
  gridResolutionTicks: number,
): string {
  const safeTick = Math.max(0, Math.round(tick));
  const ticksPerBeat = transport.ppqn * 4 / transport.timeSignature.denominator;
  const ticksPerBar = ticksPerBeat * transport.timeSignature.numerator;
  const barIndex = Math.floor(safeTick / ticksPerBar);
  const tickInBar = safeTick - barIndex * ticksPerBar;
  const beatIndex = Math.floor(tickInBar / ticksPerBeat);
  const tickInBeat = tickInBar - beatIndex * ticksPerBeat;
  const subdivisionIndex = Math.floor(
    tickInBeat / Math.max(1, gridResolutionTicks),
  );

  return `${barIndex + 1}.${beatIndex + 1}.${subdivisionIndex + 1}`;
}

function formatElapsedTime(
  tick: number,
  ppqn: number,
  bpm: number,
): string {
  const safeBpm = Math.max(1, bpm);
  const safePpqn = Math.max(1, ppqn);
  const totalSeconds = Math.max(
    0,
    tick / safePpqn * 60 / safeBpm,
  );
  const totalWholeSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(totalWholeSeconds / 3_600);
  const minutes = Math.floor(
    (totalWholeSeconds % 3_600) / 60,
  );
  const seconds = totalWholeSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getMaximumVerticalScroll(
  viewport: ViewportState,
  viewportHeight: number,
): number {
  return Math.max(
    0,
    (
      VIEWPORT_CONSTANTS.maximumMidiPitch
      - VIEWPORT_CONSTANTS.minimumMidiPitch
      + 1
    ) * viewport.pitchHeight * viewport.zoomY - viewportHeight,
  );
}
