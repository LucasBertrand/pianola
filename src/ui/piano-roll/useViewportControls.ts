import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import {
  EDITOR_CONSTANTS,
  VIEWPORT_CONSTANTS,
} from "../../config/editor-config";
import {
  getActiveClip,
  getClipDurationTicks,
  getClipTimeSignature,
  type ProjectClock,
  type ProjectState,
  type TimeSignature,
} from "../../domain/model";
import type {
  ViewportState,
} from "../../editor/geometry/converter";
import {
  calculateVisibleRegion,
} from "../../editor/geometry/visible-region";
import {
  constrainViewportToContent,
  getMaximumHorizontalScroll,
  getMaximumVerticalScroll,
  getMinimumHorizontalZoom,
  getMinimumVerticalZoom,
  getPlaybackFollowScrollX,
  getScrollXToRevealTick,
} from "../../editor/geometry/viewport-bounds";
import type {
  EditorRuntime,
} from "../../editor/runtime/editor-runtime";

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
  readonly timelinePositionRef:
    RefObject<HTMLOutputElement | null>;
  readonly timelineTimeRef:
    RefObject<HTMLOutputElement | null>;
  readonly beginHorizontalViewportInteraction: () => void;
  readonly endHorizontalViewportInteraction: () => void;
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
const TIMELINE_HEADER_HEIGHT_CSS_PIXELS =
  RULER_HEIGHT_CSS_PIXELS;

