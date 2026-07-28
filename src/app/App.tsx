import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import type {
  PianoRollCommand,
  Transaction,
  UpdateVoiceChanges,
} from "../domain/commands";
import type {
  Note,
  NoteId,
  OscillatorWaveform,
  ProjectState,
  TimeSignature,
  TransportState,
  Voice,
  VoiceId,
} from "../domain/model";
import {
  getProjectDurationTicks,
  getTicksPerMeasure,
  MAXIMUM_MEASURE_COUNT,
  MINIMUM_MEASURE_COUNT,
} from "../domain/model";
import {
  MAXIMUM_HORIZONTAL_ZOOM,
  MAXIMUM_VERTICAL_ZOOM,
  MINIMUM_HORIZONTAL_ZOOM,
  MINIMUM_VERTICAL_ZOOM,
  type ViewportState,
} from "../geometry/converter";
import {
  PianoRollLayers,
  type NoteColorMode,
} from "../ui/components/PianoRollLayers";
import {
  useCanvasRenderer,
  type CanvasFrame,
} from "../ui/hooks/useCanvasRenderer";
import type {
  PianoRollEventController,
} from "../ui/hooks/usePianoRollEvents";
import type {
  ReadonlyRenderSignal,
} from "../ui/rendering/render-signal";
import {
  calculateVisibleRegion,
  createDemoScene,
  DEMO_NOTE_COUNT,
  INITIAL_MAX_VISIBLE_PITCH,
  INITIAL_PITCH_HEIGHT,
  type DemoScene,
} from "./demo-scene";

interface ViewportDimensions {
  width: number;
  height: number;
}

interface PianoRollClipboard {
  readonly notes: readonly Note[];
  readonly originTick: number;
}

const PITCH_CLASS_NAMES = [
  "C",
  "C sharp",
  "D",
  "D sharp",
  "E",
  "F",
  "F sharp",
  "G",
  "G sharp",
  "A",
  "A sharp",
  "B",
] as const;
const PIANO_KEYS = createPianoKeys();
const VIEW_INPUT_HORIZONTAL_SCROLL = 1;
const VIEW_INPUT_HORIZONTAL_ZOOM = 2;
const VIEW_INPUT_VERTICAL_SCROLL = 4;
const VIEW_INPUT_VERTICAL_ZOOM = 8;
const RULER_HEIGHT_CSS_PIXELS = 28;

