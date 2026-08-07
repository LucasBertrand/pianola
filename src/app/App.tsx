import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createPortal,
} from "react-dom";
import {
  APPLICATION_CONSTANTS,
  EDITOR_CONSTANTS,
  TONAL_SNAP_CONSTANTS,
  VIEWPORT_CONSTANTS,
} from "../config/program-constants";
import {
  APPLICATION_COLORS,
} from "../config/application-colors";
import type {
  NoteCollisionResolutionRequest,
} from "../application/note-collision-resolution";
import {
  type PianoRollCommand,
} from "../domain/commands";
import type {
  LoopRegion,
  ProjectState,
  TransportState,
  VoiceId,
} from "../domain/model";
import {
  getProjectDurationTicks,
  getTicksPerMeasure,
  MAXIMUM_MEASURE_COUNT,
  MINIMUM_MEASURE_COUNT,
} from "../domain/model";
import {
  createNoteCollisionResolutionPlan,
  type NoteCollisionResolutionMode,
} from "../domain/note-collision";
import {
  MAXIMUM_HORIZONTAL_ZOOM,
  MAXIMUM_VERTICAL_ZOOM,
  MINIMUM_HORIZONTAL_ZOOM,
  MINIMUM_VERTICAL_ZOOM,
  type ViewportState,
} from "../geometry/converter";
import {
  type MidiImportAnalysis,
} from "../midi/midi-importer";
import {
  MAXIMUM_NATIVE_PROJECT_TITLE_LENGTH,
  type NativeEditorState,
} from "../persistence/native-project-file";
import {
  ApplicationDialogOverlay,
  type ApplicationDialogState,
  type ApplicationDialogTone,
} from "../ui/components/ApplicationDialogOverlay";
import {
  PianoRollLayers,
} from "../ui/components/PianoRollLayers";
import {
  TransportMetrics,
} from "../ui/components/TransportMetrics";
import {
  TransportControls,
} from "../ui/components/TransportControls";
import {
  ProjectFileMenu,
} from "../ui/components/ProjectFileMenu";
import {
  BarRuler,
  RollPlayhead,
  TimelineLoopRegion,
} from "../ui/components/Timeline";
import {
  MasterGainControl,
} from "../ui/components/MasterGainControl";
import {
  PianoKeyboard,
} from "../ui/components/PianoKeyboard";
import {
  EditorToolbar,
} from "../ui/components/EditorToolbar";
import {
  GeneralInspector,
} from "../ui/components/GeneralInspector";
import {
  useAudioPlayback,
} from "../ui/hooks/useAudioPlayback";
import type {
  PianoRollEventController,
} from "../interaction/piano-roll-event-controller";
import {
  getScaleDegreeColorIndex,
  getTonalPatternDefinition,
  isTonalPatternId,
  type PitchSnapSettings,
} from "../music/pitch-snap";
import {
  getPreferredTonicLabel,
  getScaleDegreeLabel,
} from "../ui/rendering/pitch-label";
import type {
  SelectionMode,
} from "../interaction/core/state";
import type {
  NoteColorMode,
} from "../ui/rendering/note-style";
import {
  createDemoProjectState,
} from "./demo-scene";
import {
  createEditorRuntime,
  INITIAL_MAX_VISIBLE_PITCH,
  INITIAL_PITCH_HEIGHT,
  type EditorRuntime,
} from "./editor-runtime";
import {
  calculateVisibleRegion,
} from "../geometry/visible-region";
import {
  useVoiceWorkflow,
} from "./workflows/useVoiceWorkflow";
import {
  useSelectionWorkflow,
} from "./workflows/useSelectionWorkflow";
import {
  useProjectFileWorkflow,
} from "./workflows/useProjectFileWorkflow";
import {
  useMidiFileWorkflow,
} from "./workflows/useMidiFileWorkflow";
import type {
  ApplicationConfirmationOptions,
} from "./workflows/dialog-types";