export function useViewportControls(
  runtime: EditorRuntime,
  inspectorOpen: boolean,
  followPlayback: boolean,
  seekPlayback: (tick: number) => void,
): ViewportControls {
  const sceneRef = useRef(runtime);
  const appShellRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const zoomInputRef = useRef<HTMLInputElement | null>(null);
  const scrollInputRef = useRef<HTMLInputElement | null>(null);
  const pitchScrollInputRef = useRef<HTMLInputElement | null>(null);
  const pitchZoomInputRef = useRef<HTMLInputElement | null>(null);
  const barLabelRef = useRef<HTMLOutputElement | null>(null);
  const timeLabelRef = useRef<HTMLOutputElement | null>(null);
  const dimensionsRef = useRef<MutableViewportDimensions>({
    width: VIEWPORT_CONSTANTS.initialWidthCssPixels,
    height: VIEWPORT_CONSTANTS.initialHeightCssPixels,
  });
  const horizontalInteractionActiveRef = useRef(false);
  const followPlaybackRef = useRef(followPlayback);
  const scene = runtime;

  sceneRef.current = runtime;
  followPlaybackRef.current = followPlayback;

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
          getWorkspaceDurationTicks(
            currentScene.projectStore.getState(),
          ),
        ),
      );
    },
    [],
  );

  const reconcileHorizontalPlaybackFollow = useCallback(
    (): void => {
      if (!followPlaybackRef.current) {
        return;
      }

      const currentScene = sceneRef.current;
      const viewport = currentScene.viewport.get();
      const scrollX = getPlaybackFollowScrollX(
        viewport,
        dimensionsRef.current.width,
        getWorkspaceDurationTicks(
          currentScene.projectStore.getState(),
        ),
        currentScene.playheadTick.get(),
        false,
      );

      if (scrollX !== viewport.scrollX) {
        publishViewport({
          ...viewport,
          scrollX,
        });
      }
    },
    [publishViewport],
  );

  const beginHorizontalViewportInteraction = useCallback(
    (): void => {
      horizontalInteractionActiveRef.current = true;
    },
    [],
  );

  const endHorizontalViewportInteraction = useCallback(
    (): void => {
      if (!horizontalInteractionActiveRef.current) {
        return;
      }

      horizontalInteractionActiveRef.current = false;
      reconcileHorizontalPlaybackFollow();
    },
    [reconcileHorizontalPlaybackFollow],
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
      const safeWidth = Math.max(1, width);
      const height = Math.max(
        1,
        stageHeight - TIMELINE_HEADER_HEIGHT_CSS_PIXELS,
      );

      dimensionsRef.current.width = safeWidth;
      dimensionsRef.current.height = height;

      const currentScene = sceneRef.current;

      if (currentScene !== null) {
        const viewport = currentScene.viewport.get();
        const totalTicks = getWorkspaceDurationTicks(
          currentScene.projectStore.getState(),
        );
        const nextViewport = constrainViewportToContent(
          viewport,
          safeWidth,
          height,
          totalTicks,
        );
        const maximumVerticalScroll = getMaximumVerticalScroll(
          nextViewport,
          height,
        );
        const maximumHorizontalScroll =
          getMaximumHorizontalScroll(
            nextViewport,
            safeWidth,
            totalTicks,
          );

        if (zoomInputRef.current !== null) {
          zoomInputRef.current.min = String(
            getMinimumHorizontalZoom(
              safeWidth,
              totalTicks,
              nextViewport.ticksPerPixel,
            ),
          );
          zoomInputRef.current.value = String(nextViewport.zoomX);
        }

        if (pitchZoomInputRef.current !== null) {
          pitchZoomInputRef.current.min = String(
            getMinimumVerticalZoom(
              height,
              nextViewport.pitchHeight,
            ),
          );
          pitchZoomInputRef.current.value = String(nextViewport.zoomY);
        }

        if (pitchScrollInputRef.current !== null) {
          pitchScrollInputRef.current.max = String(
            maximumVerticalScroll,
          );
          pitchScrollInputRef.current.value = String(
            nextViewport.scrollY,
          );
        }

        if (scrollInputRef.current !== null) {
          scrollInputRef.current.max = String(
            maximumHorizontalScroll,
          );
          scrollInputRef.current.value = String(
            nextViewport.scrollX,
          );
        }

        if (!areViewportsEqual(nextViewport, viewport)) {
          publishViewport(nextViewport);
        } else {
          currentScene.visibleRegion.set(
            calculateVisibleRegion(
              nextViewport,
              safeWidth,
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
      const totalTicks = getWorkspaceDurationTicks(state);
      const viewport = currentScene.viewport.get();
      const nextViewport = constrainViewportToContent(
        viewport,
        dimensionsRef.current.width,
        dimensionsRef.current.height,
        totalTicks,
      );

      if (appShellRef.current !== null) {
        appShellRef.current.dataset["projectRevision"] =
          String(state.revision);
      }

      const currentPlayheadTick = currentScene.playheadTick.get();

      if (currentPlayheadTick > totalTicks) {
        seekPlayback(totalTicks);
      }

      if (!areViewportsEqual(nextViewport, viewport)) {
        publishViewport(nextViewport);
      } else {
        const visibleRegion = currentScene.visibleRegion.get();
        const nextVisibleRegion = calculateVisibleRegion(
          nextViewport,
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
      const state = scene.projectStore.getState();
      const activeClip = getActiveClip(state);

      barLabelRef.current.value = formatMusicalPosition(
        playheadTick,
        state.clock,
        getClipTimeSignature(activeClip),
        scene.gridResolutionTicks.get(),
      );

      if (timeLabelRef.current !== null) {
        timeLabelRef.current.value = formatElapsedTime(
          playheadTick,
          state.clock.ppqn,
          state.clock.tempoBpm,
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
    const followPlayheadPage = (): void => {
      const currentScene = sceneRef.current;

      if (currentScene === null) {
        return;
      }

      const viewport = currentScene.viewport.get();
      const totalTicks = getWorkspaceDurationTicks(
        currentScene.projectStore.getState(),
      );
      const playheadTick = currentScene.playheadTick.get();
      const scrollX = followPlayback
        ? getPlaybackFollowScrollX(
          viewport,
          dimensionsRef.current.width,
          totalTicks,
          playheadTick,
          horizontalInteractionActiveRef.current,
        )
        : getScrollXToRevealTick(
          viewport,
          dimensionsRef.current.width,
          totalTicks,
          playheadTick,
        );

      if (scrollX !== viewport.scrollX) {
        publishViewport({
          ...viewport,
          scrollX,
        });
      }
    };
    const unsubscribe = scene.playheadTick.subscribe(
      followPlayheadPage,
    );

    followPlayheadPage();
    return unsubscribe;
  }, [followPlayback, publishViewport, scene]);

  useEffect(() => {
    const syncViewportControls = (): void => {
      const viewport = scene.viewport.get();
      const totalTicks = getWorkspaceDurationTicks(
        scene.projectStore.getState(),
      );
      const nextViewport = constrainViewportToContent(
        viewport,
        dimensionsRef.current.width,
        dimensionsRef.current.height,
        totalTicks,
      );
      const maximumHorizontalScroll =
        getMaximumHorizontalScroll(
          nextViewport,
          dimensionsRef.current.width,
          totalTicks,
        );
      const maximumVerticalScroll = getMaximumVerticalScroll(
        nextViewport,
        dimensionsRef.current.height,
      );

      if (scrollInputRef.current !== null) {
        scrollInputRef.current.max = String(
          maximumHorizontalScroll,
        );
        scrollInputRef.current.value = String(
          nextViewport.scrollX,
        );
      }

      if (zoomInputRef.current !== null) {
        zoomInputRef.current.min = String(
          getMinimumHorizontalZoom(
            dimensionsRef.current.width,
            totalTicks,
            nextViewport.ticksPerPixel,
          ),
        );
        zoomInputRef.current.value = String(nextViewport.zoomX);
      }

      if (pitchScrollInputRef.current !== null) {
        pitchScrollInputRef.current.max = String(
          maximumVerticalScroll,
        );
        pitchScrollInputRef.current.value = String(
          nextViewport.scrollY,
        );
      }

      if (pitchZoomInputRef.current !== null) {
        pitchZoomInputRef.current.min = String(
          getMinimumVerticalZoom(
            dimensionsRef.current.height,
            nextViewport.pitchHeight,
          ),
        );
        pitchZoomInputRef.current.value = String(nextViewport.zoomY);
      }

      if (
        !areViewportsEqual(nextViewport, viewport)
      ) {
        publishViewport(nextViewport);
      } else {
        const currentRegion = scene.visibleRegion.get();
        const nextRegion = calculateVisibleRegion(
          nextViewport,
          dimensionsRef.current.width,
          dimensionsRef.current.height,
          totalTicks,
        );

        if (
          nextRegion.startTick !== currentRegion.startTick
          || nextRegion.endTick !== currentRegion.endTick
          || nextRegion.minPitch !== currentRegion.minPitch
          || nextRegion.maxPitch !== currentRegion.maxPitch
        ) {
          scene.visibleRegion.set(nextRegion);
        }
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
      const totalTicks = getWorkspaceDurationTicks(
        currentScene.projectStore.getState(),
      );
      const constrainedZoomX = clamp(
        zoomX,
        getMinimumHorizontalZoom(
          viewportWidth,
          totalTicks,
          viewport.ticksPerPixel,
        ),
        VIEWPORT_CONSTANTS.maximumHorizontalZoom,
      );
      const currentPixelsPerTick =
        viewport.zoomX / viewport.ticksPerPixel;
      const nextPixelsPerTick =
        constrainedZoomX / viewport.ticksPerPixel;
      const centerTick =
        (viewport.scrollX + viewportWidth / 2)
        / currentPixelsPerTick;
      const nextViewport: ViewportState = {
        ...viewport,
        zoomX: constrainedZoomX,
        scrollX: 0,
      };
      const maximumScroll = getMaximumHorizontalScroll(
        nextViewport,
        viewportWidth,
        totalTicks,
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
        getWorkspaceDurationTicks(
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
      const constrainedZoomY = clamp(
        zoomY,
        getMinimumVerticalZoom(
          viewportHeight,
          viewport.pitchHeight,
        ),
        VIEWPORT_CONSTANTS.maximumVerticalZoom,
      );
      const currentPitchHeight =
        viewport.pitchHeight * viewport.zoomY;
      const nextPitchHeight =
        viewport.pitchHeight * constrainedZoomY;
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
        zoomY: constrainedZoomY,
        scrollY,
      });

      if (pitchScrollInputRef.current !== null) {
        pitchScrollInputRef.current.max = String(maximumScroll);
        pitchScrollInputRef.current.value = String(scrollY);
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
    const flushPendingInputs = (): void => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        flushInputs();
      }
    };
    const handleHorizontalInteractionStart = (): void => {
      beginHorizontalViewportInteraction();
    };
    const handleHorizontalInteractionEnd = (): void => {
      flushPendingInputs();
      endHorizontalViewportInteraction();
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
    horizontalScrollInput.addEventListener(
      "pointerdown",
      handleHorizontalInteractionStart,
    );
    horizontalScrollInput.addEventListener(
      "pointerup",
      handleHorizontalInteractionEnd,
    );
    horizontalScrollInput.addEventListener(
      "pointercancel",
      handleHorizontalInteractionEnd,
    );
    horizontalScrollInput.addEventListener(
      "lostpointercapture",
      handleHorizontalInteractionEnd,
    );
    horizontalZoomInput.addEventListener(
      "input",
      handleHorizontalZoomInput,
      {
        passive: true,
      },
    );
    horizontalZoomInput.addEventListener(
      "pointerdown",
      handleHorizontalInteractionStart,
    );
    horizontalZoomInput.addEventListener(
      "pointerup",
      handleHorizontalInteractionEnd,
    );
    horizontalZoomInput.addEventListener(
      "pointercancel",
      handleHorizontalInteractionEnd,
    );
    horizontalZoomInput.addEventListener(
      "lostpointercapture",
      handleHorizontalInteractionEnd,
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
      horizontalScrollInput.removeEventListener(
        "pointerdown",
        handleHorizontalInteractionStart,
      );
      horizontalScrollInput.removeEventListener(
        "pointerup",
        handleHorizontalInteractionEnd,
      );
      horizontalScrollInput.removeEventListener(
        "pointercancel",
        handleHorizontalInteractionEnd,
      );
      horizontalScrollInput.removeEventListener(
        "lostpointercapture",
        handleHorizontalInteractionEnd,
      );
      horizontalZoomInput.removeEventListener(
        "pointerdown",
        handleHorizontalInteractionStart,
      );
      horizontalZoomInput.removeEventListener(
        "pointerup",
        handleHorizontalInteractionEnd,
      );
      horizontalZoomInput.removeEventListener(
        "pointercancel",
        handleHorizontalInteractionEnd,
      );
      horizontalZoomInput.removeEventListener(
        "lostpointercapture",
        handleHorizontalInteractionEnd,
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
    beginHorizontalViewportInteraction,
    endHorizontalViewportInteraction,
  ]);



  const restoreViewport = useCallback(
    (viewport: ViewportState, totalTicks: number): void => {
      publishViewport(
        constrainViewportToContent(
          viewport,
          dimensionsRef.current.width,
          dimensionsRef.current.height,
          totalTicks,
        ),
      );
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
    timelinePositionRef: barLabelRef,
    timelineTimeRef: timeLabelRef,
    beginHorizontalViewportInteraction,
    endHorizontalViewportInteraction,
    publishViewport,
    restoreViewport,
  };
}

function formatMusicalPosition(
  tick: number,
  clock: ProjectClock,
  timeSignature: TimeSignature,
  gridResolutionTicks: number,
): string {
  const safeTick = Math.max(0, Math.round(tick));
  const ticksPerBeat = clock.ppqn * 4 / timeSignature.denominator;
  const ticksPerBar = ticksPerBeat * timeSignature.numerator;
  const barIndex = Math.floor(safeTick / ticksPerBar);
  const tickInBar = safeTick - barIndex * ticksPerBar;
  const beatIndex = Math.floor(tickInBar / ticksPerBeat);
  const tickInBeat = tickInBar - beatIndex * ticksPerBeat;
  const subdivisionIndex = Math.floor(
    tickInBeat / Math.max(1, gridResolutionTicks),
  );

  return `${barIndex + 1}.${beatIndex + 1}.${subdivisionIndex + 1}`;
}

function getWorkspaceDurationTicks(state: ProjectState): number {
  return getClipDurationTicks(getActiveClip(state));
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

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, value));
}