export function App(): React.JSX.Element {
  const sceneRef = useRef<DemoScene | null>(null);
  const appShellRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const zoomInputRef = useRef<HTMLInputElement | null>(null);
  const scrollInputRef = useRef<HTMLInputElement | null>(null);
  const pitchScrollInputRef = useRef<HTMLInputElement | null>(null);
  const pitchZoomInputRef = useRef<HTMLInputElement | null>(null);
  const zoomLabelRef = useRef<HTMLOutputElement | null>(null);
  const pitchZoomLabelRef = useRef<HTMLOutputElement | null>(null);
  const barLabelRef = useRef<HTMLOutputElement | null>(null);
  const playheadPositionLabelRef =
    useRef<HTMLOutputElement | null>(null);
  const noteCountLabelRef = useRef<HTMLSpanElement | null>(null);
  const pianoRollEventControllerRef =
    useRef<PianoRollEventController | null>(null);
  const clipboardRef = useRef<PianoRollClipboard | null>(null);
  const voiceTransactionSequenceRef = useRef(0);
  const editTransactionSequenceRef = useRef(0);
  const dimensionsRef = useRef<ViewportDimensions>({
    width: 1_600,
    height: 900,
  });

  if (sceneRef.current === null) {
    sceneRef.current = createDemoScene();
  }

  const scene = sceneRef.current;
  const [projectState, setProjectState] = useState(
    () => scene.projectStore.getState(),
  );
  const [selectedVoiceId, setSelectedVoiceId] =
    useState<VoiceId | null>(
      () => scene.projectStore.getState().voiceOrder[0] ?? null,
    );
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [clipboardAvailable, setClipboardAvailable] =
    useState(false);
  const [selectionAvailable, setSelectionAvailable] =
    useState(false);
  const [noteColorMode, setNoteColorMode] =
    useState<NoteColorMode>(
      () => scene.noteColorMode.get(),
    );
  const selectedVoice =
    selectedVoiceId === null
      ? undefined
      : projectState.voicesById[selectedVoiceId];
  const totalTicks = getProjectDurationTicks(projectState);
  const handleSelectionChange = useCallback(
    (hasSelection: boolean): void => {
      setSelectionAvailable(hasSelection);
    },
    [],
  );
  const handlePitchSelect = useCallback((pitch: number): void => {
    pianoRollEventControllerRef.current
      ?.addPitchToSelection(pitch);
  }, []);

  useEffect(
    () => scene.projectStore.subscribe((state) => {
      setProjectState(state);
      setSelectedVoiceId((currentVoiceId) => {
        if (
          currentVoiceId !== null
          && state.voicesById[currentVoiceId] !== undefined
        ) {
          return currentVoiceId;
        }

        return state.voiceOrder[0] ?? null;
      });
    }),
    [scene],
  );

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
        stageHeight - RULER_HEIGHT_CSS_PIXELS,
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

        updateBarOutput(barLabelRef.current, {
          ...nextViewport,
        }, getTicksPerBar(
          currentScene.projectStore.getState().transportSettings,
        ));

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
      const noteCount = countProjectNotes(state);
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

      if (noteCountLabelRef.current !== null) {
        noteCountLabelRef.current.textContent =
          `${noteCount.toLocaleString()} indexed notes`;
      }

      if (appShellRef.current !== null) {
        appShellRef.current.dataset["projectRevision"] =
          String(state.revision);
      }

      updateBarOutput(
        barLabelRef.current,
        {
          ...viewport,
          scrollX,
        },
        getTicksPerBar(state.transportSettings),
      );

      if (scrollInputRef.current !== null) {
        scrollInputRef.current.max = String(
          maximumHorizontalScroll,
        );
        scrollInputRef.current.value = String(scrollX);
      }

      const currentPlayheadTick = currentScene.playheadTick.get();

      if (currentPlayheadTick > totalTicks) {
        currentScene.playheadTick.set(totalTicks);
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
  ]);

  useEffect(() => {
    const updatePlayheadPosition = (): void => {
      if (playheadPositionLabelRef.current === null) {
        return;
      }

      playheadPositionLabelRef.current.value =
        formatMusicalPosition(
          scene.playheadTick.get(),
          scene.projectStore.getState().transportSettings,
          scene.gridResolutionTicks.get(),
        );
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

      updateBarOutput(
        barLabelRef.current,
        {
          ...viewport,
          scrollX,
          scrollY,
        },
        getTicksPerBar(
          scene.projectStore.getState().transportSettings,
        ),
      );

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

      updateBarOutput(barLabelRef.current, {
        ...nextViewport,
        scrollX,
      }, getTicksPerBar(
        currentScene.projectStore.getState().transportSettings,
      ));
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

      updateBarOutput(barLabelRef.current, {
        ...viewport,
        scrollX,
      }, getTicksPerBar(
        currentScene.projectStore.getState().transportSettings,
      ));
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
        128 * nextPitchHeight - viewportHeight,
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

  const handleResetView = useCallback((): void => {
    const currentScene = sceneRef.current;

    if (currentScene === null) {
      return;
    }

    const viewport: ViewportState = {
      ...currentScene.viewport.get(),
      zoomX: 1,
      zoomY: 1,
      scrollX: 0,
      scrollY:
        (127 - INITIAL_MAX_VISIBLE_PITCH)
        * INITIAL_PITCH_HEIGHT,
    };

    publishViewport(viewport);

    if (zoomInputRef.current !== null) {
      zoomInputRef.current.value = "1";
    }

    if (scrollInputRef.current !== null) {
      scrollInputRef.current.value = "0";
      scrollInputRef.current.max = String(
        getMaximumHorizontalScroll(
          viewport,
          dimensionsRef.current.width,
          getProjectDurationTicks(
            currentScene.projectStore.getState(),
          ),
        ),
      );
      scrollInputRef.current.step = String(
        getHorizontalScrollStep(
          viewport,
          currentScene.gridResolutionTicks.get(),
        ),
      );
    }

    if (pitchScrollInputRef.current !== null) {
      pitchScrollInputRef.current.value = String(
        viewport.scrollY,
      );
      pitchScrollInputRef.current.max = String(
        getMaximumVerticalScroll(
          viewport,
          dimensionsRef.current.height,
        ),
      );
    }

    if (pitchZoomInputRef.current !== null) {
      pitchZoomInputRef.current.value = "1";
    }

    if (zoomLabelRef.current !== null) {
      zoomLabelRef.current.value = "100%";
    }

    if (barLabelRef.current !== null) {
      barLabelRef.current.value = "Bar 1";
    }

    if (pitchZoomLabelRef.current !== null) {
      pitchZoomLabelRef.current.value = "100%";
    }
  }, [publishViewport]);

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

  const dispatchVoiceCommand = useCallback(
    (
      command: PianoRollCommand,
      label: string,
    ): void => {
      voiceTransactionSequenceRef.current += 1;
      const timestamp = Date.now();
      const transaction: Transaction = {
        transactionId:
          `voice-${timestamp}-${voiceTransactionSequenceRef.current}`,
        label,
        createdAt: timestamp,
        commands: [command],
      };

      scene.projectStore.dispatch(transaction);
    },
    [scene],
  );
  const dispatchEditCommands = useCallback(
    (
      commands: readonly PianoRollCommand[],
      label: string,
    ): ProjectState | null => {
      if (commands.length === 0) {
        return null;
      }

      editTransactionSequenceRef.current += 1;
      const timestamp = Date.now();
      const transaction: Transaction = {
        transactionId:
          `edit-${timestamp}-${editTransactionSequenceRef.current}`,
        label,
        createdAt: timestamp,
        commands,
      };

      return scene.projectStore.dispatch(transaction);
    },
    [scene],
  );
  const prepareStructuralEdit = useCallback((): void => {
    const controller = pianoRollEventControllerRef.current;

    controller?.cancel();
    controller?.clearSelection();
  }, []);
  const handleInsertMeasure = useCallback(
    (afterMeasureIndex: number): void => {
      const state = scene.projectStore.getState();

      if (state.measureCount >= MAXIMUM_MEASURE_COUNT) {
        return;
      }

      const measureTicks = getTicksPerMeasure(
        state.transportSettings,
      );
      const insertionTick =
        (afterMeasureIndex + 1) * measureTicks;
      const currentPlayheadTick = scene.playheadTick.get();

      prepareStructuralEdit();
      const nextState = dispatchEditCommands(
        [
          {
            type: "InsertMeasure",
            afterMeasureIndex,
          },
        ],
        `Insert measure after ${afterMeasureIndex + 1}`,
      );

      if (
        nextState !== null
        && currentPlayheadTick >= insertionTick
      ) {
        scene.playheadTick.set(
          currentPlayheadTick + measureTicks,
        );
      }
    },
    [
      dispatchEditCommands,
      prepareStructuralEdit,
      scene,
    ],
  );
  const handleRemoveMeasure = useCallback(
    (measureIndex: number): void => {
      const state = scene.projectStore.getState();

      if (state.measureCount <= MINIMUM_MEASURE_COUNT) {
        return;
      }

      const measureTicks = getTicksPerMeasure(
        state.transportSettings,
      );
      const removalStartTick = measureIndex * measureTicks;
      const removalEndTick = removalStartTick + measureTicks;
      const currentPlayheadTick = scene.playheadTick.get();

      prepareStructuralEdit();
      const nextState = dispatchEditCommands(
        [
          {
            type: "RemoveMeasure",
            measureIndex,
          },
        ],
        `Remove measure ${measureIndex + 1}`,
      );

      if (nextState !== null) {
        scene.playheadTick.set(
          collapseTickForRemovedMeasure(
            currentPlayheadTick,
            removalStartTick,
            removalEndTick,
          ),
        );
      }
    },
    [
      dispatchEditCommands,
      prepareStructuralEdit,
      scene,
    ],
  );
  const clearExternalSelection = useCallback((): void => {
    const request = scene.voiceSelectionRequest;

    if (request.get() === null) {
      request.invalidate();
    } else {
      request.set(null);
    }
  }, [scene]);
  const handleVoiceSelect = useCallback(
    (voiceId: VoiceId): void => {
      setSelectedVoiceId(voiceId);
      clearExternalSelection();
    },
    [clearExternalSelection],
  );
  const handleAddVoice = useCallback((): void => {
    const state = scene.projectStore.getState();
    const voice = createUserVoice(
      state.voiceOrder.length,
      voiceTransactionSequenceRef.current,
    );

    dispatchVoiceCommand(
      {
        type: "AddVoice",
        voice,
      },
      "Add voice",
    );
    setSelectedVoiceId(voice.id);
    clearExternalSelection();
  }, [
    clearExternalSelection,
    dispatchVoiceCommand,
    scene,
  ]);
  const handleDeleteVoice = useCallback(
    (voiceId: VoiceId): void => {
      const state = scene.projectStore.getState();
      const voice = state.voicesById[voiceId];

      if (
        voice === undefined
        || !window.confirm(
          `Delete "${voice.name}" and all of its notes?`,
        )
      ) {
        return;
      }

      const voiceIndex = state.voiceOrder.indexOf(voiceId);
      const nextVoiceId =
        state.voiceOrder[voiceIndex + 1]
        ?? state.voiceOrder[voiceIndex - 1]
        ?? null;

      dispatchVoiceCommand(
        {
          type: "DeleteVoice",
          voiceId,
        },
        "Delete voice",
      );
      clearExternalSelection();

      if (selectedVoiceId === voiceId) {
        setSelectedVoiceId(nextVoiceId);
      }
    },
    [
      clearExternalSelection,
      dispatchVoiceCommand,
      scene,
      selectedVoiceId,
    ],
  );
  const handleUpdateVoice = useCallback(
    (
      voiceId: VoiceId,
      changes: UpdateVoiceChanges,
      label: string,
    ): void => {
      dispatchVoiceCommand(
        {
          type: "UpdateVoice",
          voiceId,
          changes,
        },
        label,
      );
    },
    [dispatchVoiceCommand],
  );
  const handleSelectVoiceNotes = useCallback(
    (voiceId: VoiceId): void => {
      if (
        scene.projectStore.getState().voicesById[voiceId]
          ?.locked !== false
      ) {
        return;
      }

      setSelectedVoiceId(voiceId);
      const request = scene.voiceSelectionRequest;

      if (request.get() === voiceId) {
        request.invalidate();
      } else {
        request.set(voiceId);
      }
    },
    [scene],
  );
  const handleToggleVoiceLock = useCallback(
    (voice: Voice): void => {
      handleUpdateVoice(
        voice.id,
        {
          locked: !voice.locked,
        },
        voice.locked ? "Unlock voice" : "Lock voice",
      );

      if (!voice.locked) {
        pianoRollEventControllerRef.current
          ?.removeVoiceFromSelection(voice.id);
      }
    },
    [handleUpdateVoice],
  );
  const handleUndo = useCallback((): void => {
    const controller = pianoRollEventControllerRef.current;

    controller?.cancel();
    controller?.clearSelection();
    scene.projectStore.undo();
  }, [scene]);
  const handleRedo = useCallback((): void => {
    const controller = pianoRollEventControllerRef.current;

    controller?.cancel();
    controller?.clearSelection();
    scene.projectStore.redo();
  }, [scene]);
  const copyCurrentSelection = useCallback(
    (): PianoRollClipboard | null => {
      const notes =
        pianoRollEventControllerRef.current?.getSelectedNotes()
        ?? [];

      if (notes.length === 0) {
        return null;
      }

      let originTick = Number.POSITIVE_INFINITY;

      for (
        let noteIndex = 0;
        noteIndex < notes.length;
        noteIndex += 1
      ) {
        const note = notes[noteIndex];

        if (
          note !== undefined
          && note.startTick < originTick
        ) {
          originTick = note.startTick;
        }
      }

      if (!Number.isFinite(originTick)) {
        return null;
      }

      const clipboard: PianoRollClipboard = {
        notes,
        originTick,
      };

      clipboardRef.current = clipboard;
      setClipboardAvailable(true);

      return clipboard;
    },
    [],
  );
  const handleCopy = useCallback((): void => {
    copyCurrentSelection();
  }, [copyCurrentSelection]);
  const handleCut = useCallback((): void => {
    const clipboard = copyCurrentSelection();

    if (clipboard === null) {
      return;
    }

    const nextState = dispatchEditCommands(
      buildDeleteCommandsForNotes(clipboard.notes),
      "Cut notes",
    );

    if (nextState !== null) {
      pianoRollEventControllerRef.current?.clearSelection();
    }
  }, [
    copyCurrentSelection,
    dispatchEditCommands,
  ]);
  const handleDeleteSelection = useCallback((): void => {
    const controller = pianoRollEventControllerRef.current;
    const notes = controller?.getSelectedNotes() ?? [];

    if (notes.length === 0) {
      return;
    }

    const nextState = dispatchEditCommands(
      buildDeleteCommandsForNotes(notes),
      "Delete notes",
    );

    if (nextState !== null) {
      controller?.clearSelection();
    }
  }, [dispatchEditCommands]);
  const handlePaste = useCallback((): void => {
    const clipboard = clipboardRef.current;

    if (clipboard === null) {
      return;
    }

    const resolutionTicks = scene.gridResolutionTicks.get();
    const playheadTick = scene.playheadTick.get();
    const pasteTick =
      Math.round(playheadTick / resolutionTicks)
      * resolutionTicks;
    const timestamp = Date.now();
    const pastedNotes = createPastedNotes(
      clipboard,
      pasteTick,
      timestamp,
      editTransactionSequenceRef.current,
    );
    const state = scene.projectStore.getState();

    if (!canPasteNotes(state, pastedNotes)) {
      window.alert(
        "Paste is unavailable because it would overlap notes, exceed the timeline, or target a locked voice.",
      );
      return;
    }

    const nextState = dispatchEditCommands(
      buildAddCommandsForNotes(pastedNotes),
      "Paste notes",
    );

    if (nextState === null) {
      return;
    }

    const selectedPastedNotes: Note[] = [];

    for (
      let noteIndex = 0;
      noteIndex < pastedNotes.length;
      noteIndex += 1
    ) {
      const pastedNote = pastedNotes[noteIndex];

      if (pastedNote === undefined) {
        continue;
      }

      const storedNote =
        nextState
          .tracksByVoiceId[pastedNote.voiceId]
          ?.notesById[pastedNote.id];

      if (storedNote !== undefined) {
        selectedPastedNotes.push(storedNote);
      }
    }

    pianoRollEventControllerRef.current?.replaceSelection(
      selectedPastedNotes,
    );
  }, [
    dispatchEditCommands,
    scene,
  ]);
  const handleProjectTitleCommit = useCallback(
    (input: HTMLInputElement): void => {
      const title = input.value.trim();
      const currentTitle = scene.projectStore.getState().title;

      if (title.length === 0) {
        input.value = currentTitle;
        return;
      }

      if (title !== currentTitle) {
        dispatchEditCommands(
          [
            {
              type: "UpdateProjectTitle",
              title,
            },
          ],
          "Rename project",
        );
      }
    },
    [
      dispatchEditCommands,
      scene,
    ],
  );
  const handleNoteColorModeToggle = useCallback((): void => {
    setNoteColorMode((currentMode) => {
      const nextMode: NoteColorMode =
        currentMode === "voice" ? "pitch" : "voice";

      scene.noteColorMode.set(nextMode);
      return nextMode;
    });
  }, [scene]);

  return (
    <main
      ref={appShellRef}
      className="app-shell"
      data-project-revision="0"
    >
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <input
              key={projectState.title}
              className="project-title-input"
              type="text"
              defaultValue={projectState.title}
              aria-label="Project title"
              onBlur={(event) => {
                handleProjectTitleCommit(event.currentTarget);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
        </div>

        <div className="transport-cluster" aria-label="Transport preview">
          <button
            className="icon-button"
            type="button"
            title="Return to start"
          >
            <span aria-hidden="true">↤</span>
          </button>
          <button
            className="play-button"
            type="button"
            title="Audio engine arrives in Phase 5"
          >
            <span aria-hidden="true">▶</span>
          </button>
          <button
            className="icon-button"
            type="button"
            title="Stop"
          >
            <span className="stop-icon" aria-hidden="true" />
          </button>
        </div>

        <TransportMetrics
          projectStore={scene.projectStore}
          gridResolutionTicks={scene.gridResolutionTicks}
        />

        <div className="topbar-actions">
          <span className="engine-status">
            <i />
            Canvas ready
          </span>
          <button className="secondary-button" type="button">
            Export
          </button>
        </div>
      </header>

      <section
        className={
          `workspace${inspectorOpen ? " is-inspector-open" : ""}`
        }
      >
        <div className="editor-panel">
          <div className="editor-toolbar">
            <div className="editor-toolbar-actions">
              <button
                className="inspector-toggle-button"
                type="button"
                aria-expanded={inspectorOpen}
                aria-controls="voice-inspector"
                onClick={() => {
                  setInspectorOpen((current) => !current);
                }}
              >
                <span className="menu-icon" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                Voices
              </button>
              <div
                className="edit-tool-group"
                role="toolbar"
                aria-label="Edit commands"
              >
                <button
                  type="button"
                  title="Undo"
                  aria-label="Undo"
                  disabled={!scene.projectStore.canUndo()}
                  onClick={handleUndo}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m9 7-5 5 5 5" />
                    <path d="M5 12h8a6 6 0 0 1 6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Redo"
                  aria-label="Redo"
                  disabled={!scene.projectStore.canRedo()}
                  onClick={handleRedo}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m15 7 5 5-5 5" />
                    <path d="M19 12h-8a6 6 0 0 0-6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Copy selected notes"
                  aria-label="Copy selected notes"
                  disabled={!selectionAvailable}
                  onClick={handleCopy}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="8" y="8" width="11" height="11" rx="2" />
                    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Cut selected notes"
                  aria-label="Cut selected notes"
                  disabled={!selectionAvailable}
                  onClick={handleCut}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="6" cy="7" r="3" />
                    <circle cx="6" cy="17" r="3" />
                    <path d="m8.7 8.4 10.3 6.2" />
                    <path d="m8.7 15.6 10.3-6.2" />
                  </svg>
                </button>
                <button
                  className="delete-notes-button"
                  type="button"
                  title="Delete selected notes"
                  aria-label="Delete selected notes"
                  disabled={!selectionAvailable}
                  onClick={handleDeleteSelection}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h16" />
                    <path d="m9 7 .7-2h4.6l.7 2" />
                    <path d="m6.5 7 .8 13h9.4l.8-13" />
                    <path d="M10 11v5M14 11v5" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Paste notes at the playhead"
                  aria-label="Paste notes at the playhead"
                  disabled={
                    !clipboardAvailable
                  }
                  onClick={handlePaste}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 5h6" />
                    <path d="M10 3h4a2 2 0 0 1 2 2v2H8V5a2 2 0 0 1 2-2Z" />
                    <path d="M8 5H6a2 2 0 0 0-2 2v13h12" />
                    <rect x="10" y="9" width="10" height="11" rx="2" />
                  </svg>
                </button>
                <button
                  className={
                    `note-color-toggle${
                      noteColorMode === "pitch"
                        ? " is-pitch-mode"
                        : ""
                    }`
                  }
                  type="button"
                  title={
                    noteColorMode === "voice"
                      ? "Color notes by voice"
                      : "Color notes by pitch"
                  }
                  aria-label={
                    noteColorMode === "voice"
                      ? "Color notes by voice"
                      : "Color notes by pitch"
                  }
                  aria-pressed={noteColorMode === "pitch"}
                  onClick={handleNoteColorModeToggle}
                >
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path d="M10 2a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 0-3.6h-.6a1.3 1.3 0 0 1 0-2.6H13A5 5 0 0 0 18 7c0-2.8-3.6-5-8-5Z" />
                    <circle cx="6" cy="7" r="1" />
                    <circle cx="9.5" cy="5" r="1" />
                    <circle cx="13" cy="6.5" r="1" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="project-summary">
              <span>
                <i className="summary-dot" />
                <span ref={noteCountLabelRef}>
                  {DEMO_NOTE_COUNT.toLocaleString()} indexed notes
                </span>
              </span>
              <span>960 PPQN</span>
            </div>
          </div>

          <div className="roll-frame">
            <PianoKeyboard
              viewport={scene.viewport}
              onPitchSelect={handlePitchSelect}
            />
            <div ref={stageRef} className="roll-stage">
              <BarRuler
                viewport={scene.viewport}
                projectStore={scene.projectStore}
                gridResolutionTicks={scene.gridResolutionTicks}
                playheadTick={scene.playheadTick}
              />
              <ProjectLengthControls
                measureCount={projectState.measureCount}
                viewport={scene.viewport}
                projectStore={scene.projectStore}
                onInsertAfter={handleInsertMeasure}
                onRemove={handleRemoveMeasure}
              />
              <div className="canvas-host">
                <PianoRollLayers
                  viewport={scene.viewport}
                  visibleRegion={scene.visibleRegion}
                  spatialIndex={scene.spatialIndex}
                  voiceStyles={scene.voiceStyles}
                  noteColorMode={scene.noteColorMode}
                  projectStore={scene.projectStore}
                  toolState={scene.interactionToolState}
                  activeVoiceId={selectedVoiceId ?? ""}
                  totalTicks={totalTicks}
                  setViewport={publishViewport}
                  gridResolutionTicks={scene.gridResolutionTicks}
                  voiceSelectionRequest={
                    scene.voiceSelectionRequest
                  }
                  eventControllerRef={
                    pianoRollEventControllerRef
                  }
                  onSelectionChange={handleSelectionChange}
                />
              </div>
              <RollPlayhead
                viewport={scene.viewport}
                playheadTick={scene.playheadTick}
              />
            </div>
          </div>

          <div className="view-controls">
            <div className="timeline-position">
              <output ref={barLabelRef}>Bar 1</output>
              <output ref={playheadPositionLabelRef}>
                Play 2.1.1
              </output>
            </div>
            <input
              ref={scrollInputRef}
              className="timeline-range"
              type="range"
              min="0"
              step="48"
              defaultValue="0"
              aria-label="Horizontal timeline position"
            />
            <div className="zoom-control">
              <span aria-hidden="true">−</span>
              <input
                ref={zoomInputRef}
                type="range"
                min={MINIMUM_HORIZONTAL_ZOOM}
                max={MAXIMUM_HORIZONTAL_ZOOM}
                step="0.05"
                defaultValue="1"
                aria-label="Horizontal zoom"
              />
              <span aria-hidden="true">+</span>
              <output ref={zoomLabelRef}>100%</output>
            </div>
            <div className="pitch-control">
              <span>Pitch</span>
              <input
                ref={pitchScrollInputRef}
                className="pitch-scroll-range"
                type="range"
                min="0"
                max="1404"
                step="4"
                defaultValue={String(
                  (127 - INITIAL_MAX_VISIBLE_PITCH)
                  * INITIAL_PITCH_HEIGHT,
                )}
                aria-label="Vertical pitch position"
              />
              <span>Y</span>
              <input
                ref={pitchZoomInputRef}
                className="pitch-zoom-range"
                type="range"
                min={MINIMUM_VERTICAL_ZOOM}
                max={MAXIMUM_VERTICAL_ZOOM}
                step="0.05"
                defaultValue="1"
                aria-label="Vertical pitch zoom"
              />
              <output ref={pitchZoomLabelRef}>100%</output>
            </div>
            <button
              className="reset-button"
              type="button"
              onClick={handleResetView}
            >
              Reset view
            </button>
          </div>
        </div>

        <aside
          id="voice-inspector"
          className={`inspector${inspectorOpen ? " is-open" : ""}`}
        >
          <div className="inspector-heading">
            <div>
              <small>Arrangement</small>
              <h1>Voices</h1>
            </div>
            <div className="inspector-heading-actions">
              <button
                className="inspector-close-button"
                type="button"
                aria-label="Close voices"
                onClick={() => setInspectorOpen(false)}
              >
                ×
              </button>
              <button
                className="add-button"
                type="button"
                aria-label="Add voice"
                onClick={handleAddVoice}
              >
                +
              </button>
            </div>
          </div>

          <div className="voice-list">
            {projectState.voiceOrder.map((voiceId) => {
              const voice = projectState.voicesById[voiceId];

              if (voice === undefined) {
                return null;
              }

              return (
                <article
                  className={
                    `voice-card${
                      voice.id === selectedVoiceId
                        ? " is-selected"
                        : ""
                    }${voice.muted ? " is-muted" : ""}${
                      voice.locked ? " is-locked" : ""
                    }`
                  }
                  key={voice.id}
                  style={{
                    "--voice-color": voice.color,
                  } as React.CSSProperties}
                  onClick={() => handleVoiceSelect(voice.id)}
                >
                  <label
                    className="voice-color-control"
                    aria-label={`Color for ${voice.name}`}
                    title="Change voice color"
                  >
                    <span className="voice-color" />
                    <input
                      type="color"
                      value={voice.color}
                      onChange={(event) => {
                        handleUpdateVoice(
                          voice.id,
                          {
                            color: event.currentTarget.value,
                          },
                          "Update voice color",
                        );
                      }}
                    />
                  </label>
                  <div className="voice-copy">
                    <input
                      className="voice-name-input"
                      type="text"
                      defaultValue={voice.name}
                      aria-label={`Name for ${voice.name}`}
                      onBlur={(event) => {
                        const name = event.currentTarget.value.trim();

                        if (name.length === 0) {
                          event.currentTarget.value = voice.name;
                        } else if (name !== voice.name) {
                          handleUpdateVoice(
                            voice.id,
                            {
                              name,
                            },
                            "Rename voice",
                          );
                        }
                      }}
                    />
                    <span>{getVoiceInstrumentLabel(voice)}</span>
                  </div>
                  <div className="voice-wave">
                    {getVoiceWaveform(voice)}
                  </div>
                  <div className="voice-actions">
                    <button
                      className="voice-select-all-button"
                      type="button"
                      aria-label={`Select all notes from ${voice.name}`}
                      title="Select all notes"
                      disabled={voice.locked}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleSelectVoiceNotes(voice.id);
                      }}
                    >
                      All
                    </button>
                    <button
                      className={
                        voice.locked
                          ? "voice-lock-button is-active"
                          : "voice-lock-button"
                      }
                      type="button"
                      aria-label={`${voice.locked ? "Unlock" : "Lock"} ${voice.name}`}
                      aria-pressed={voice.locked}
                      title={voice.locked ? "Unlock voice" : "Lock voice"}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggleVoiceLock(voice);
                      }}
                    >
                      <svg
                        className="voice-lock-icon"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                      >
                        <path d="M6 8V6a4 4 0 0 1 8 0v2" />
                        <rect
                          x="4"
                          y="8"
                          width="12"
                          height="9"
                          rx="2"
                        />
                      </svg>
                    </button>
                    <button
                      className={
                        voice.muted
                          ? "voice-mute-button is-active"
                          : "voice-mute-button"
                      }
                      type="button"
                      aria-label={`${voice.muted ? "Unmute" : "Mute"} ${voice.name}`}
                      aria-pressed={voice.muted}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleUpdateVoice(
                          voice.id,
                          {
                            muted: !voice.muted,
                          },
                          voice.muted ? "Unmute voice" : "Mute voice",
                        );
                      }}
                    >
                      M
                    </button>
                    <button
                      className="voice-delete-button"
                      type="button"
                      aria-label={`Delete ${voice.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteVoice(voice.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                </article>
              );
            })}
            {projectState.voiceOrder.length === 0 ? (
              <p className="voice-empty-state">
                Add a voice to start drawing notes.
              </p>
            ) : null}
          </div>

          {selectedVoice === undefined ? (
            <section className="instrument-card is-empty">
              <div className="section-title">
                <div>
                  <small>Instrument</small>
                  <strong>No voice selected</strong>
                </div>
              </div>
            </section>
          ) : (
            <section
              className="instrument-card"
              style={{
                "--voice-color": selectedVoice.color,
              } as React.CSSProperties}
            >
              <div className="section-title">
                <div>
                  <small>Instrument · {selectedVoice.name}</small>
                  <strong>
                    {getVoiceInstrumentLabel(selectedVoice)}
                  </strong>
                </div>
                <span className="live-pill">
                  {getVoiceWaveform(selectedVoice)}
                </span>
              </div>

              <div className="wave-display" aria-hidden="true">
                <svg viewBox="0 0 240 54" preserveAspectRatio="none">
                  <path d={getWaveformPath(selectedVoice)} />
                </svg>
              </div>

              <div className="parameter-grid">
                <ParameterDial
                  label="Attack"
                  value={formatEnvelopeTime(
                    selectedVoice.instrument.envelope.attackSeconds,
                  )}
                  level={formatParameterLevel(
                    selectedVoice.instrument.envelope.attackSeconds,
                    2,
                  )}
                />
                <ParameterDial
                  label="Decay"
                  value={formatEnvelopeTime(
                    selectedVoice.instrument.envelope.decaySeconds,
                  )}
                  level={formatParameterLevel(
                    selectedVoice.instrument.envelope.decaySeconds,
                    2,
                  )}
                />
                <ParameterDial
                  label="Sustain"
                  value={
                    `${Math.round(
                      selectedVoice.instrument.envelope.sustainLevel
                      * 100,
                    )}%`
                  }
                  level={
                    `${Math.round(
                      selectedVoice.instrument.envelope.sustainLevel
                      * 100,
                    )}%`
                  }
                />
                <ParameterDial
                  label="Release"
                  value={formatEnvelopeTime(
                    selectedVoice.instrument.envelope.releaseSeconds,
                  )}
                  level={formatParameterLevel(
                    selectedVoice.instrument.envelope.releaseSeconds,
                    2,
                  )}
                />
              </div>
            </section>
          )}

          <section className="routing-card">
            <div className="section-title">
              <div>
                <small>Output</small>
                <strong>Master bus</strong>
              </div>
              <span>−3.2 dB</span>
            </div>
            <div className="meter">
              <span style={{ width: "68%" }} />
            </div>
          </section>

        </aside>
      </section>
    </main>
  );
}

function buildDeleteCommandsForNotes(
  notes: readonly Note[],
): readonly PianoRollCommand[] {
  const noteIdsByVoice = new Map<VoiceId, NoteId[]>();

  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    let noteIds = noteIdsByVoice.get(note.voiceId);

    if (noteIds === undefined) {
      noteIds = [];
      noteIdsByVoice.set(note.voiceId, noteIds);
    }

    noteIds.push(note.id);
  }

  const commands: PianoRollCommand[] = [];

  for (const [voiceId, noteIds] of noteIdsByVoice) {
    commands.push({
      type: "DeleteNotes",
      trackVoiceId: voiceId,
      noteIds,
    });
  }

  return commands;
}

function buildAddCommandsForNotes(
  notes: readonly Note[],
): readonly PianoRollCommand[] {
  const notesByVoice = new Map<VoiceId, Note[]>();

  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    let voiceNotes = notesByVoice.get(note.voiceId);

    if (voiceNotes === undefined) {
      voiceNotes = [];
      notesByVoice.set(note.voiceId, voiceNotes);
    }

    voiceNotes.push(note);
  }

  const commands: PianoRollCommand[] = [];

  for (const [voiceId, voiceNotes] of notesByVoice) {
    commands.push({
      type: "AddNotes",
      trackVoiceId: voiceId,
      notes: voiceNotes,
    });
  }

  return commands;
}

function createPastedNotes(
  clipboard: PianoRollClipboard,
  pasteTick: number,
  timestamp: number,
  sequence: number,
): readonly Note[] {
  const notes: Note[] = [];

  for (
    let noteIndex = 0;
    noteIndex < clipboard.notes.length;
    noteIndex += 1
  ) {
    const sourceNote = clipboard.notes[noteIndex];

    if (sourceNote === undefined) {
      continue;
    }

    notes.push({
      ...sourceNote,
      id:
        `${sourceNote.id}-copy-${timestamp}-${sequence}-${noteIndex}`,
      startTick:
        pasteTick
        + sourceNote.startTick
        - clipboard.originTick,
    });
  }

  return notes;
}

function canPasteNotes(
  state: ProjectState,
  notes: readonly Note[],
): boolean {
  const totalTicks = getProjectDurationTicks(state);

  for (
    let noteIndex = 0;
    noteIndex < notes.length;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    const voice = state.voicesById[note.voiceId];
    const track = state.tracksByVoiceId[note.voiceId];

    if (
      voice === undefined
      || voice.locked
      || track === undefined
      || note.startTick < 0
      || note.startTick + note.durationTicks > totalTicks
    ) {
      return false;
    }

    for (const existingNoteId in track.notesById) {
      const existingNote = track.notesById[existingNoteId];

      if (
        existingNote !== undefined
        && notesOverlap(note, existingNote)
      ) {
        return false;
      }
    }

    for (
      let candidateIndex = 0;
      candidateIndex < noteIndex;
      candidateIndex += 1
    ) {
      const candidate = notes[candidateIndex];

      if (
        candidate !== undefined
        && notesOverlap(note, candidate)
      ) {
        return false;
      }
    }
  }

  return notes.length > 0;
}

function notesOverlap(left: Note, right: Note): boolean {
  return (
    left.voiceId === right.voiceId
    && left.pitch === right.pitch
    && left.startTick
      < right.startTick + right.durationTicks
    && right.startTick
      < left.startTick + left.durationTicks
  );
}

const USER_VOICE_COLORS = [
  "#79a7ff",
  "#a77bf3",
  "#ff9b71",
  "#62d6b4",
  "#f0c66f",
  "#f17ca8",
] as const;

function createUserVoice(
  voiceIndex: number,
  sequence: number,
): Voice {
  const color =
    USER_VOICE_COLORS[voiceIndex % USER_VOICE_COLORS.length]
    ?? "#79a7ff";
  const waveformIndex = voiceIndex % 4;
  const oscillatorWaveform =
    waveformIndex === 0
      ? "sawtooth"
      : waveformIndex === 1
        ? "sine"
        : waveformIndex === 2
          ? "square"
          : "triangle";

  return {
    id: `voice-${Date.now()}-${sequence + 1}`,
    name: `Voice ${voiceIndex + 1}`,
    color,
    muted: false,
    locked: false,
    solo: false,
    gain: 0.82,
    pan: 0,
    instrument: {
      kind: "subtractive",
      oscillatorWaveform,
      oscillatorDetuneCents: 0,
      envelope: {
        attackSeconds: 0.012,
        decaySeconds: 0.18,
        sustainLevel: 0.72,
        releaseSeconds: 0.42,
      },
      filterCutoffHz: 12_000,
      filterResonance: 0.2,
    },
    effects: [],
    generativeRules: [],
    interpretation: {
      transposeSemitones: 0,
      timingOffsetTicks: 0,
      gateRatio: 1,
      velocityScale: 1,
      probability: 1,
    },
  };
}

function getVoiceInstrumentLabel(voice: Voice): string {
  return voice.instrument.kind === "subtractive"
    ? "Subtractive"
    : "FM";
}

function getVoiceWaveform(voice: Voice): OscillatorWaveform {
  return voice.instrument.kind === "subtractive"
    ? voice.instrument.oscillatorWaveform
    : voice.instrument.carrierWaveform;
}

function getWaveformPath(voice: Voice): string {
  switch (getVoiceWaveform(voice)) {
    case "sine":
      return "M0 27 C20 4 40 4 60 27 S100 50 120 27 S160 4 180 27 S220 50 240 27";
    case "square":
      return "M0 42 L0 12 L60 12 L60 42 L120 42 L120 12 L180 12 L180 42 L240 42";
    case "triangle":
      return "M0 42 L60 12 L120 42 L180 12 L240 42";
    case "sawtooth":
      return "M0 42 L60 12 L60 42 L120 12 L120 42 L180 12 L180 42 L240 12";
  }
}

function formatEnvelopeTime(seconds: number): string {
  if (seconds < 1) {
    return `${Math.round(seconds * 1_000)} ms`;
  }

  return `${seconds.toFixed(2)} s`;
}

function formatParameterLevel(
  value: number,
  maximum: number,
): string {
  return `${Math.round(
    Math.min(1, Math.max(0, value / maximum)) * 100,
  )}%`;
}

interface PianoKeyboardProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly onPitchSelect?: (pitch: number) => void;
}

interface TransportMetricsProps {
  readonly projectStore: DemoScene["projectStore"];
  readonly gridResolutionTicks: DemoScene["gridResolutionTicks"];
}

type GridSubdivision = "straight" | "triplet" | "dotted";

function TransportMetrics(
  props: TransportMetricsProps,
): React.JSX.Element {
  const {
    projectStore,
    gridResolutionTicks,
  } = props;
  const tempoInputRef = useRef<HTMLInputElement | null>(null);
  const meterSelectRef = useRef<HTMLSelectElement | null>(null);
  const gridSelectRef = useRef<HTMLSelectElement | null>(null);
  const subdivisionSelectRef =
    useRef<HTMLSelectElement | null>(null);
  const gridBaseResolutionRef = useRef(240);
  const gridSubdivisionRef =
    useRef<GridSubdivision>("straight");
  const transactionSequenceRef = useRef(0);

  useEffect(() => {
    const updateTransportControls = (): void => {
      const transport = projectStore.getState().transportSettings;

      if (
        tempoInputRef.current !== null
        && document.activeElement !== tempoInputRef.current
      ) {
        tempoInputRef.current.value =
          transport.bpm.toFixed(1);
      }

      if (meterSelectRef.current !== null) {
        meterSelectRef.current.value =
          `${transport.timeSignature.numerator}/${transport.timeSignature.denominator}`;
      }
    };
    const updateGridControl = (): void => {
      if (gridSelectRef.current !== null) {
        gridSelectRef.current.value = String(
          gridBaseResolutionRef.current,
        );
      }

      if (subdivisionSelectRef.current !== null) {
        subdivisionSelectRef.current.value =
          gridSubdivisionRef.current;
      }
    };
    const unsubscribeProject = projectStore.subscribe(
      updateTransportControls,
    );
    const unsubscribeGrid = gridResolutionTicks.subscribe(
      updateGridControl,
    );

    updateTransportControls();
    updateGridControl();

    return (): void => {
      unsubscribeProject();
      unsubscribeGrid();
    };
  }, [
    gridResolutionTicks,
    projectStore,
  ]);

  const dispatchCommand = useCallback(
    (
      command: PianoRollCommand,
      label: string,
    ): void => {
      transactionSequenceRef.current += 1;
      const transaction: Transaction = {
        transactionId:
          `transport-${Date.now()}-${transactionSequenceRef.current}`,
        label,
        createdAt: Date.now(),
        commands: [command],
      };

      projectStore.dispatch(transaction);
    },
    [projectStore],
  );

  const handleTempoCommit = useCallback(
    (event: FocusEvent<HTMLInputElement>): void => {
      const requestedBpm = event.currentTarget.valueAsNumber;

      if (!Number.isFinite(requestedBpm)) {
        event.currentTarget.value =
          projectStore
            .getState()
            .transportSettings
            .bpm
            .toFixed(1);
        return;
      }

      const bpm = Math.min(
        240,
        Math.max(
          30,
          Math.round(requestedBpm * 10) / 10,
        ),
      );

      event.currentTarget.value = bpm.toFixed(1);
      dispatchCommand(
        {
          type: "UpdateTempo",
          bpm,
        },
        "Update tempo",
      );
    },
    [
      dispatchCommand,
      projectStore,
    ],
  );
  const handleTempoKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === "Enter") {
        event.currentTarget.blur();
      }
    },
    [],
  );

  const handleMeterChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const timeSignature = parseTimeSignature(
        event.currentTarget.value,
      );

      if (timeSignature === null) {
        return;
      }

      dispatchCommand(
        {
          type: "UpdateTimeSignature",
          timeSignature,
        },
        "Update meter",
      );
    },
    [dispatchCommand],
  );

  const handleGridChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const baseResolutionTicks = Number(
        event.currentTarget.value,
      );

      if (
        Number.isSafeInteger(baseResolutionTicks)
        && baseResolutionTicks > 0
      ) {
        gridBaseResolutionRef.current = baseResolutionTicks;
        gridResolutionTicks.set(
          calculateSubdivisionTicks(
            baseResolutionTicks,
            gridSubdivisionRef.current,
          ),
        );
      }
    },
    [gridResolutionTicks],
  );
  const handleSubdivisionChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const subdivision = parseGridSubdivision(
        event.currentTarget.value,
      );

      if (subdivision === null) {
        return;
      }

      gridSubdivisionRef.current = subdivision;
      gridResolutionTicks.set(
        calculateSubdivisionTicks(
          gridBaseResolutionRef.current,
          subdivision,
        ),
      );
    },
    [gridResolutionTicks],
  );

  return (
    <div className="transport-metrics" aria-label="Transport settings">
      <label className="metric">
        <small>Tempo</small>
        <input
          ref={tempoInputRef}
          className="metric-control tempo-control"
          type="number"
          min="30"
          max="240"
          step="0.1"
          defaultValue="112.0"
          inputMode="decimal"
          onBlur={handleTempoCommit}
          onKeyDown={handleTempoKeyDown}
          aria-label="Tempo in beats per minute"
        />
        <span>BPM</span>
      </label>
      <label className="metric">
        <small>Meter</small>
        <select
          ref={meterSelectRef}
          className="metric-control metric-select"
          defaultValue="4/4"
          onChange={handleMeterChange}
          aria-label="Time signature"
        >
          <option value="3/4">3 / 4</option>
          <option value="4/4">4 / 4</option>
          <option value="5/4">5 / 4</option>
          <option value="6/8">6 / 8</option>
        </select>
      </label>
      <label className="metric">
        <small>Grid</small>
        <select
          ref={gridSelectRef}
          className="metric-control metric-select"
          defaultValue="240"
          onChange={handleGridChange}
          aria-label="Grid resolution"
        >
          <option value="960">1 / 4</option>
          <option value="480">1 / 8</option>
          <option value="240">1 / 16</option>
          <option value="120">1 / 32</option>
          <option value="60">1 / 64</option>
        </select>
      </label>
      <label className="metric">
        <small>Subdivision</small>
        <select
          ref={subdivisionSelectRef}
          className="metric-control metric-select"
          defaultValue="straight"
          onChange={handleSubdivisionChange}
          aria-label="Grid subdivision"
        >
          <option value="straight">Straight</option>
          <option value="triplet">Triplet</option>
          <option value="dotted">Dotted</option>
        </select>
      </label>
    </div>
  );
}

function parseGridSubdivision(
  value: string,
): GridSubdivision | null {
  switch (value) {
    case "straight":
    case "triplet":
    case "dotted":
      return value;
    default:
      return null;
  }
}

function calculateSubdivisionTicks(
  baseResolutionTicks: number,
  subdivision: GridSubdivision,
): number {
  switch (subdivision) {
    case "triplet":
      return Math.round(baseResolutionTicks * 2 / 3);
    case "dotted":
      return Math.round(baseResolutionTicks * 3 / 2);
    case "straight":
      return baseResolutionTicks;
  }
}

function parseTimeSignature(
  value: string,
): TimeSignature | null {
  switch (value) {
    case "3/4":
      return {
        numerator: 3,
        denominator: 4,
      };
    case "4/4":
      return {
        numerator: 4,
        denominator: 4,
      };
    case "5/4":
      return {
        numerator: 5,
        denominator: 4,
      };
    case "6/8":
      return {
        numerator: 6,
        denominator: 8,
      };
    default:
      return null;
  }
}

interface BarRulerProps extends PianoKeyboardProps {
  readonly projectStore: DemoScene["projectStore"];
  readonly gridResolutionTicks: DemoScene["gridResolutionTicks"];
  readonly playheadTick: DemoScene["playheadTick"];
}

function BarRuler(
  props: BarRulerProps,
): React.JSX.Element {
  const {
    viewport,
    projectStore,
    gridResolutionTicks,
    playheadTick,
  } = props;
  const paintRuler = useCallback(
    (frame: CanvasFrame): void => {
      const currentViewport = viewport.get();
      const projectState = projectStore.getState();
      const transport = projectState.transportSettings;
      const totalTicks = getProjectDurationTicks(projectState);
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

      context.fillStyle = "#191c22";
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
        "#343b47",
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
        "#4a5464",
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
        "#667388",
      );

      context.fillStyle = "#8b96a7";
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
      const maximumBarIndex = projectState.measureCount - 1;

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

    const updatePlayhead = (clientX: number): void => {
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

      playheadTick.set(
        Math.min(
          getProjectDurationTicks(projectStore.getState()),
          Math.max(0, snappedTick),
        ),
      );
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }

      activePointerId = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
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

      updatePlayhead(event.clientX);
      activePointerId = -1;

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }

      event.preventDefault();
    };
    const cancelPointer = (event: PointerEvent): void => {
      if (event.pointerId === activePointerId) {
        activePointerId = -1;
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
    playheadTick,
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

interface ProjectLengthControlsProps {
  readonly measureCount: number;
  readonly viewport: DemoScene["viewport"];
  readonly projectStore: DemoScene["projectStore"];
  readonly onInsertAfter: (measureIndex: number) => void;
  readonly onRemove: (measureIndex: number) => void;
}

function ProjectLengthControls(
  props: ProjectLengthControlsProps,
): React.JSX.Element {
  const {
    measureCount,
    viewport,
    projectStore,
    onInsertAfter,
    onRemove,
  } = props;
  const controlsRef = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const updatePositions = (): void => {
      const currentViewport = viewport.get();
      const projectState = projectStore.getState();
      const measureTicks = getTicksPerMeasure(
        projectState.transportSettings,
      );
      const pixelsPerTick =
        currentViewport.zoomX / currentViewport.ticksPerPixel;
      const stageWidth =
        controlsRef.current[0]?.parentElement?.clientWidth
        ?? Number.POSITIVE_INFINITY;

      for (
        let measureIndex = 0;
        measureIndex < controlsRef.current.length;
        measureIndex += 1
      ) {
        const controls = controlsRef.current[measureIndex];

        if (controls === null || controls === undefined) {
          continue;
        }

        const x =
          (measureIndex + 1) * measureTicks * pixelsPerTick
          - currentViewport.scrollX;
        const visible = x >= 42 && x <= stageWidth;

        if (visible) {
          if (controls.style.display === "none") {
            controls.style.display = "flex";
          }

          controls.style.transform =
            `translate3d(${x - 42}px, 0, 0)`;
        } else if (controls.style.display !== "none") {
          controls.style.display = "none";
        }
      }
    };
    const unsubscribeViewport = viewport.subscribe(
      updatePositions,
    );
    const unsubscribeProject =
      projectStore.subscribe(updatePositions);

    updatePositions();

    return (): void => {
      unsubscribeViewport();
      unsubscribeProject();
    };
  }, [
    measureCount,
    projectStore,
    viewport,
  ]);

  controlsRef.current.length = measureCount;
  const controls: React.JSX.Element[] = [];

  for (
    let measureIndex = 0;
    measureIndex < measureCount;
    measureIndex += 1
  ) {
    controls.push(
      <div
        key={measureIndex}
        ref={(element) => {
          controlsRef.current[measureIndex] = element;
        }}
        className="project-length-controls"
        aria-label={`Measure ${measureIndex + 1} controls`}
      >
        <button
          type="button"
          aria-label={`Remove measure ${measureIndex + 1}`}
          title={`Remove measure ${measureIndex + 1}`}
          disabled={measureCount <= MINIMUM_MEASURE_COUNT}
          onClick={() => {
            onRemove(measureIndex);
          }}
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Insert a measure after measure ${measureIndex + 1}`}
          title={`Insert after measure ${measureIndex + 1}`}
          disabled={measureCount >= MAXIMUM_MEASURE_COUNT}
          onClick={() => {
            onInsertAfter(measureIndex);
          }}
        >
          +
        </button>
      </div>,
    );
  }

  return (
    <div
      className="project-length-controls-layer"
      aria-label={`${measureCount} measure timeline controls`}
    >
      {controls}
    </div>
  );
}

interface RollPlayheadProps {
  readonly viewport: DemoScene["viewport"];
  readonly playheadTick: DemoScene["playheadTick"];
}

function RollPlayhead(
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

function PianoKeyboard(
  props: PianoKeyboardProps,
): React.JSX.Element {
  const {
    viewport,
    onPitchSelect,
  } = props;
  const keysElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateKeyboard = (): void => {
      const element = keysElementRef.current;

      if (element === null) {
        return;
      }

      const currentViewport = viewport.get();
      const rowHeight =
        currentViewport.pitchHeight * currentViewport.zoomY;

      element.style.setProperty(
        "--pitch-row-height",
        `${rowHeight}px`,
      );
      element.style.transform =
        `translate3d(0, ${-currentViewport.scrollY}px, 0)`;
    };
    const unsubscribe = viewport.subscribe(updateKeyboard);

    updateKeyboard();
    return unsubscribe;
  }, [viewport]);

  useEffect(() => {
    const element = keysElementRef.current;

    if (element === null || onPitchSelect === undefined) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }

      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-pitch]")
          : null;
      const pitch = Number(target?.dataset["pitch"]);

      if (Number.isInteger(pitch)) {
        onPitchSelect(pitch);
        event.preventDefault();
      }
    };

    element.addEventListener("pointerdown", handlePointerDown);

    return (): void => {
      element.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
    };
  }, [onPitchSelect]);

  return (
    <div className="piano-strip" aria-label="Piano keyboard">
      <div ref={keysElementRef} className="piano-keys-inner">
        {PIANO_KEYS}
      </div>
    </div>
  );
}