interface ViewportDimensions {
  width: number;
  height: number;
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

export function App(): React.JSX.Element {
  const sceneRef = useRef<EditorRuntime | null>(null);
  const appShellRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const zoomInputRef = useRef<HTMLInputElement | null>(null);
  const scrollInputRef = useRef<HTMLInputElement | null>(null);
  const pitchScrollInputRef = useRef<HTMLInputElement | null>(null);
  const pitchZoomInputRef = useRef<HTMLInputElement | null>(null);
  const zoomLabelRef = useRef<HTMLOutputElement | null>(null);
  const pitchZoomLabelRef = useRef<HTMLOutputElement | null>(null);
  const barLabelRef = useRef<HTMLOutputElement | null>(null);
  const pianoRollEventControllerRef =
    useRef<PianoRollEventController | null>(null);
  const editTransactionSequenceRef = useRef(0);
  const pendingMidiImportRef =
    useRef<MidiImportAnalysis | null>(null);
  const dimensionsRef = useRef<ViewportDimensions>({
    width: VIEWPORT_CONSTANTS.initialWidthCssPixels,
    height: VIEWPORT_CONSTANTS.initialHeightCssPixels,
  });

  if (sceneRef.current === null) {
    sceneRef.current = createEditorRuntime(
      createDemoProjectState(),
    );
  }

  const scene = sceneRef.current;

  const [projectState, setProjectState] = useState(
    () => scene.projectStore.getState(),
  );
  const [selectedVoiceId, setSelectedVoiceId] =
    useState<VoiceId | null>(
      () => scene.projectStore.getState().voiceOrder[0] ?? null,
    );
  const [generalInspectorOpen, setGeneralInspectorOpen] =
    useState(false);
  const [
    generalInspectorToolbarHost,
    setGeneralInspectorToolbarHost,
  ] = useState<HTMLDivElement | null>(null);
  const [selectionAvailable, setSelectionAvailable] =
    useState(false);
  const [selectionMode, setSelectionMode] =
    useState<SelectionMode>("replace");
  const [noteColorMode, setNoteColorMode] =
    useState<NoteColorMode>(
      () => scene.noteColorMode.get(),
    );
  const [pitchPreviewEnabled, setPitchPreviewEnabled] =
    useState<boolean>(
      EDITOR_CONSTANTS.defaultPitchPreviewEnabled,
    );
  const [pitchSnapSettings, setPitchSnapSettings] =
    useState<PitchSnapSettings>(
      () => scene.pitchSnapSettings.get(),
    );
  const [applicationDialog, setApplicationDialog] =
    useState<ApplicationDialogState | null>(null);
  const selectedVoice =
    selectedVoiceId === null
      ? undefined
      : projectState.voicesById[selectedVoiceId];
  const selectedVoiceIndex =
    selectedVoiceId === null
      ? -1
      : projectState.voiceOrder.indexOf(selectedVoiceId);

  const totalTicks = getProjectDurationTicks(projectState);
  const updatePitchSnapSettings = useCallback(
    (changes: Partial<PitchSnapSettings>): void => {
      const nextSettings: PitchSnapSettings = {
        ...scene.pitchSnapSettings.get(),
        ...changes,
      };

      scene.pitchSnapSettings.set(nextSettings);
      setPitchSnapSettings(nextSettings);
    },
    [scene],
  );
  const handleSelectionChange = useCallback(
    (
      hasSelection: boolean,
      soleVoiceId: VoiceId | null,
    ): void => {
      setSelectionAvailable(hasSelection);

      if (soleVoiceId !== null) {
        setSelectedVoiceId(soleVoiceId);
      }
    },
    [],
  );
  const handlePitchSelect = useCallback((pitch: number): void => {
    pianoRollEventControllerRef.current
      ?.togglePitchSelection(pitch);
  }, []);
  const showApplicationAlert = useCallback(
    (
      title: string,
      message: string,
      tone: ApplicationDialogTone = "default",
    ): void => {
      setApplicationDialog({
        title,
        message,
        confirmLabel: "OK",
        alternateLabel: null,
        cancelLabel: null,
        tone,
        onConfirm: null,
        onAlternate: null,
      });
    },
    [],
  );
  const showApplicationConfirmation = useCallback(
    (options: ApplicationConfirmationOptions): void => {
      setApplicationDialog({
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        alternateLabel: null,
        cancelLabel: options.cancelLabel ?? "Cancel",
        tone: options.tone ?? "default",
        onConfirm: options.onConfirm,
        onAlternate: null,
      });
    },
    [],
  );
  const handleApplicationDialogCancel =
    useCallback((): void => {
      pendingMidiImportRef.current = null;
      setApplicationDialog(null);
    }, []);
  const handleApplicationDialogConfirm =
    useCallback((): void => {
      const action = applicationDialog?.onConfirm;

      setApplicationDialog(null);
      action?.();
    }, [applicationDialog]);
  const handleApplicationDialogAlternate =
    useCallback((): void => {
      const action = applicationDialog?.onAlternate;

      setApplicationDialog(null);
      action?.();
    }, [applicationDialog]);
  const {
    status: playbackStatus,
    togglePlayback,
    stopPlayback,
    returnToStart,
    seek: seekPlayback,
    auditionPitch,
    previewVoiceGain,
    previewMasterGain,
    beginSeekGesture,
    previewSeek,
    commitSeekGesture,
  } = useAudioPlayback({
    projectStore: scene.projectStore,
    playheadTick: scene.playheadTick,
    onError(error) {
      showApplicationAlert(
        "Playback unavailable",
        formatAudioPlaybackError(error),
        "danger",
      );
    },
  });
  const handlePitchAudition = useCallback((pitch: number): void => {
    if (selectedVoiceId !== null) {
      auditionPitch(selectedVoiceId, pitch);
    }
  }, [
    auditionPitch,
    selectedVoiceId,
  ]);

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
    generalInspectorOpen,
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

      barLabelRef.current.value =
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

  const dispatchEditCommands = useCallback(
    (
      commands: readonly PianoRollCommand[],
      label: string,
    ): ProjectState | null => {
      if (commands.length === 0) {
        return null;
      }

      editTransactionSequenceRef.current += 1;
      return scene.editorCommands.dispatch(commands, label);
    },
    [scene],
  );
  const handleNoteCollision = useCallback(
    (request: NoteCollisionResolutionRequest): void => {
      const resolveCollision = (
        mode: NoteCollisionResolutionMode,
      ): void => {
        const timestamp = Date.now();
        const plan = createNoteCollisionResolutionPlan(
          scene.projectStore.getState(),
          {
            originalNotes: request.originalNotes,
            proposedNotes: request.proposedNotes,
          },
          mode,
          `${timestamp}-${editTransactionSequenceRef.current + 1}`,
        );

        try {
          const nextState = dispatchEditCommands(
            plan.commands,
            mode === "merge"
              ? `${request.label}: merge collisions`
              : `${request.label}: slice collisions`,
          );

          if (nextState !== null) {
            request.onResolved(
              nextState,
              plan.resultingSelectionNoteIds,
            );
          }
        } catch (error: unknown) {
          showApplicationAlert(
            "Collision resolution unavailable",
            error instanceof Error
              ? error.message
              : "The note collision could not be resolved.",
            "danger",
          );
        }
      };

      const collisionLabel =
        request.collisionCount === 1
          ? "one collision"
          : `${request.collisionCount} collisions`;

      setApplicationDialog({
        title: "Resolve note collision",
        message:
          `This edit creates ${collisionLabel}. Merge creates continuous notes covering each overlap. Slice keeps the edited notes and cuts existing notes at their start and end anchors.`,
        confirmLabel: "Merge notes",
        alternateLabel: "Slice at anchors",
        cancelLabel: "Cancel",
        tone: "default",
        onConfirm(): void {
          resolveCollision("merge");
        },
        onAlternate(): void {
          resolveCollision("slice");
        },
      });
    },
    [
      dispatchEditCommands,
      scene,
      showApplicationAlert,
    ],
  );
  const prepareStructuralEdit = useCallback((): void => {
    const controller = pianoRollEventControllerRef.current;

    controller?.cancel();
    controller?.clearSelection();
  }, []);
  const handleInsertMeasureAtPlayhead = useCallback(
    (): void => {
      const state = scene.projectStore.getState();

      if (state.measureCount >= MAXIMUM_MEASURE_COUNT) {
        return;
      }

      const measureTicks = getTicksPerMeasure(
        state.transportSettings,
      );
      const measureIndex = Math.min(
        state.measureCount - 1,
        Math.floor(scene.playheadTick.get() / measureTicks),
      );

      prepareStructuralEdit();
      dispatchEditCommands(
        [
          {
            type: "InsertMeasure",
            measureIndex,
          },
        ],
        `Insert measure before ${measureIndex + 1}`,
      );
    },
    [
      dispatchEditCommands,
      prepareStructuralEdit,
      scene,
    ],
  );
  const handleRemoveMeasureAtPlayhead = useCallback(
    (): void => {
      const state = scene.projectStore.getState();

      if (state.measureCount <= MINIMUM_MEASURE_COUNT) {
        return;
      }

      const measureTicks = getTicksPerMeasure(
        state.transportSettings,
      );
      const measureIndex = Math.min(
        state.measureCount - 1,
        Math.floor(scene.playheadTick.get() / measureTicks),
      );
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
        const boundedPlayheadTick = Math.min(
          currentPlayheadTick,
          getProjectDurationTicks(nextState),
        );

        if (boundedPlayheadTick !== currentPlayheadTick) {
          seekPlayback(boundedPlayheadTick);
        }
      }
    },
    [
      dispatchEditCommands,
      prepareStructuralEdit,
      scene,
      seekPlayback,
    ],
  );
  const {
    select: handleVoiceSelect,
    add: handleAddVoice,
    moveSelected: handleMoveSelectedVoice,
    remove: handleDeleteVoice,
    update: handleUpdateVoice,
    commitEnvelopeParameter: handleEnvelopeParameterCommit,
    commitWaveform: handleWaveformCommit,
    commitPolyphony: handleInstrumentPolyphonyCommit,
    selectNotes: handleSelectVoiceNotes,
    toggleLock: handleToggleVoiceLock,
  } = useVoiceWorkflow({
    commands: scene.editorCommands,
    selectedVoiceId,
    selectVoice: setSelectedVoiceId,
    toggleVoiceSelection(voiceId) {
      scene.selectionRequests.toggleVoice(voiceId);
    },
    removeVoiceFromSelection(voiceId) {
      pianoRollEventControllerRef.current
        ?.removeVoiceFromSelection(voiceId);
    },
    confirm: showApplicationConfirmation,
  });
  const handleMasterGainCommit = useCallback(
    (gain: number): void => {
      dispatchEditCommands(
        [
          {
            type: "UpdateMasterGain",
            gain,
          },
        ],
        "Update master gain",
      );
    },
    [dispatchEditCommands],
  );
  const handleMasterMuteToggle = useCallback((): void => {
    const muted =
      scene.projectStore.getState().masterBus.muted;

    dispatchEditCommands(
      [
        {
          type: "SetMasterMuted",
          muted: !muted,
        },
      ],
      muted ? "Unmute master bus" : "Mute master bus",
    );
  }, [
    dispatchEditCommands,
    scene,
  ]);
  const handleMasterTuningCommit = useCallback(
    (tuningFrequencyHz: number): void => {
      dispatchEditCommands(
        [
          {
            type: "UpdateMasterTuning",
            tuningFrequencyHz,
          },
        ],
        "Update master tuning",
      );
    },
    [dispatchEditCommands],
  );
  const getPianoRollEventController = useCallback(
    (): PianoRollEventController | null =>
      pianoRollEventControllerRef.current,
    [],
  );
  const {
    clipboardAvailable,
    clearClipboard: clearSelectionClipboard,
    undo: handleUndo,
    redo: handleRedo,
    copy: handleCopy,
    cut: handleCut,
    remove: handleDeleteSelection,
    transform: handleTransformSelection,
    sliceAtPlayhead: handleSliceSelectionAtPlayhead,
    paste: handlePaste,
    transferToSelectedVoice: handleTransferSelectionToVoice,
  } = useSelectionWorkflow({
    commands: scene.editorCommands,
    projectStore: scene.projectStore,
    getController: getPianoRollEventController,
    getPlayheadTick() {
      return scene.playheadTick.get();
    },
    getGridResolutionTicks() {
      return scene.gridResolutionTicks.get();
    },
    selectedVoiceId,
    resolveCollision: handleNoteCollision,
    alert: showApplicationAlert,
  });
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
  const handleToggleLoop = useCallback((): void => {
    dispatchEditCommands(
      [
        {
          type: "SetLoopEnabled",
          enabled:
            !scene.projectStore.getState()
              .transportSettings.loopEnabled,
        },
      ],
      "Toggle loop",
    );
  }, [
    dispatchEditCommands,
    scene,
  ]);
  const handleLoopRegionCommit = useCallback(
    (loop: LoopRegion): void => {
      dispatchEditCommands(
        [
          {
            type: "UpdateLoop",
            loop,
          },
        ],
        "Update loop region",
      );
    },
    [dispatchEditCommands],
  );
  const {
    loadInputRef: loadProjectInputRef,
    save: handleSaveProject,
    createNew: handleNewProject,
    open: handleOpenProject,
    load: handleProjectFileChange,
    replaceActiveProject,
  } = useProjectFileWorkflow({
    runtime: scene,
    getEditorState() {
      return {
        selectedVoiceId,
        selectionMode,
        noteColorMode,
        pitchPreviewEnabled,
        pitchSnapSettings: scene.pitchSnapSettings.get(),
        gridSettings: scene.gridSettings.get(),
        viewport: getNativeViewportState(scene.viewport.get()),
      };
    },
    stopPlayback,
    seekPlayback,
    resetInteraction() {
      const controller = pianoRollEventControllerRef.current;

      controller?.cancel();
      controller?.clearSelection();
    },
    clearClipboard: clearSelectionClipboard,
    clearPendingMidiImport() {
      pendingMidiImportRef.current = null;
    },
    onSelectionCleared() {
      setSelectionAvailable(false);
    },
    onEditorStateRestored(nextProject, editorState) {
      setSelectionMode(editorState.selectionMode);
      setNoteColorMode(editorState.noteColorMode);
      setPitchPreviewEnabled(editorState.pitchPreviewEnabled);
      setPitchSnapSettings(editorState.pitchSnapSettings);
      setSelectedVoiceId(editorState.selectedVoiceId);

      const currentViewport = scene.viewport.get();
      const restoredViewport: ViewportState = {
        ...currentViewport,
        ...editorState.viewport,
      };

      publishViewport({
        ...restoredViewport,
        scrollX: Math.min(
          editorState.viewport.scrollX,
          getMaximumHorizontalScroll(
            restoredViewport,
            dimensionsRef.current.width,
            getProjectDurationTicks(nextProject),
          ),
        ),
        scrollY: Math.min(
          editorState.viewport.scrollY,
          getMaximumVerticalScroll(
            restoredViewport,
            dimensionsRef.current.height,
          ),
        ),
      });
    },
    alert: showApplicationAlert,
    confirm: showApplicationConfirmation,
  });
  const {
    inputRef: importMidiInputRef,
    openImport: handleOpenMidiImport,
    importFile: handleMidiFileChange,
    exportFile: handleExportMidi,
  } = useMidiFileWorkflow({
    runtime: scene,
    pendingAnalysisRef: pendingMidiImportRef,
    replaceActiveProject,
    showDialog: setApplicationDialog,
    alert: showApplicationAlert,
  });
  return (
    <main
      ref={appShellRef}
      className="app-shell"
      aria-label={APPLICATION_CONSTANTS.productName}
      data-project-revision="0"
    >
      <header className="topbar">
        <div className="brand">
          <ProjectFileMenu
            projectInputRef={loadProjectInputRef}
            midiInputRef={importMidiInputRef}
            onNewProject={handleNewProject}
            onSaveProject={handleSaveProject}
            onOpenProject={handleOpenProject}
            onOpenMidiImport={handleOpenMidiImport}
            onExportMidi={handleExportMidi}
            onProjectFileChange={handleProjectFileChange}
            onMidiFileChange={handleMidiFileChange}
          />
          <div>
            <input
              key={projectState.title}
              className="project-title-input"
              type="text"
              maxLength={MAXIMUM_NATIVE_PROJECT_TITLE_LENGTH}
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

        <TransportControls
          status={playbackStatus}
          loopEnabled={
            projectState.transportSettings.loopEnabled
          }
          onReturnToStart={returnToStart}
          onTogglePlayback={togglePlayback}
          onStop={stopPlayback}
          onToggleLoop={handleToggleLoop}
        />
        <TransportMetrics
          projectStore={scene.projectStore}
          editorCommands={scene.editorCommands}
          gridSettings={scene.gridSettings}
        />

        <MasterGainControl
          gain={projectState.masterBus.gain}
          muted={projectState.masterBus.muted}
          tuningFrequencyHz={
            projectState.masterBus.tuningFrequencyHz
          }
          onPreview={previewMasterGain}
          onCommit={handleMasterGainCommit}
          onMuteToggle={handleMasterMuteToggle}
          onTuningCommit={handleMasterTuningCommit}
        />
      </header>

      <section
        className={
          `workspace${
            generalInspectorOpen
              ? " is-general-inspector-open"
              : ""
          }`
        }
      >
        <div className="editor-panel">
          {generalInspectorToolbarHost === null
            ? null
            : createPortal(
          <EditorToolbar
            inspectorOpen={generalInspectorOpen}
            canUndo={scene.projectStore.canUndo()}
            canRedo={scene.projectStore.canRedo()}
            measureCount={projectState.measureCount}
            selectionAvailable={selectionAvailable}
            clipboardAvailable={clipboardAvailable}
            selectionMode={selectionMode}
            selectedVoice={selectedVoice}
            onToggleInspector={() => {
              setGeneralInspectorOpen((current) => !current);
            }}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onInsertMeasure={handleInsertMeasureAtPlayhead}
            onRemoveMeasure={handleRemoveMeasureAtPlayhead}
            onDeleteSelection={handleDeleteSelection}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onSelectionModeChange={setSelectionMode}
            onTransferSelectionToVoice={handleTransferSelectionToVoice}
            onSliceSelectionAtPlayhead={handleSliceSelectionAtPlayhead}
            onTransformSelection={handleTransformSelection}
          />,
          generalInspectorToolbarHost,
        )}

          <div className="roll-frame">
            <PianoKeyboard
              viewport={scene.viewport}
              previewEnabled={pitchPreviewEnabled}
              pitchSnapSettings={pitchSnapSettings}
              onPreviewToggle={() => {
                setPitchPreviewEnabled((enabled) => !enabled);
              }}
              onPitchAudition={handlePitchAudition}
              onPitchLongPress={handlePitchSelect}
              onPitchInteractionChange={(pitch) => {
                scene.highlightedPitch.set(pitch);
              }}
            />
            <div ref={stageRef} className="roll-stage">
              <BarRuler
                viewport={scene.viewport}
                projectStore={scene.projectStore}
                gridResolutionTicks={scene.gridResolutionTicks}
                onSeekStart={beginSeekGesture}
                onSeekPreview={previewSeek}
                onSeekCommit={commitSeekGesture}
              />
              <TimelineLoopRegion
                viewport={scene.viewport}
                projectStore={scene.projectStore}
                gridResolutionTicks={scene.gridResolutionTicks}
                onCommit={handleLoopRegionCommit}
              />
              <div className="canvas-host">
                <PianoRollLayers
                  runtime={scene}
                  selectionMode={selectionMode}
                  activeVoiceId={selectedVoiceId ?? ""}
                  totalTicks={totalTicks}
                  setViewport={publishViewport}
                  eventControllerRef={
                    pianoRollEventControllerRef
                  }
                  onSelectionChange={handleSelectionChange}
                  onGridSeek={seekPlayback}
                  onNoteCollision={handleNoteCollision}
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
              <output ref={barLabelRef}>1.1.1</output>
            </div>
            <label className="view-position-control">
              <span aria-hidden="true">X</span>
              <input
                ref={scrollInputRef}
                type="range"
                min="0"
                step={EDITOR_CONSTANTS.horizontalScrollStep}
                defaultValue="0"
                aria-label="Horizontal timeline position"
              />
            </label>
            <label className="view-zoom-control">
              <span aria-hidden="true">ZX</span>
              <input
                ref={zoomInputRef}
                type="range"
                min={MINIMUM_HORIZONTAL_ZOOM}
                max={MAXIMUM_HORIZONTAL_ZOOM}
                step={EDITOR_CONSTANTS.zoomStep}
                defaultValue={
                  VIEWPORT_CONSTANTS.initialHorizontalZoom
                }
                aria-label="Horizontal zoom"
              />
              <output ref={zoomLabelRef}>
                {Math.round(
                  VIEWPORT_CONSTANTS.initialHorizontalZoom * 100,
                )}%
              </output>
            </label>
            <div className="pitch-view-controls">
              <label className="view-position-control">
                <span aria-hidden="true">Y</span>
                <input
                  ref={pitchScrollInputRef}
                  type="range"
                  min="0"
                  max={Math.max(
                    0,
                    (
                      VIEWPORT_CONSTANTS.maximumMidiPitch
                      - VIEWPORT_CONSTANTS.minimumMidiPitch
                      + 1
                    )
                      * VIEWPORT_CONSTANTS.initialPitchHeightCssPixels
                      * VIEWPORT_CONSTANTS.initialVerticalZoom
                      - VIEWPORT_CONSTANTS.initialHeightCssPixels,
                  )}
                  step={EDITOR_CONSTANTS.verticalScrollStep}
                  defaultValue={String(
                    (
                      VIEWPORT_CONSTANTS.maximumMidiPitch
                      - INITIAL_MAX_VISIBLE_PITCH
                    )
                    * INITIAL_PITCH_HEIGHT,
                  )}
                  aria-label="Vertical pitch position"
                />
              </label>
              <label className="view-zoom-control">
                <span aria-hidden="true">ZY</span>
                <input
                  ref={pitchZoomInputRef}
                  type="range"
                  min={MINIMUM_VERTICAL_ZOOM}
                  max={MAXIMUM_VERTICAL_ZOOM}
                  step={EDITOR_CONSTANTS.zoomStep}
                  defaultValue={
                    VIEWPORT_CONSTANTS.initialVerticalZoom
                  }
                  aria-label="Vertical pitch zoom"
                />
                <output ref={pitchZoomLabelRef}>
                  {Math.round(
                    VIEWPORT_CONSTANTS.initialVerticalZoom * 100,
                  )}%
                </output>
              </label>
            </div>
            <div
              className={
                `pitch-snap-control${
                  pitchSnapSettings.enabled
                    ? " is-snap-active"
                    : ""
                }${
                  pitchSnapSettings.visualGuideEnabled
                    ? " is-guide-active"
                    : ""
                }`
              }
              aria-label="Tonal pitch snapping"
            >
              <button
                className="pitch-guide-toggle"
                type="button"
                title={
                  pitchSnapSettings.visualGuideEnabled
                    ? "Hide tonal guide"
                    : "Show tonal guide"
                }
                aria-label={
                  pitchSnapSettings.visualGuideEnabled
                    ? "Hide tonal guide"
                    : "Show tonal guide"
                }
                aria-pressed={
                  pitchSnapSettings.visualGuideEnabled
                }
                disabled={pitchSnapSettings.enabled}
                onClick={() => {
                  if (pitchSnapSettings.enabled) {
                    return;
                  }

                  updatePitchSnapSettings({
                    visualGuideEnabled:
                      !pitchSnapSettings.visualGuideEnabled,
                  });
                }}
              >
                <svg
                  className="pitch-snap-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
              </button>
              <button
                className="pitch-snap-toggle"
                type="button"
                title={
                  pitchSnapSettings.enabled
                    ? "Disable tonal pitch snapping"
                    : "Enable tonal pitch snapping"
                }
                aria-label={
                  pitchSnapSettings.enabled
                    ? "Disable tonal pitch snapping"
                    : "Enable tonal pitch snapping"
                }
                aria-pressed={pitchSnapSettings.enabled}
                onClick={() => {
                  const enabled = !pitchSnapSettings.enabled;

                  updatePitchSnapSettings(
                    enabled
                      ? {
                          enabled: true,
                          visualGuideEnabled: true,
                        }
                      : { enabled: false },
                  );
                }}
              >
                <svg
                  className="pitch-snap-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M5 4v8a7 7 0 0 0 14 0V4" />
                  <path d="M5 4h5M14 4h5" />
                  <path d="M5 8h5M14 8h5" />
                  <path d="M10 4v8a2 2 0 0 0 4 0V4" />
                </svg>
              </button>
              <select
                className="pitch-snap-tonic-select"
                value={pitchSnapSettings.tonicPitchClass}
                aria-label="Pitch snap tonic"
                onChange={(event) => {
                  const tonicPitchClass =
                    Number(event.currentTarget.value);

                  if (
                    Number.isInteger(tonicPitchClass)
                    && tonicPitchClass >= 0
                    && tonicPitchClass < 12
                  ) {
                    updatePitchSnapSettings({
                      tonicPitchClass,
                    });
                  }
                }}
              >
                {TONAL_SNAP_CONSTANTS.tonicOptions.map(
                  (option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {getPreferredTonicLabel(
                        option.value,
                        pitchSnapSettings.patternId,
                      )}
                    </option>
                  ),
                )}
              </select>
              <select
                className="pitch-snap-pattern-select"
                value={pitchSnapSettings.patternId}
                aria-label="Pitch snap mode"
                onChange={(event) => {
                  const patternId = event.currentTarget.value;

                  if (isTonalPatternId(patternId)) {
                    updatePitchSnapSettings({
                      patternId,
                      scaleDegreeIndex: null,
                    });
                  }
                }}
              >
                {TONAL_SNAP_CONSTANTS.patternFamilies.map(
                  (family) => (
                    <optgroup
                      key={family.id}
                      label={family.label}
                    >
                      {TONAL_SNAP_CONSTANTS.patterns.map(
                        (pattern) => (
                          pattern.family === family.id
                            ? (
                                <option
                                  key={pattern.id}
                                  value={pattern.id}
                                >
                                  {pattern.label}
                                </option>
                              )
                            : null
                        ),
                      )}
                    </optgroup>
                  ),
                )}
              </select>
              <select
                className="pitch-snap-degree-select"
                value={pitchSnapSettings.scaleDegreeIndex ?? -1}
                aria-label="Pitch snap mode degree"
                style={{
                  "--degree-color":
                    pitchSnapSettings.scaleDegreeIndex === null
                      ? APPLICATION_COLORS.accent.tonal
                      : getScaleDegreeAccentColor(
                          pitchSnapSettings,
                          pitchSnapSettings.scaleDegreeIndex,
                        ),
                } as React.CSSProperties}
                onChange={(event) => {
                  const scaleDegreeIndex = Number(
                    event.currentTarget.value,
                  );
                  const pattern = getTonalPatternDefinition(
                    pitchSnapSettings.patternId,
                  );

                  updatePitchSnapSettings({
                    scaleDegreeIndex:
                      scaleDegreeIndex >= 0
                      && scaleDegreeIndex < pattern.intervals.length
                        ? scaleDegreeIndex
                        : null,
                  });
                }}
              >
                <option value={-1}>Full mode</option>
                {getTonalPatternDefinition(
                  pitchSnapSettings.patternId,
                ).intervals.map((_, degreeIndex) => (
                  <option
                    key={degreeIndex}
                    value={degreeIndex}
                    style={{
                      color: getScaleDegreeAccentColor(
                        pitchSnapSettings,
                        degreeIndex,
                      ),
                    }}
                  >
                    {getScaleDegreeLabel(
                      pitchSnapSettings,
                      degreeIndex,
                    )}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <GeneralInspector
          open={generalInspectorOpen}
          projectState={projectState}
          selectedVoiceId={selectedVoiceId}
          selectedVoiceIndex={selectedVoiceIndex}
          selectedVoice={selectedVoice}
          noteColorMode={noteColorMode}
          setToolbarHost={setGeneralInspectorToolbarHost}
          onClose={() => {
            setGeneralInspectorOpen(false);
          }}
          onNoteColorModeToggle={handleNoteColorModeToggle}
          onMoveSelectedVoice={handleMoveSelectedVoice}
          onAddVoice={handleAddVoice}
          onVoiceSelect={handleVoiceSelect}
          onUpdateVoice={handleUpdateVoice}
          onVoiceGainPreview={previewVoiceGain}
          onSelectVoiceNotes={handleSelectVoiceNotes}
          onToggleVoiceLock={handleToggleVoiceLock}
          onDeleteVoice={handleDeleteVoice}
          onWaveformCommit={handleWaveformCommit}
          onPolyphonyCommit={handleInstrumentPolyphonyCommit}
          onEnvelopeCommit={handleEnvelopeParameterCommit}
        />
      </section>
      <ApplicationDialogOverlay
        dialog={applicationDialog}
        onConfirm={handleApplicationDialogConfirm}
        onAlternate={handleApplicationDialogAlternate}
        onCancel={handleApplicationDialogCancel}
      />
    </main>
  );
}

function getScaleDegreeAccentColor(
  settings: PitchSnapSettings,
  degreeIndex: number,
): string {
  const colorIndex = getScaleDegreeColorIndex(
    settings,
    degreeIndex,
  );

  return colorIndex === null
    ? APPLICATION_COLORS.accent.tonal
    : APPLICATION_COLORS.pianoRoll.degreeAccents[colorIndex]
      ?? APPLICATION_COLORS.accent.tonal;
}

function getNativeViewportState(
  viewport: ViewportState,
): NativeEditorState["viewport"] {
  return {
    zoomX: viewport.zoomX,
    zoomY: viewport.zoomY,
    scrollX: viewport.scrollX,
    scrollY: viewport.scrollY,
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

  return `${barIndex + 1}.${beatIndex + 1}.${subdivisionIndex + 1}`;
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

function formatAudioPlaybackError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "The browser could not initialize the audio engine.";
}