interface ParameterDialProps {
  readonly label: string;
  readonly value: string;
  readonly level: string;
}

function ParameterDial(props: ParameterDialProps): React.JSX.Element {
  const {
    label,
    value,
    level,
  } = props;

  return (
    <div className="parameter">
      <div
        className="parameter-track"
        style={{
          "--parameter-level": level,
        } as React.CSSProperties}
      >
        <i />
      </div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function createPianoKeys(): readonly React.JSX.Element[] {
  const keys: React.JSX.Element[] = [];

  for (
    let pitch = 127;
    pitch >= 0;
    pitch -= 1
  ) {
    const pitchClass = pitch % 12;
    const black =
      pitchClass === 1
      || pitchClass === 3
      || pitchClass === 6
      || pitchClass === 8
      || pitchClass === 10;
    const octave = Math.floor(pitch / 12) - 1;
    const label = pitchClass === 0 ? `C${octave}` : "";
    const pitchName =
      `${getPitchClassName(pitchClass)}${octave}`;

    keys.push(
      <button
        type="button"
        className={`piano-key${black ? " is-black" : ""}`}
        data-pitch={pitch}
        aria-label={`Select ${pitchName} notes`}
        key={pitch}
      >
        {label}
      </button>,
    );
  }

  return keys;
}

function getPitchClassName(pitchClass: number): string {
  return PITCH_CLASS_NAMES[pitchClass] ?? "Unknown";
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

function updateBarOutput(
  output: HTMLOutputElement | null,
  viewport: ViewportState,
  ticksPerBar: number,
): void {
  if (output === null) {
    return;
  }

  const tick =
    viewport.scrollX
    * viewport.ticksPerPixel
    / viewport.zoomX;

  output.value = `Bar ${Math.floor(tick / ticksPerBar) + 1}`;
}

function getTicksPerBar(
  transport: TransportState,
): number {
  return (
    transport.ppqn
    * 4
    * transport.timeSignature.numerator
    / transport.timeSignature.denominator
  );
}

function collapseTickForRemovedMeasure(
  tick: number,
  removalStartTick: number,
  removalEndTick: number,
): number {
  if (tick <= removalStartTick) {
    return tick;
  }

  if (tick >= removalEndTick) {
    return tick - removalEndTick + removalStartTick;
  }

  return removalStartTick;
}

function formatMusicalPosition(
  tick: number,
  transport: TransportState,
  gridResolutionTicks: number,
): string {
  const safeTick = Math.max(0, Math.round(tick));
  const ticksPerBeat =
    transport.ppqn
    * 4
    / transport.timeSignature.denominator;
  const ticksPerBar =
    ticksPerBeat * transport.timeSignature.numerator;
  const barIndex = Math.floor(safeTick / ticksPerBar);
  const tickInBar = safeTick - barIndex * ticksPerBar;
  const beatIndex = Math.floor(tickInBar / ticksPerBeat);
  const tickInBeat = tickInBar - beatIndex * ticksPerBeat;
  const subdivisionIndex = Math.floor(
    tickInBeat / Math.max(1, gridResolutionTicks),
  );

  return (
    `Play ${barIndex + 1}.${beatIndex + 1}.`
    + `${subdivisionIndex + 1}`
  );
}

function getMaximumVerticalScroll(
  viewport: ViewportState,
  viewportHeight: number,
): number {
  return Math.max(
    0,
    128 * viewport.pitchHeight * viewport.zoomY - viewportHeight,
  );
}

function countProjectNotes(
  state: ReturnType<DemoScene["projectStore"]["getState"]>,
): number {
  let count = 0;

  for (
    let voiceIndex = 0;
    voiceIndex < state.voiceOrder.length;
    voiceIndex += 1
  ) {
    const voiceId = state.voiceOrder[voiceIndex];

    if (voiceId !== undefined) {
      const track = state.tracksByVoiceId[voiceId];

      if (track !== undefined) {
        count += Object.keys(track.notesById).length;
      }
    }
  }

  return count;
}
