import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import {
  createPortal,
} from "react-dom";
import {
  APPLICATION_CONSTANTS,
  EDITOR_CONSTANTS,
  FILE_CONSTANTS,
  INTERACTION_CONSTANTS,
  MIDI_CONSTANTS,
  PROJECT_CONSTANTS,
  RENDERING_CONSTANTS,
  TONAL_SNAP_CONSTANTS,
  VIEWPORT_CONSTANTS,
  VOICE_CONSTANTS,
} from "../config/program-constants";
import {
  CommandRejectedError,
  type PianoRollCommand,
  type Transaction,
  type UpdateVoiceChanges,
} from "../domain/commands";
import type {
  AdsrEnvelope,
  LoopRegion,
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
  MAXIMUM_INSTRUMENT_POLYPHONY,
  MAXIMUM_MASTER_GAIN,
  MAXIMUM_MEASURE_COUNT,
  MINIMUM_INSTRUMENT_POLYPHONY,
  MINIMUM_MEASURE_COUNT,
  MINIMUM_MASTER_GAIN,
  MAXIMUM_VOICE_NAME_LENGTH,
} from "../domain/model";
import {
  createDefaultVoice,
  getDefaultOscillatorWaveform,
} from "../domain/voice-factory";
import {
  countNoteEditCollisions,
  createNoteCollisionResolutionPlan,
  hasNoteEditCollisions,
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
  createMidiExport,
  createMidiFileName,
} from "../midi/midi-exporter";
import {
  analyzeMidiImport,
  createProjectFromMidiImport,
  formatMidiImportError,
  type MidiImportAnalysis,
  type MidiImportCollisionStrategy,
} from "../midi/midi-importer";
import {
  readStandardMidiFile,
} from "../midi/smf-reader";
import {
  writeStandardMidiFile,
} from "../midi/smf-writer";
import {
  createNativeProjectFileName,
  MAXIMUM_NATIVE_PROJECT_FILE_BYTES,
  MAXIMUM_NATIVE_PROJECT_TITLE_LENGTH,
  NativeProjectFileError,
  parseNativeProjectFile,
  serializeNativeProjectFile,
  type NativeProjectFileMetadata,
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
  useCanvasRenderer,
  type CanvasFrame,
} from "../ui/hooks/useCanvasRenderer";
import {
  useAudioPlayback,
} from "../ui/hooks/useAudioPlayback";
import type {
  NoteCollisionResolutionRequest,
  PianoRollEventController,
} from "../ui/hooks/usePianoRollEvents";
import {
  isTonalPatternId,
  type PitchSnapSettings,
} from "../ui/interactions/pitch-snap";
import type {
  SelectionMode,
} from "../ui/interactions/types";
import type {
  ReadonlyRenderSignal,
} from "../ui/rendering/render-signal";
import {
  createGridSettings,
  DEFAULT_GRID_SETTINGS,
  parseGridSubdivision,
} from "../ui/rendering/grid-settings";
import type {
  NoteColorMode,
} from "../ui/rendering/note-style";
import {
  APPLICATION_SURFACE_COLOR,
} from "../ui/rendering/theme";
import {
  calculateVisibleRegion,
  createBlankProjectState,
  createDemoScene,
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

interface ApplicationConfirmationOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly tone?: ApplicationDialogTone;
  readonly onConfirm: () => void;
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
const INSTRUMENT_POLYPHONY_OPTIONS = Object.freeze(
  Array.from(
    {
      length:
        MAXIMUM_INSTRUMENT_POLYPHONY
        - MINIMUM_INSTRUMENT_POLYPHONY
        + 1,
    },
    (_, index) => MINIMUM_INSTRUMENT_POLYPHONY + index,
  ),
);
const VIEW_INPUT_HORIZONTAL_SCROLL = 1;
const VIEW_INPUT_HORIZONTAL_ZOOM = 2;
const VIEW_INPUT_VERTICAL_SCROLL = 4;
const VIEW_INPUT_VERTICAL_ZOOM = 8;
const RULER_HEIGHT_CSS_PIXELS =
  EDITOR_CONSTANTS.rulerHeightCssPixels;
const LOOP_REGION_HEIGHT_CSS_PIXELS =
  EDITOR_CONSTANTS.loopRegionHeightCssPixels;
const PIANO_KEY_LONG_PRESS_DELAY_MS =
  INTERACTION_CONSTANTS.pianoKeyLongPressDelayMs;
const PIANO_KEY_PEN_LONG_PRESS_DELAY_MS =
  INTERACTION_CONSTANTS.pianoKeyPenLongPressDelayMs;
const PIANO_KEY_LONG_PRESS_MOVEMENT_TOLERANCE =
  INTERACTION_CONSTANTS
    .pianoKeyLongPressMovementToleranceCssPixels;
const ENVELOPE_SLIDER_CURVE_EXPONENT =
  EDITOR_CONSTANTS.envelopeSliderCurveExponent;
const TIMELINE_HEADER_HEIGHT_CSS_PIXELS =
  RULER_HEIGHT_CSS_PIXELS + LOOP_REGION_HEIGHT_CSS_PIXELS;

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
  const loadProjectInputRef =
    useRef<HTMLInputElement | null>(null);
  const importMidiInputRef =
    useRef<HTMLInputElement | null>(null);
  const projectFileMenuRef =
    useRef<HTMLDivElement | null>(null);
  const barLabelRef = useRef<HTMLOutputElement | null>(null);
  const playheadPositionLabelRef =
    useRef<HTMLOutputElement | null>(null);
  const pianoRollEventControllerRef =
    useRef<PianoRollEventController | null>(null);
  const clipboardRef = useRef<PianoRollClipboard | null>(null);
  const voiceTransactionSequenceRef = useRef(0);
  const editTransactionSequenceRef = useRef(0);
  const documentMetadataRef =
    useRef<NativeProjectFileMetadata | null>(null);
  const pendingMidiImportRef =
    useRef<MidiImportAnalysis | null>(null);
  const dimensionsRef = useRef<ViewportDimensions>({
    width: VIEWPORT_CONSTANTS.initialWidthCssPixels,
    height: VIEWPORT_CONSTANTS.initialHeightCssPixels,
  });

  if (sceneRef.current === null) {
    sceneRef.current = createDemoScene();
  }

  const scene = sceneRef.current;

  if (documentMetadataRef.current === null) {
    documentMetadataRef.current =
      createNativeProjectFileMetadata();
  }
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
  const [clipboardAvailable, setClipboardAvailable] =
    useState(false);
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
  const [projectFileMenuOpen, setProjectFileMenuOpen] =
    useState(false);
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

  useEffect(() => {
    if (!projectFileMenuOpen) {
      return undefined;
    }

    const handleOutsidePointerDown = (
      event: PointerEvent,
    ): void => {
      const menu = projectFileMenuRef.current;

      if (
        menu !== null
        && event.target instanceof Node
        && !menu.contains(event.target)
      ) {
        setProjectFileMenuOpen(false);
      }
    };

    window.addEventListener(
      "pointerdown",
      handleOutsidePointerDown,
    );

    return () => {
      window.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
      );
    };
  }, [projectFileMenuOpen]);
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
    (hasSelection: boolean): void => {
      setSelectionAvailable(hasSelection);
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

  const handleResetView = useCallback((): void => {
    const currentScene = sceneRef.current;

    if (currentScene === null) {
      return;
    }

    const viewport: ViewportState = {
      ...currentScene.viewport.get(),
      zoomX: VIEWPORT_CONSTANTS.initialHorizontalZoom,
      zoomY: VIEWPORT_CONSTANTS.initialVerticalZoom,
      scrollX: 0,
      scrollY:
        (
          VIEWPORT_CONSTANTS.maximumMidiPitch
          - INITIAL_MAX_VISIBLE_PITCH
        )
        * INITIAL_PITCH_HEIGHT,
    };

    publishViewport(viewport);

    if (zoomInputRef.current !== null) {
      zoomInputRef.current.value = String(
        VIEWPORT_CONSTANTS.initialHorizontalZoom,
      );
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
      pitchZoomInputRef.current.value = String(
        VIEWPORT_CONSTANTS.initialVerticalZoom,
      );
    }

    if (zoomLabelRef.current !== null) {
      zoomLabelRef.current.value =
        `${Math.round(VIEWPORT_CONSTANTS.initialHorizontalZoom * 100)}%`;
    }

    if (barLabelRef.current !== null) {
      barLabelRef.current.value = "Bar 1";
    }

    if (pitchZoomLabelRef.current !== null) {
      pitchZoomLabelRef.current.value =
        `${Math.round(VIEWPORT_CONSTANTS.initialVerticalZoom * 100)}%`;
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
  const handleVoiceSelect = useCallback(
    (voiceId: VoiceId): void => {
      setSelectedVoiceId(voiceId);
    },
    [],
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
  }, [
    dispatchVoiceCommand,
    scene,
  ]);
  const handleMoveSelectedVoice = useCallback(
    (direction: -1 | 1): void => {
      if (selectedVoiceId === null) {
        return;
      }

      const state = scene.projectStore.getState();
      const currentIndex =
        state.voiceOrder.indexOf(selectedVoiceId);
      const nextIndex = currentIndex + direction;

      if (
        currentIndex < 0
        || nextIndex < 0
        || nextIndex >= state.voiceOrder.length
      ) {
        return;
      }

      const voiceOrder = [...state.voiceOrder];
      const displacedVoiceId = voiceOrder[nextIndex];

      if (displacedVoiceId === undefined) {
        return;
      }

      voiceOrder[currentIndex] = displacedVoiceId;
      voiceOrder[nextIndex] = selectedVoiceId;
      dispatchVoiceCommand(
        {
          type: "ReorderVoices",
          voiceOrder,
        },
        direction < 0 ? "Move voice up" : "Move voice down",
      );
    },
    [
      dispatchVoiceCommand,
      scene,
      selectedVoiceId,
    ],
  );
  const handleDeleteVoice = useCallback(
    (voiceId: VoiceId): void => {
      const state = scene.projectStore.getState();
      const voice = state.voicesById[voiceId];

      if (voice === undefined) {
        return;
      }

      showApplicationConfirmation({
        title: "Delete voice?",
        message:
          `Delete "${voice.name}" and all of its notes?`,
        confirmLabel: "Delete",
        tone: "danger",
        onConfirm: () => {
          const currentState = scene.projectStore.getState();
          const voiceIndex =
            currentState.voiceOrder.indexOf(voiceId);
          const nextVoiceId =
            currentState.voiceOrder[voiceIndex + 1]
            ?? currentState.voiceOrder[voiceIndex - 1]
            ?? null;

          dispatchVoiceCommand(
            {
              type: "DeleteVoice",
              voiceId,
            },
            "Delete voice",
          );
          pianoRollEventControllerRef.current
            ?.removeVoiceFromSelection(voiceId);

          if (selectedVoiceId === voiceId) {
            setSelectedVoiceId(nextVoiceId);
          }
        },
      });
    },
    [
      dispatchVoiceCommand,
      scene,
      selectedVoiceId,
      showApplicationConfirmation,
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
  const handleEnvelopeParameterCommit = useCallback(
    (
      voiceId: VoiceId,
      parameter: keyof AdsrEnvelope,
      value: number,
    ): void => {
      const voice =
        scene.projectStore.getState().voicesById[voiceId];

      if (voice === undefined) {
        return;
      }

      handleUpdateVoice(
        voiceId,
        {
          instrument: {
            ...voice.instrument,
            envelope: {
              ...voice.instrument.envelope,
              [parameter]: value,
            },
          },
        },
        `Update ${parameter}`,
      );
    },
    [
      handleUpdateVoice,
      scene,
    ],
  );
  const handleWaveformCommit = useCallback(
    (
      voiceId: VoiceId,
      oscillatorWaveform: OscillatorWaveform,
    ): void => {
      const voice =
        scene.projectStore.getState().voicesById[voiceId];

      if (voice === undefined) {
        return;
      }

      handleUpdateVoice(
        voiceId,
        {
          instrument: {
            ...voice.instrument,
            oscillatorWaveform,
          },
        },
        "Update oscillator waveform",
      );
    },
    [
      handleUpdateVoice,
      scene,
    ],
  );
  const handleInstrumentPolyphonyCommit = useCallback(
    (
      voiceId: VoiceId,
      polyphony: number,
    ): void => {
      const voice =
        scene.projectStore.getState().voicesById[voiceId];

      if (voice === undefined) {
        return;
      }

      handleUpdateVoice(
        voiceId,
        {
          instrument: {
            ...voice.instrument,
            polyphony,
          },
        },
        "Update instrument polyphony",
      );
    },
    [
      handleUpdateVoice,
      scene,
    ],
  );
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

    if (!canPlacePastedNotes(state, pastedNotes)) {
      showApplicationAlert(
        "Paste unavailable",
        "Paste is unavailable because it would exceed the timeline or target an unavailable or locked voice.",
      );
      return;
    }

    const pasteIntent = {
      originalNotes: [],
      proposedNotes: pastedNotes,
    } as const;

    if (hasNoteEditCollisions(state, pasteIntent)) {
      handleNoteCollision({
        label: "Paste notes",
        collisionCount:
          countNoteEditCollisions(state, pasteIntent),
        ...pasteIntent,
        onResolved(nextState, selectedNoteIds): void {
          pianoRollEventControllerRef.current?.replaceSelection(
            findNotesByIds(nextState, selectedNoteIds),
          );
        },
      });
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
    handleNoteCollision,
    scene,
    showApplicationAlert,
  ]);
  const handleTransferSelectionToVoice =
    useCallback((): void => {
      const controller = pianoRollEventControllerRef.current;
      const targetVoiceId = selectedVoiceId;

      if (controller === null || targetVoiceId === null) {
        return;
      }

      const selectedNotes = controller.getSelectedNotes();
      const transferPlan = createVoiceTransferPlan(
        scene.projectStore.getState(),
        selectedNotes,
        targetVoiceId,
      );

      if (!transferPlan.valid) {
        showApplicationAlert(
          "Transfer unavailable",
          transferPlan.message,
        );
        return;
      }

      if (transferPlan.commands.length === 0) {
        return;
      }

      const transferIntent = {
        originalNotes: transferPlan.originalNotes,
        proposedNotes: transferPlan.proposedNotes,
      };
      const state = scene.projectStore.getState();

      if (hasNoteEditCollisions(state, transferIntent)) {
        const retainedTargetNoteIds: NoteId[] = [];

        for (const selectedNote of selectedNotes) {
          if (selectedNote.voiceId === targetVoiceId) {
            retainedTargetNoteIds.push(selectedNote.id);
          }
        }

        handleNoteCollision({
          label: "Transfer notes to voice",
          collisionCount:
            countNoteEditCollisions(state, transferIntent),
          ...transferIntent,
          onResolved(nextState, selectedNoteIds): void {
            controller.replaceSelection(
              findNotesByIds(
                nextState,
                selectedNoteIds.concat(retainedTargetNoteIds),
              ),
            );
          },
        });
        return;
      }

      try {
        const nextState = dispatchEditCommands(
          transferPlan.commands,
          "Transfer notes to voice",
        );

        if (nextState === null) {
          return;
        }

        const targetTrack =
          nextState.tracksByVoiceId[targetVoiceId];
        const nextSelection: Note[] = [];

        if (targetTrack !== undefined) {
          for (
            let noteIndex = 0;
            noteIndex < selectedNotes.length;
            noteIndex += 1
          ) {
            const note = selectedNotes[noteIndex];

            if (note === undefined) {
              continue;
            }

            const transferredNote =
              targetTrack.notesById[note.id];

            if (transferredNote !== undefined) {
              nextSelection.push(transferredNote);
            }
          }
        }

        controller.replaceSelection(nextSelection);
      } catch (error: unknown) {
        const message =
          error instanceof CommandRejectedError
            ? error.message
            : "The selected notes could not be transferred.";

        showApplicationAlert(
          "Transfer cancelled",
          message,
          "danger",
        );
      }
    }, [
      dispatchEditCommands,
      handleNoteCollision,
      scene,
      selectedVoiceId,
      showApplicationAlert,
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
  const handleSaveProject = useCallback((): void => {
    const currentMetadata = documentMetadataRef.current;

    if (currentMetadata === null) {
      return;
    }

    try {
      const metadata: NativeProjectFileMetadata = {
        ...currentMetadata,
        savedAt: new Date().toISOString(),
      };
      const state = scene.projectStore.getState();
      const stateForSave: ProjectState = {
        ...state,
        transportSettings: {
          ...state.transportSettings,
          anchorTick: Math.round(scene.playheadTick.get()),
          anchorAudioTimeSeconds: null,
        },
      };
      const serialized = serializeNativeProjectFile(
        stateForSave,
        metadata,
      );
      const projectBlob = new Blob(
        [serialized],
        {
          type: "application/json;charset=utf-8",
        },
      );

      if (projectBlob.size > MAXIMUM_NATIVE_PROJECT_FILE_BYTES) {
        throw new NativeProjectFileError(
          "INVALID_DATA",
          "$",
          "The project is too large to save as a native file.",
        );
      }

      documentMetadataRef.current = metadata;
      downloadBrowserFile(
        projectBlob,
        createNativeProjectFileName(state.title),
      );
    } catch (error: unknown) {
      showApplicationAlert(
        "Save failed",
        formatNativeProjectError(
          "Unable to save the project.",
          error,
        ),
        "danger",
      );
    }
  }, [
    scene,
    showApplicationAlert,
  ]);
  const replaceActiveProject = useCallback(
    (
      nextProject: ProjectState,
      metadata: NativeProjectFileMetadata,
      label: string,
      playheadTick: number,
    ): void => {
      const controller =
        pianoRollEventControllerRef.current;

      stopPlayback();
      controller?.cancel();
      controller?.clearSelection();
      clipboardRef.current = null;
      pendingMidiImportRef.current = null;
      setClipboardAvailable(false);
      setSelectionAvailable(false);
      scene.voiceSelectionRequest.set(null);
      scene.gridSettings.set(DEFAULT_GRID_SETTINGS);
      documentMetadataRef.current = metadata;
      scene.projectStore.replaceState(nextProject, label);
      setSelectedVoiceId(nextProject.voiceOrder[0] ?? null);
      seekPlayback(playheadTick);
      handleResetView();
    },
    [
      handleResetView,
      scene,
      seekPlayback,
      stopPlayback,
    ],
  );
  const createNewProject = useCallback((): void => {
    const blankProject = createBlankProjectState();

    replaceActiveProject(
      blankProject,
      createNativeProjectFileMetadata(),
      "Create project",
      0,
    );
  }, [
    replaceActiveProject,
  ]);
  const handleNewProject = useCallback((): void => {
    showApplicationConfirmation({
      title: "Create a new project?",
      message:
        "Unsaved changes in the current project will be lost.",
      confirmLabel: "Create project",
      tone: "danger",
      onConfirm: createNewProject,
    });
  }, [
    createNewProject,
    showApplicationConfirmation,
  ]);
  const handleOpenProject = useCallback((): void => {
    const input = loadProjectInputRef.current;

    if (input === null) {
      return;
    }

    input.value = "";
    input.click();
  }, []);
  const handleProjectFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const input = event.currentTarget;
      const file = input.files?.[0];

      if (file === undefined) {
        return;
      }

      try {
        if (file.size > MAXIMUM_NATIVE_PROJECT_FILE_BYTES) {
          throw new NativeProjectFileError(
            "INVALID_DATA",
            "$",
            "The selected project file is too large.",
          );
        }

        const loadedProject = parseNativeProjectFile(
          await file.text(),
        );
        replaceActiveProject(
          loadedProject.projectState,
          loadedProject.metadata,
          "Load project",
          loadedProject.projectState
            .transportSettings.anchorTick,
        );
      } catch (error: unknown) {
        showApplicationAlert(
          "Load failed",
          formatNativeProjectError(
            "Unable to load the project.",
            error,
          ),
          "danger",
        );
      } finally {
        input.value = "";
      }
    },
    [
      replaceActiveProject,
      showApplicationAlert,
    ],
  );
  const commitMidiImport = useCallback(
    (strategy: MidiImportCollisionStrategy): void => {
      const analysis = pendingMidiImportRef.current;

      if (analysis === null) {
        return;
      }

      try {
        const importedProject = createProjectFromMidiImport(
          analysis,
          strategy,
        );

        pendingMidiImportRef.current = null;
        replaceActiveProject(
          importedProject,
          createNativeProjectFileMetadata(),
          "Import MIDI project",
          0,
        );
      } catch (error: unknown) {
        pendingMidiImportRef.current = null;
        showApplicationAlert(
          "MIDI import failed",
          formatMidiImportError(error),
          "danger",
        );
      }
    },
    [
      replaceActiveProject,
      showApplicationAlert,
    ],
  );
  const presentMidiImportAnalysis = useCallback(
    (analysis: MidiImportAnalysis): void => {
      pendingMidiImportRef.current = analysis;
      const details = [
        `Format ${String(analysis.sourceFormat)} - ${String(analysis.sourceTicksPerQuarterNote)} PPQN`,
        `${String(analysis.noteCount)} notes - ${String(analysis.voiceCandidates.length)} voices`,
        `${formatTempo(analysis.tempoBpm)} BPM - ${String(analysis.timeSignature.numerator)}/${String(analysis.timeSignature.denominator)}`,
        ...analysis.warnings,
      ];

      if (analysis.collisionCount > 0) {
        details.unshift(
          `${String(analysis.collisionCount)} same-voice, same-pitch overlaps require resolution.`,
        );
      }

      setApplicationDialog({
        title: `Import "${analysis.title}"?`,
        message:
          "Importing this MIDI file will replace the active project and discard unsaved changes. Unsupported MIDI performance data is listed below.",
        details,
        confirmLabel:
          analysis.collisionCount > 0
            ? "Merge and import"
            : "Import project",
        alternateLabel:
          analysis.collisionCount > 0
            ? "Slice and import"
            : null,
        cancelLabel: "Cancel",
        tone: "default",
        onConfirm(): void {
          commitMidiImport("merge");
        },
        onAlternate:
          analysis.collisionCount > 0
            ? (): void => {
                commitMidiImport("slice");
              }
            : null,
      });
    },
    [commitMidiImport],
  );
  const handleOpenMidiImport = useCallback((): void => {
    const input = importMidiInputRef.current;

    if (input === null) {
      return;
    }

    input.value = "";
    input.click();
  }, []);
  const handleMidiFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const input = event.currentTarget;
      const file = input.files?.[0];

      if (file === undefined) {
        return;
      }

      try {
        if (file.size > MIDI_CONSTANTS.maximumFileBytes) {
          throw new Error(
            "The selected MIDI file is too large.",
          );
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const midiFile = readStandardMidiFile(bytes);
        const analysis = analyzeMidiImport(
          midiFile,
          file.name,
        );

        presentMidiImportAnalysis(analysis);
      } catch (error: unknown) {
        pendingMidiImportRef.current = null;
        showApplicationAlert(
          "MIDI import failed",
          formatMidiImportError(error),
          "danger",
        );
      } finally {
        input.value = "";
      }
    },
    [
      presentMidiImportAnalysis,
      showApplicationAlert,
    ],
  );
  const handleExportMidi = useCallback((): void => {
    try {
      const state = scene.projectStore.getState();
      const midiExport = createMidiExport(state);
      const bytes = writeStandardMidiFile(midiExport.file);
      const payload = new Uint8Array(bytes.byteLength);

      payload.set(bytes);
      downloadBrowserFile(
        new Blob(
          [payload.buffer],
          {
            type: "audio/midi",
          },
        ),
        createMidiFileName(state.title),
      );

      if (midiExport.warnings.length > 0) {
        showApplicationAlert(
          "MIDI exported with adjustments",
          midiExport.warnings.join(" "),
        );
      }
    } catch (error: unknown) {
      showApplicationAlert(
        "MIDI export failed",
        formatMidiImportError(error),
        "danger",
      );
    }
  }, [
    scene,
    showApplicationAlert,
  ]);

  return (
    <main
      ref={appShellRef}
      className="app-shell"
      aria-label={APPLICATION_CONSTANTS.productName}
      data-project-revision="0"
      style={{
        "--app-surface-color": APPLICATION_SURFACE_COLOR,
      } as React.CSSProperties}
    >
      <header className="topbar">
        <div className="brand">
          <div
            className="topbar-actions"
            aria-label="Project and history actions"
          >
            <div
              ref={projectFileMenuRef}
              className="project-file-menu"
            >
              <button
                className="topbar-icon-button"
                type="button"
                title="File menu"
                aria-label="File menu"
                aria-haspopup="menu"
                aria-expanded={projectFileMenuOpen}
                aria-controls="project-file-menu"
                onClick={() => {
                  setProjectFileMenuOpen((open) => !open);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <div
                id="project-file-menu"
                className="project-file-menu-popover"
                role="menu"
                aria-label="File"
                hidden={!projectFileMenuOpen}
              >
                <button
                  className="project-file-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectFileMenuOpen(false);
                    handleNewProject();
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 3h8l4 4v14H6z" />
                    <path d="M14 3v5h5M9 14h6M12 11v6" />
                  </svg>
                  <span>New project</span>
                </button>
                <button
                  className="project-file-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectFileMenuOpen(false);
                    handleSaveProject();
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 3h12l2 2v16H5z" />
                    <path d="M8 3v6h8V3M8 21v-8h8v8" />
                  </svg>
                  <span>Save project</span>
                </button>
                <button
                  className="project-file-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectFileMenuOpen(false);
                    handleOpenProject();
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 7h7l2 2h9v11H3z" />
                    <path d="M12 12v6M9.5 15.5 12 18l2.5-2.5" />
                  </svg>
                  <span>Load project</span>
                </button>
                <button
                  className="project-file-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectFileMenuOpen(false);
                    handleOpenMidiImport();
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 3h8l4 4v14H6z" />
                    <path d="M14 3v5h5M12 11v7M9 15l3 3 3-3" />
                  </svg>
                  <span>Import MIDI</span>
                </button>
                <button
                  className="project-file-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectFileMenuOpen(false);
                    handleExportMidi();
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 3h8l4 4v14H6z" />
                    <path d="M14 3v5h5M12 18v-7M9 14l3-3 3 3" />
                  </svg>
                  <span>Export MIDI</span>
                </button>
              </div>
              <input
                ref={loadProjectInputRef}
                className="project-file-input"
                type="file"
                accept={
                  `${FILE_CONSTANTS.nativeProjectExtension},`
                  + "application/json"
                }
                aria-hidden="true"
                tabIndex={-1}
                onChange={(event) => {
                  void handleProjectFileChange(event);
                }}
              />
              <input
                ref={importMidiInputRef}
                className="project-file-input"
                type="file"
                accept={[
                  ...MIDI_CONSTANTS.acceptedFileExtensions,
                  ...MIDI_CONSTANTS.acceptedMimeTypes,
                ].join(",")}
                aria-hidden="true"
                tabIndex={-1}
                onChange={(event) => {
                  void handleMidiFileChange(event);
                }}
              />
            </div>
          </div>
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

        <div className="transport-cluster" aria-label="Transport preview">
          <button
            className="icon-button"
            type="button"
            title="Return to start"
            aria-label="Return to start"
            onClick={returnToStart}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 5v14" />
              <path d="m18 6-8 6 8 6Z" />
            </svg>
          </button>
          <button
            className={
              `play-button${
                playbackStatus === "playing"
                  ? " is-playing"
                  : ""
              }`
            }
            type="button"
            title={
              playbackStatus === "playing"
                ? "Pause"
                : "Play"
            }
            aria-label={
              playbackStatus === "playing"
                ? "Pause"
                : "Play"
            }
            aria-pressed={playbackStatus === "playing"}
            onClick={togglePlayback}
          >
            {playbackStatus === "playing"
              ? (
                  <svg
                    className="pause-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect x="7" y="5.5" width="3.5" height="13" rx="1" />
                    <rect x="13.5" y="5.5" width="3.5" height="13" rx="1" />
                  </svg>
                )
              : (
                  <svg
                    className="play-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M8 5.75v12.5L18 12Z" />
                  </svg>
                )}
          </button>
          <button
            className="icon-button"
            type="button"
            title="Stop"
            aria-label="Stop"
            onClick={stopPlayback}
          >
            <span className="stop-icon" aria-hidden="true" />
          </button>
          <button
            className={
              `icon-button loop-toggle-button${
                projectState.transportSettings.loopEnabled
                  ? " is-active"
                  : ""
              }`
            }
            type="button"
            title={
              projectState.transportSettings.loopEnabled
                ? "Disable loop"
                : "Enable loop"
            }
            aria-label={
              projectState.transportSettings.loopEnabled
                ? "Disable loop"
                : "Enable loop"
            }
            aria-pressed={
              projectState.transportSettings.loopEnabled
            }
            onClick={handleToggleLoop}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 7h10a4 4 0 0 1 4 4v1" />
              <path d="m17 9 3 3 3-3" />
              <path d="M18 17H8a4 4 0 0 1-4-4v-1" />
              <path d="m7 15-3-3-3 3" />
            </svg>
          </button>
        </div>

        <TransportMetrics
          projectStore={scene.projectStore}
          gridSettings={scene.gridSettings}
        />

        <MasterGainControl
          gain={projectState.masterBus.gain}
          muted={projectState.masterBus.muted}
          onPreview={previewMasterGain}
          onCommit={handleMasterGainCommit}
          onMuteToggle={handleMasterMuteToggle}
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
          <div className="editor-toolbar">
            <div className="editor-toolbar-actions">
              <button
                className="general-inspector-toggle-button"
                type="button"
                aria-expanded={generalInspectorOpen}
                aria-controls="general-inspector"
                onClick={() => {
                  setGeneralInspectorOpen(
                    (current) => !current,
                  );
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
                  title="Insert a measure before the playhead measure"
                  aria-label="Insert a measure before the playhead measure"
                  disabled={
                    projectState.measureCount
                    >= MAXIMUM_MEASURE_COUNT
                  }
                  onClick={handleInsertMeasureAtPlayhead}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                    <path d="M3 5v14M21 5v14" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Remove the measure at the playhead"
                  aria-label="Remove the measure at the playhead"
                  disabled={
                    projectState.measureCount
                    <= MINIMUM_MEASURE_COUNT
                  }
                  onClick={handleRemoveMeasureAtPlayhead}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="M7 5v14M17 5v14" />
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
                    `selection-mode-button${
                      selectionMode === "replace"
                        ? " is-active"
                        : ""
                    }`
                  }
                  type="button"
                  title="Replace selection"
                  aria-label="Replace selection"
                  aria-pressed={selectionMode === "replace"}
                  onClick={() => setSelectionMode("replace")}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <rect x="8" y="8" width="8" height="8" rx="1" />
                  </svg>
                </button>
                <button
                  className={
                    `selection-mode-button${
                      selectionMode === "add"
                        ? " is-active"
                        : ""
                    }`
                  }
                  type="button"
                  title="Add to selection"
                  aria-label="Add to selection"
                  aria-pressed={selectionMode === "add"}
                  onClick={() => setSelectionMode("add")}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="3" width="13" height="13" rx="2" />
                    <path d="M17 14v7M13.5 17.5h7" />
                  </svg>
                </button>
                <button
                  className={
                    `selection-mode-button${
                      selectionMode === "subtract"
                        ? " is-active"
                        : ""
                    }`
                  }
                  type="button"
                  title="Subtract from selection"
                  aria-label="Subtract from selection"
                  aria-pressed={selectionMode === "subtract"}
                  onClick={() => setSelectionMode("subtract")}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="3" width="13" height="13" rx="2" />
                    <path d="M13.5 17.5h7" />
                  </svg>
                </button>
                <button
                  className="voice-transfer-button"
                  type="button"
                  title="Move selected notes to the selected voice"
                  aria-label="Move selected notes to the selected voice"
                  disabled={
                    !selectionAvailable
                    || selectedVoice === undefined
                    || selectedVoice.locked
                  }
                  style={{
                    color: selectedVoice?.color ?? "#596271",
                  }}
                  onClick={handleTransferSelectionToVoice}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 6h7M4 12h7M4 18h7" />
                    <path d="M13 12h7M17 8l4 4-4 4" />
                  </svg>
                </button>
              </div>
            </div>
          </div>,
          generalInspectorToolbarHost,
        )}

          <div className="roll-frame">
            <PianoKeyboard
              viewport={scene.viewport}
              previewEnabled={pitchPreviewEnabled}
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
                  viewport={scene.viewport}
                  visibleRegion={scene.visibleRegion}
                  spatialIndex={scene.spatialIndex}
                  voiceStyles={scene.voiceStyles}
                  noteColorMode={scene.noteColorMode}
                  projectStore={scene.projectStore}
                  toolState={scene.interactionToolState}
                  selectionMode={selectionMode}
                  activeVoiceId={selectedVoiceId ?? ""}
                  totalTicks={totalTicks}
                  setViewport={publishViewport}
                  gridResolutionTicks={scene.gridResolutionTicks}
                  pitchSnapSettings={scene.pitchSnapSettings}
                  highlightedPitch={scene.highlightedPitch}
                  voiceSelectionRequest={
                    scene.voiceSelectionRequest
                  }
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
              step={EDITOR_CONSTANTS.horizontalScrollStep}
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
                step={EDITOR_CONSTANTS.zoomStep}
                defaultValue={
                  VIEWPORT_CONSTANTS.initialHorizontalZoom
                }
                aria-label="Horizontal zoom"
              />
              <span aria-hidden="true">+</span>
              <output ref={zoomLabelRef}>
                {Math.round(
                  VIEWPORT_CONSTANTS.initialHorizontalZoom * 100,
                )}%
              </output>
            </div>
            <div className="pitch-control">
              <span>Pitch</span>
              <input
                ref={pitchScrollInputRef}
                className="pitch-scroll-range"
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
              <span>Y</span>
              <input
                ref={pitchZoomInputRef}
                className="pitch-zoom-range"
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
            </div>
            <div
              className={
                `pitch-snap-control${
                  pitchSnapSettings.enabled
                    ? " is-active"
                    : ""
                }`
              }
              aria-label="Tonal pitch snapping"
            >
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
                  updatePitchSnapSettings({
                    enabled: !pitchSnapSettings.enabled,
                  });
                }}
              >
                <svg
                  className="pitch-snap-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M7 4v8a5 5 0 0 0 10 0V4" />
                  <path d="M7 8h4v4a1 1 0 0 0 2 0V8h4" />
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
                      {option.label}
                    </option>
                  ),
                )}
              </select>
              <select
                className="pitch-snap-pattern-select"
                value={pitchSnapSettings.patternId}
                aria-label="Pitch snap scale or chord"
                onChange={(event) => {
                  const patternId = event.currentTarget.value;

                  if (isTonalPatternId(patternId)) {
                    updatePitchSnapSettings({
                      patternId,
                    });
                  }
                }}
              >
                <optgroup label="Modes">
                  {TONAL_SNAP_CONSTANTS.patterns.map(
                    (pattern) => (
                      pattern.category === "scale"
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
                <optgroup label="Chords">
                  {TONAL_SNAP_CONSTANTS.patterns.map(
                    (pattern) => (
                      pattern.category === "chord"
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
              </select>
            </div>
          </div>
        </div>

        <aside
          id="general-inspector"
          className={
            `general-inspector${
              generalInspectorOpen ? " is-open" : ""
            }`
          }
        >
          <div
            ref={setGeneralInspectorToolbarHost}
            className="general-inspector-toolbar-host"
          />
          <div className="general-inspector-heading">
            <div>
              <small>Arrangement</small>
              <h1>Voices</h1>
            </div>
            <div className="general-inspector-heading-actions">
              <button
                className={
                  `voice-order-button note-color-toggle${
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
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 2a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 0-3.6h-.6a1.3 1.3 0 0 1 0-2.6H13A5 5 0 0 0 18 7c0-2.8-3.6-5-8-5Z" />
                  <circle cx="6" cy="7" r="1" />
                  <circle cx="9.5" cy="5" r="1" />
                  <circle cx="13" cy="6.5" r="1" />
                </svg>
              </button>
              <button
                className="voice-order-button"
                type="button"
                aria-label="Move selected voice up"
                title="Move selected voice up"
                disabled={selectedVoiceIndex <= 0}
                onClick={() => handleMoveSelectedVoice(-1)}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" />
                </svg>
              </button>
              <button
                className="voice-order-button"
                type="button"
                aria-label="Move selected voice down"
                title="Move selected voice down"
                disabled={
                  selectedVoiceIndex < 0
                  || selectedVoiceIndex
                    >= projectState.voiceOrder.length - 1
                }
                onClick={() => handleMoveSelectedVoice(1)}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 5v10M5.5 10.5 10 15l4.5-4.5" />
                </svg>
              </button>
              <button
                className="general-inspector-close-button"
                type="button"
                aria-label="Close voices"
                onClick={() => setGeneralInspectorOpen(false)}
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
                    <VoiceNameEditor
                      voice={voice}
                      onSelect={handleVoiceSelect}
                      onRename={(name) => {
                        handleUpdateVoice(
                          voice.id,
                          {
                            name,
                          },
                          "Rename voice",
                        );
                      }}
                    />
                  </div>
                  <VoiceGainSlider
                    gain={voice.gain}
                    voiceName={voice.name}
                    onPreview={(gain) => {
                      previewVoiceGain(voice.id, gain);
                    }}
                    onCommit={(gain) => {
                      handleUpdateVoice(
                        voice.id,
                        {
                          gain,
                        },
                        "Update voice volume",
                      );
                    }}
                  />
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
                      <svg
                        className="voice-select-all-icon"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                      >
                        <circle cx="10" cy="10" r="7" />
                        <circle cx="10" cy="10" r="3" />
                        <path d="M10 1v3M10 16v3M1 10h3M16 10h3" />
                      </svg>
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
                      className={
                        voice.solo
                          ? "voice-solo-button is-active"
                          : "voice-solo-button"
                      }
                      type="button"
                      aria-label={`${voice.solo ? "Disable solo for" : "Solo"} ${voice.name}`}
                      aria-pressed={voice.solo}
                      title={
                        voice.solo
                          ? "Disable solo"
                          : "Solo voice"
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        handleUpdateVoice(
                          voice.id,
                          {
                            solo: !voice.solo,
                          },
                          voice.solo
                            ? "Disable voice solo"
                            : "Solo voice",
                        );
                      }}
                    >
                      S
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
                  <strong>
                    <small>{selectedVoice.name}</small>
                  </strong>
                </div>
                <div className="instrument-selectors">
                  <select
                    className="waveform-select"
                    value={
                      selectedVoice.instrument.oscillatorWaveform
                    }
                    aria-label="Oscillator waveform"
                    onChange={(event) => {
                      handleWaveformCommit(
                        selectedVoice.id,
                        event.currentTarget.value as OscillatorWaveform,
                      );
                    }}
                  >
                    {VOICE_CONSTANTS
                      .oscillatorWaveformOptions
                      .map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                  </select>
                  <select
                    className="polyphony-select"
                    value={selectedVoice.instrument.polyphony}
                    aria-label="Instrument polyphony"
                    title="Instrument polyphony"
                    onChange={(event) => {
                      handleInstrumentPolyphonyCommit(
                        selectedVoice.id,
                        Number(event.currentTarget.value),
                      );
                    }}
                  >
                    {INSTRUMENT_POLYPHONY_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="wave-display" aria-hidden="true">
                <svg viewBox="0 0 240 54" preserveAspectRatio="none">
                  <path d={getWaveformPath(selectedVoice)} />
                </svg>
              </div>

              <div className="parameter-grid">
                <ParameterSlider
                  key={`${selectedVoice.id}-attack`}
                  label="Attack"
                  value={
                    selectedVoice.instrument.envelope.attackSeconds
                  }
                  minimum={0}
                  maximum={
                    EDITOR_CONSTANTS.envelopeTimeMaximumSeconds
                  }
                  step={
                    EDITOR_CONSTANTS.envelopeTimeStepSeconds
                  }
                  formatValue={formatEnvelopeTime}
                  onCommit={(value) => {
                    handleEnvelopeParameterCommit(
                      selectedVoice.id,
                      "attackSeconds",
                      value,
                    );
                  }}
                />
                <ParameterSlider
                  key={`${selectedVoice.id}-decay`}
                  label="Decay"
                  value={
                    selectedVoice.instrument.envelope.decaySeconds
                  }
                  minimum={0}
                  maximum={
                    EDITOR_CONSTANTS.envelopeTimeMaximumSeconds
                  }
                  step={
                    EDITOR_CONSTANTS.envelopeTimeStepSeconds
                  }
                  formatValue={formatEnvelopeTime}
                  onCommit={(value) => {
                    handleEnvelopeParameterCommit(
                      selectedVoice.id,
                      "decaySeconds",
                      value,
                    );
                  }}
                />
                <ParameterSlider
                  key={`${selectedVoice.id}-sustain`}
                  label="Sustain"
                  value={
                    selectedVoice.instrument.envelope.sustainLevel
                  }
                  minimum={0}
                  maximum={1}
                  step={EDITOR_CONSTANTS.sustainStep}
                  formatValue={formatPercentage}
                  onCommit={(value) => {
                    handleEnvelopeParameterCommit(
                      selectedVoice.id,
                      "sustainLevel",
                      value,
                    );
                  }}
                />
                <ParameterSlider
                  key={`${selectedVoice.id}-release`}
                  label="Release"
                  value={
                    selectedVoice.instrument.envelope.releaseSeconds
                  }
                  minimum={0}
                  maximum={
                    EDITOR_CONSTANTS.envelopeTimeMaximumSeconds
                  }
                  step={
                    EDITOR_CONSTANTS.envelopeTimeStepSeconds
                  }
                  formatValue={formatEnvelopeTime}
                  onCommit={(value) => {
                    handleEnvelopeParameterCommit(
                      selectedVoice.id,
                      "releaseSeconds",
                      value,
                    );
                  }}
                />
              </div>
            </section>
          )}

        </aside>
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

interface VoiceNameEditorProps {
  readonly voice: Voice;
  readonly onSelect: (voiceId: VoiceId) => void;
  readonly onRename: (name: string) => void;
}

const VOICE_NAME_LONG_PRESS_DELAY_MS =
  INTERACTION_CONSTANTS.voiceNameLongPressDelayMs;
const VOICE_NAME_LONG_PRESS_MOVEMENT_TOLERANCE =
  INTERACTION_CONSTANTS.voiceNameLongPressMovementToleranceCssPixels;

function VoiceNameEditor(
  props: VoiceNameEditorProps,
): React.JSX.Element {
  const {
    voice,
    onSelect,
    onRename,
  } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressPointerIdRef = useRef(-1);
  const longPressOriginXRef = useRef(0);
  const longPressOriginYRef = useRef(0);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const input = inputRef.current;

    if (input === null) {
      return;
    }

    if (editing) {
      input.focus();
      input.select();
    } else {
      input.value = voice.name;
    }
  }, [
    editing,
    voice.name,
  ]);

  useEffect(() => () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
  }, []);

  const cancelLongPress = (): void => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    longPressPointerIdRef.current = -1;
  };

  const beginEditing = (): void => {
    cancelLongPress();
    setEditing(true);
  };

  return (
    <input
      ref={inputRef}
      className="voice-name-input"
      type="text"
      defaultValue={voice.name}
      maxLength={MAXIMUM_VOICE_NAME_LENGTH}
      readOnly={!editing}
      tabIndex={editing ? 0 : -1}
      aria-label={`Name for ${voice.name}`}
      title="Press and hold to rename"
      onPointerDown={(event) => {
        event.stopPropagation();

        if (!editing) {
          event.preventDefault();
          onSelect(voice.id);
          cancelLongPress();
          longPressPointerIdRef.current = event.pointerId;
          longPressOriginXRef.current = event.clientX;
          longPressOriginYRef.current = event.clientY;

          if (
            !event.currentTarget.hasPointerCapture(event.pointerId)
          ) {
            event.currentTarget.setPointerCapture(event.pointerId);
          }

          longPressTimerRef.current = window.setTimeout(
            beginEditing,
            VOICE_NAME_LONG_PRESS_DELAY_MS,
          );
        }
      }}
      onPointerMove={(event) => {
        event.stopPropagation();

        if (
          event.pointerId === longPressPointerIdRef.current
          && (
            Math.abs(
              event.clientX - longPressOriginXRef.current,
            ) > VOICE_NAME_LONG_PRESS_MOVEMENT_TOLERANCE
            || Math.abs(
              event.clientY - longPressOriginYRef.current,
            ) > VOICE_NAME_LONG_PRESS_MOVEMENT_TOLERANCE
          )
        ) {
          cancelLongPress();
        }
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        cancelLongPress();

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        cancelLongPress();
      }}
      onLostPointerCapture={cancelLongPress}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onBlur={(event) => {
        if (!editing) {
          return;
        }

        const name = event.currentTarget.value.trim();

        if (name.length === 0) {
          event.currentTarget.value = voice.name;
        } else if (name !== voice.name) {
          onRename(name);
        }

        setEditing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
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

function canPlacePastedNotes(
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

  }

  return notes.length > 0;
}

type VoiceTransferPlan =
  | {
      readonly valid: true;
      readonly commands: readonly PianoRollCommand[];
      readonly originalNotes: readonly Note[];
      readonly proposedNotes: readonly Note[];
    }
  | {
      readonly valid: false;
      readonly message: string;
    };

function createVoiceTransferPlan(
  state: ProjectState,
  selectedNotes: readonly Note[],
  targetVoiceId: VoiceId,
): VoiceTransferPlan {
  const targetVoice = state.voicesById[targetVoiceId];
  const targetTrack = state.tracksByVoiceId[targetVoiceId];

  if (targetVoice === undefined || targetTrack === undefined) {
    return {
      valid: false,
      message: "The selected target voice is unavailable.",
    };
  }

  if (targetVoice.locked) {
    return {
      valid: false,
      message: "Unlock the selected target voice before transferring notes.",
    };
  }

  const transferredNotes: Note[] = [];
  const originalNotes: Note[] = [];
  const noteIdsBySourceVoice = new Map<VoiceId, NoteId[]>();

  for (
    let noteIndex = 0;
    noteIndex < selectedNotes.length;
    noteIndex += 1
  ) {
    const selectedNote = selectedNotes[noteIndex];

    if (selectedNote === undefined) {
      continue;
    }

    const sourceVoice = state.voicesById[selectedNote.voiceId];
    const sourceTrack =
      state.tracksByVoiceId[selectedNote.voiceId];

    if (
      sourceVoice === undefined
      || sourceTrack?.notesById[selectedNote.id] === undefined
    ) {
      return {
        valid: false,
        message: "The selection contains a note that is no longer available.",
      };
    }

    if (sourceVoice.locked) {
      return {
        valid: false,
        message: `Unlock voice "${sourceVoice.name}" before transferring its notes.`,
      };
    }

    if (selectedNote.voiceId === targetVoiceId) {
      continue;
    }

    if (targetTrack.notesById[selectedNote.id] !== undefined) {
      return {
        valid: false,
        message: `Transfer cancelled because note ID "${selectedNote.id}" already exists in the target voice.`,
      };
    }

    const transferredNote: Note = {
      ...selectedNote,
      voiceId: targetVoiceId,
    };

    originalNotes.push(selectedNote);
    transferredNotes.push(transferredNote);
    let sourceNoteIds =
      noteIdsBySourceVoice.get(selectedNote.voiceId);

    if (sourceNoteIds === undefined) {
      sourceNoteIds = [];
      noteIdsBySourceVoice.set(
        selectedNote.voiceId,
        sourceNoteIds,
      );
    }

    sourceNoteIds.push(selectedNote.id);
  }

  const commands: PianoRollCommand[] = [];

  for (const [sourceVoiceId, noteIds] of noteIdsBySourceVoice) {
    commands.push({
      type: "MoveNotes",
      sourceVoiceId,
      targetVoiceId,
      noteIds,
      deltaTicks: 0,
      deltaPitch: 0,
    });
  }

  return {
    valid: true,
    commands,
    originalNotes,
    proposedNotes: transferredNotes,
  };
}

function findNotesByIds(
  state: ProjectState,
  noteIds: readonly NoteId[],
): readonly Note[] {
  const notes: Note[] = [];
  const acceptedNoteIds = new Set<NoteId>();

  for (const noteId of noteIds) {
    if (acceptedNoteIds.has(noteId)) {
      continue;
    }

    for (const voiceId of state.voiceOrder) {
      const note =
        state.tracksByVoiceId[voiceId]?.notesById[noteId];

      if (note !== undefined) {
        acceptedNoteIds.add(note.id);
        notes.push(note);
        break;
      }
    }
  }

  return notes;
}

function createUserVoice(
  voiceIndex: number,
  sequence: number,
): Voice {
  const color =
    RENDERING_CONSTANTS.userVoiceColors[
      voiceIndex % RENDERING_CONSTANTS.userVoiceColors.length
    ]
    ?? "#79a7ff";

  return createDefaultVoice({
    id: `voice-${Date.now()}-${sequence + 1}`,
    name: `Voice ${voiceIndex + 1}`,
    color,
    oscillatorWaveform:
      getDefaultOscillatorWaveform(voiceIndex),
  });
}

function getVoiceInstrumentLabel(): string {
  return "Oscillator";
}

function getVoiceWaveform(voice: Voice): OscillatorWaveform {
  return voice.instrument.oscillatorWaveform;
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

function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

interface PianoKeyboardProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly previewEnabled: boolean;
  readonly onPreviewToggle: () => void;
  readonly onPitchAudition?: (pitch: number) => void;
  readonly onPitchLongPress?: (pitch: number) => void;
  readonly onPitchInteractionChange?: (
    pitch: number | null,
  ) => void;
}

interface TransportMetricsProps {
  readonly projectStore: DemoScene["projectStore"];
  readonly gridSettings: DemoScene["gridSettings"];
}

function TransportMetrics(
  props: TransportMetricsProps,
): React.JSX.Element {
  const {
    projectStore,
    gridSettings,
  } = props;
  const tempoInputRef = useRef<HTMLInputElement | null>(null);
  const gridSelectRef = useRef<HTMLSelectElement | null>(null);
  const subdivisionSelectRef =
    useRef<HTMLSelectElement | null>(null);
  const transactionSequenceRef = useRef(0);
  const [meterValue, setMeterValue] = useState(() =>
    formatTimeSignatureValue(
      projectStore.getState().transportSettings.timeSignature,
    ));

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

      setMeterValue(
        formatTimeSignatureValue(transport.timeSignature),
      );
    };
    const updateGridControl = (): void => {
      const settings = gridSettings.get();

      if (gridSelectRef.current !== null) {
        gridSelectRef.current.value = String(
          settings.baseResolutionTicks,
        );
      }

      if (subdivisionSelectRef.current !== null) {
        subdivisionSelectRef.current.value =
          settings.subdivision;
      }
    };
    const unsubscribeProject = projectStore.subscribe(
      updateTransportControls,
    );
    const unsubscribeGrid = gridSettings.subscribe(
      updateGridControl,
    );

    updateTransportControls();
    updateGridControl();

    return (): void => {
      unsubscribeProject();
      unsubscribeGrid();
    };
  }, [
    gridSettings,
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
        EDITOR_CONSTANTS.tempoMaximumBpm,
        Math.max(
          EDITOR_CONSTANTS.tempoMinimumBpm,
          Math.round(
            requestedBpm
            / EDITOR_CONSTANTS.tempoStepBpm,
          ) * EDITOR_CONSTANTS.tempoStepBpm,
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

      setMeterValue(event.currentTarget.value);
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
        gridSettings.set(
          createGridSettings(
            baseResolutionTicks,
            gridSettings.get().subdivision,
          ),
        );
      }
    },
    [gridSettings],
  );
  const handleSubdivisionChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const subdivision = parseGridSubdivision(
        event.currentTarget.value,
      );

      if (subdivision === null) {
        return;
      }

      gridSettings.set(
        createGridSettings(
          gridSettings.get().baseResolutionTicks,
          subdivision,
        ),
      );
    },
    [gridSettings],
  );

  return (
    <div className="transport-metrics" aria-label="Transport settings">
      <label className="metric">
        <small>Tempo</small>
        <input
          ref={tempoInputRef}
          className="metric-control tempo-control"
          type="number"
          min={EDITOR_CONSTANTS.tempoMinimumBpm}
          max={EDITOR_CONSTANTS.tempoMaximumBpm}
          step={EDITOR_CONSTANTS.tempoStepBpm}
          defaultValue={PROJECT_CONSTANTS.demoTempoBpm.toFixed(1)}
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
          className="metric-control metric-select"
          value={meterValue}
          onChange={handleMeterChange}
          aria-label="Time signature"
        >
          {isConfiguredTimeSignatureValue(meterValue)
            ? null
            : (
                <option value={meterValue}>
                  {meterValue.replace("/", " / ")}
                </option>
              )}
          {EDITOR_CONSTANTS.transportMeterOptions.map(
            (option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ),
          )}
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
          {EDITOR_CONSTANTS.gridResolutionOptions.map(
            (option) => (
              <option key={option.ticks} value={option.ticks}>
                {option.label}
              </option>
            ),
          )}
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
          {EDITOR_CONSTANTS.gridSubdivisionOptions.map(
            (option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ),
          )}
        </select>
      </label>
    </div>
  );
}

function parseTimeSignature(
  value: string,
): TimeSignature | null {
  const parts = value.split("/");

  if (parts.length !== 2) {
    return null;
  }

  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);

  if (
    !Number.isSafeInteger(numerator)
    || numerator <= 0
    || (
      denominator !== 1
      && denominator !== 2
      && denominator !== 4
      && denominator !== 8
      && denominator !== 16
      && denominator !== 32
    )
  ) {
    return null;
  }

  return {
    numerator,
    denominator,
  };
}

function formatTimeSignatureValue(
  timeSignature: TimeSignature,
): string {
  return (
    `${String(timeSignature.numerator)}`
    + `/${String(timeSignature.denominator)}`
  );
}

function isConfiguredTimeSignatureValue(
  value: string,
): boolean {
  return EDITOR_CONSTANTS.transportMeterOptions.some(
    (option) => option.value === value,
  );
}

interface BarRulerProps {
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly projectStore: DemoScene["projectStore"];
  readonly gridResolutionTicks: DemoScene["gridResolutionTicks"];
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

interface TimelineLoopRegionProps {
  readonly viewport: DemoScene["viewport"];
  readonly projectStore: DemoScene["projectStore"];
  readonly gridResolutionTicks: DemoScene["gridResolutionTicks"];
  readonly onCommit: (loop: LoopRegion) => void;
}

function TimelineLoopRegion(
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

      const transport =
        projectStore.getState().transportSettings;

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
        projectStore.getState().transportSettings.loopEnabled,
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
      const loop = state.transportSettings.loop;
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
      projectDurationTicks = getProjectDurationTicks(state);
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

function BarRuler(
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
        getProjectDurationTicks(projectStore.getState()),
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
    previewEnabled,
    onPreviewToggle,
    onPitchAudition,
    onPitchLongPress,
    onPitchInteractionChange,
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

    if (
      element === null
      || (
        onPitchAudition === undefined
        && onPitchLongPress === undefined
      )
    ) {
      return undefined;
    }

    let activePointerId = -1;
    let activePitch = -1;
    let originClientX = 0;
    let originClientY = 0;
    let longPressTimerId: number | null = null;

    const clearLongPress = (): void => {
      if (longPressTimerId !== null) {
        window.clearTimeout(longPressTimerId);
        longPressTimerId = null;
      }
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || activePointerId !== -1) {
        return;
      }

      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-pitch]")
          : null;
      const pitch = Number(target?.dataset["pitch"]);

      if (Number.isInteger(pitch)) {
        activePointerId = event.pointerId;
        activePitch = pitch;
        onPitchInteractionChange?.(pitch);
        originClientX = event.clientX;
        originClientY = event.clientY;
        element.setPointerCapture(event.pointerId);
        if (previewEnabled) {
          onPitchAudition?.(pitch);
        }

        if (onPitchLongPress !== undefined) {
          const delay =
            event.pointerType === "pen"
              ? PIANO_KEY_PEN_LONG_PRESS_DELAY_MS
              : PIANO_KEY_LONG_PRESS_DELAY_MS;

          longPressTimerId = window.setTimeout(() => {
            longPressTimerId = null;

            if (
              activePointerId === event.pointerId
              && activePitch === pitch
            ) {
              onPitchLongPress(pitch);
            }
          }, delay);
        }

        event.preventDefault();
      }
    };
    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      if (
        Math.abs(event.clientX - originClientX)
          > PIANO_KEY_LONG_PRESS_MOVEMENT_TOLERANCE
        || Math.abs(event.clientY - originClientY)
          > PIANO_KEY_LONG_PRESS_MOVEMENT_TOLERANCE
      ) {
        clearLongPress();
      }

      event.preventDefault();
    };
    const finishPointer = (event: PointerEvent): void => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      clearLongPress();
      activePointerId = -1;
      activePitch = -1;
      onPitchInteractionChange?.(null);

      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }

      event.preventDefault();
    };
    const handleContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
    };

    element.addEventListener("pointerdown", handlePointerDown);
    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("pointerup", finishPointer);
    element.addEventListener("pointercancel", finishPointer);
    element.addEventListener("lostpointercapture", finishPointer);
    element.addEventListener("contextmenu", handleContextMenu);

    return (): void => {
      clearLongPress();
      onPitchInteractionChange?.(null);
      element.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
      element.removeEventListener(
        "pointermove",
        handlePointerMove,
      );
      element.removeEventListener("pointerup", finishPointer);
      element.removeEventListener(
        "pointercancel",
        finishPointer,
      );
      element.removeEventListener(
        "lostpointercapture",
        finishPointer,
      );
      element.removeEventListener(
        "contextmenu",
        handleContextMenu,
      );
    };
  }, [
    onPitchAudition,
    onPitchLongPress,
    onPitchInteractionChange,
    previewEnabled,
  ]);

  return (
    <div className="piano-strip" aria-label="Piano keyboard">
      <div className="piano-loop-spacer" aria-hidden="true" />
      <div className="piano-ruler-spacer" aria-hidden="true" />
      <button
        className={
          previewEnabled
            ? "piano-preview-toggle is-active"
            : "piano-preview-toggle"
        }
        type="button"
        aria-label={
          previewEnabled
            ? "Disable pitch preview"
            : "Enable pitch preview"
        }
        aria-pressed={previewEnabled}
        title={
          previewEnabled
            ? "Disable pitch preview"
            : "Enable pitch preview"
        }
        onClick={onPreviewToggle}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 10v4h4l5 4V6l-5 4H5Z" />
          {previewEnabled ? (
            <>
              <path d="M17 9.5a4 4 0 0 1 0 5" />
              <path d="M19 7a7 7 0 0 1 0 10" />
            </>
          ) : (
            <path d="m17 10 4 4m0-4-4 4" />
          )}
        </svg>
      </button>
      <div className="piano-keyboard-viewport">
        <div ref={keysElementRef} className="piano-keys-inner">
          {PIANO_KEYS}
        </div>
      </div>
    </div>
  );
}

interface VoiceGainSliderProps {
  readonly gain: number;
  readonly voiceName: string;
  readonly onPreview: (gain: number) => void;
  readonly onCommit: (gain: number) => void;
}

function VoiceGainSlider(
  props: VoiceGainSliderProps,
): React.JSX.Element {
  const {
    gain,
    voiceName,
    onPreview,
    onCommit,
  } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastCommittedGainRef = useRef(gain);

  useEffect(() => {
    if (inputRef.current !== null) {
      inputRef.current.value = String(gain);
    }

    lastCommittedGainRef.current = gain;
  }, [gain]);

  const commitGain = (): void => {
    const nextGain = Number(inputRef.current?.value);

    if (
      !Number.isFinite(nextGain)
      || nextGain === lastCommittedGainRef.current
    ) {
      return;
    }

    lastCommittedGainRef.current = nextGain;
    onCommit(nextGain);
  };

  return (
    <label
      className="voice-gain-control"
      title={`Volume for ${voiceName}`}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <input
        ref={inputRef}
        type="range"
        min={VOICE_CONSTANTS.minimumGain}
        max={VOICE_CONSTANTS.maximumGain}
        step={EDITOR_CONSTANTS.gainStep}
        defaultValue={gain}
        aria-label={`Volume for ${voiceName}`}
        onInput={(event) => {
          onPreview(Number(event.currentTarget.value));
        }}
        onPointerUp={commitGain}
        onPointerCancel={commitGain}
        onBlur={commitGain}
        onKeyUp={commitGain}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
      />
    </label>
  );
}

interface ParameterSliderProps {
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly formatValue: (value: number) => string;
  readonly onCommit: (value: number) => void;
}

function ParameterSlider(
  props: ParameterSliderProps,
): React.JSX.Element {
  const {
    label,
    value,
    minimum,
    maximum,
    step,
    formatValue,
    onCommit,
  } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef<HTMLElement | null>(null);
  const lastCommittedValueRef = useRef(value);

  const updateVisual = useCallback((nextValue: number): void => {
    if (valueRef.current !== null) {
      valueRef.current.textContent = formatValue(nextValue);
    }
  }, [
    formatValue,
  ]);

  useEffect(() => {
    if (inputRef.current !== null) {
      inputRef.current.value = String(
        parameterValueToSliderPosition(
          value,
          minimum,
          maximum,
        ),
      );
    }

    lastCommittedValueRef.current = value;
    updateVisual(value);
  }, [
    updateVisual,
    value,
  ]);

  const commitValue = (): void => {
    const sliderPosition = Number(inputRef.current?.value);

    if (!Number.isFinite(sliderPosition)) {
      return;
    }

    const nextValue = sliderPositionToParameterValue(
      sliderPosition,
      minimum,
      maximum,
      step,
    );

    if (
      !Number.isFinite(nextValue)
      || nextValue === lastCommittedValueRef.current
    ) {
      return;
    }

    lastCommittedValueRef.current = nextValue;
    onCommit(nextValue);
  };

  return (
    <label
      className="parameter"
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <div className="parameter-copy">
        <span>{label}</span>
        <strong ref={valueRef}>{formatValue(value)}</strong>
      </div>
      <div className="parameter-input-vertical">
        <input
          ref={inputRef}
          className="parameter-input"
          type="range"
          min="0"
          max="1"
          step={EDITOR_CONSTANTS.parameterSliderPositionStep}
          defaultValue={parameterValueToSliderPosition(
            value,
            minimum,
            maximum,
          )}
          aria-label={label}
          onInput={(event) => {
            updateVisual(
              sliderPositionToParameterValue(
                Number(event.currentTarget.value),
                minimum,
                maximum,
                step,
              ),
            );
          }}
          onContextMenu={(event) => {
            event.preventDefault();
          }}
          onPointerUp={commitValue}
          onPointerCancel={commitValue}
          onBlur={commitValue}
          onKeyUp={commitValue}
        />
      </div>
    </label>
  );
}

function parameterValueToSliderPosition(
  value: number,
  minimum: number,
  maximum: number,
): number {
  const range = maximum - minimum;

  if (range <= 0) {
    return 0;
  }

  const normalizedValue = Math.min(
    1,
    Math.max(0, (value - minimum) / range),
  );

  return normalizedValue ** (
    1 / ENVELOPE_SLIDER_CURVE_EXPONENT
  );
}

function sliderPositionToParameterValue(
  position: number,
  minimum: number,
  maximum: number,
  step: number,
): number {
  const normalizedPosition = Math.min(
    1,
    Math.max(0, Number.isFinite(position) ? position : 0),
  );
  const rawValue =
    minimum
    + (maximum - minimum)
      * normalizedPosition ** ENVELOPE_SLIDER_CURVE_EXPONENT;
  const steppedValue =
    minimum
    + Math.round((rawValue - minimum) / step) * step;

  return Math.min(
    maximum,
    Math.max(minimum, Number(steppedValue.toFixed(6))),
  );
}

interface MasterGainControlProps {
  readonly gain: number;
  readonly muted: boolean;
  readonly onPreview: (gain: number) => void;
  readonly onCommit: (gain: number) => void;
  readonly onMuteToggle: () => void;
}

function MasterGainControl(
  props: MasterGainControlProps,
): React.JSX.Element {
  const {
    gain,
    muted,
    onPreview,
    onCommit,
    onMuteToggle,
  } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const outputRef = useRef<HTMLOutputElement | null>(null);
  const lastCommittedGainRef = useRef(gain);

  const updateVisual = useCallback((nextGain: number): void => {
    if (outputRef.current !== null) {
      outputRef.current.value =
        formatMasterGainDecibels(nextGain);
    }

  }, []);

  useEffect(() => {
    if (inputRef.current !== null) {
      inputRef.current.value = String(gain);
    }

    lastCommittedGainRef.current = gain;
    updateVisual(gain);
  }, [
    gain,
    updateVisual,
  ]);

  const commitGain = (): void => {
    const nextGain = Number(inputRef.current?.value);

    if (
      !Number.isFinite(nextGain)
      || nextGain === lastCommittedGainRef.current
    ) {
      return;
    }

    lastCommittedGainRef.current = nextGain;
    onCommit(nextGain);
  };

  return (
    <section
      className={
        muted
          ? "master-bus-control is-muted"
          : "master-bus-control"
      }
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <div className="master-bus-heading">
        <small>Master</small>
        <output ref={outputRef}>
          {formatMasterGainDecibels(gain)}
        </output>
      </div>
      <div className="master-bus-controls">
        <input
          ref={inputRef}
          className="master-gain-input"
          type="range"
          min={MINIMUM_MASTER_GAIN}
          max={MAXIMUM_MASTER_GAIN}
          step={EDITOR_CONSTANTS.gainStep}
          defaultValue={gain}
          aria-label="Master gain"
          onInput={(event) => {
            const nextGain = Number(event.currentTarget.value);

            updateVisual(nextGain);
            onPreview(nextGain);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
          }}
          onPointerUp={commitGain}
          onPointerCancel={commitGain}
          onBlur={commitGain}
          onKeyUp={commitGain}
        />
        <button
          className="master-mute-button"
          type="button"
          aria-label={muted ? "Unmute master bus" : "Mute master bus"}
          aria-pressed={muted}
          title={muted ? "Unmute master bus" : "Mute master bus"}
          onClick={onMuteToggle}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
            {muted ? (
              <path d="m16.5 9.5 4 5m0-5-4 5" />
            ) : (
              <path d="M16.5 9.5a4 4 0 0 1 0 5" />
            )}
          </svg>
        </button>
      </div>
    </section>
  );
}

function formatMasterGainDecibels(gain: number): string {
  if (gain <= 0) {
    return "−∞ dB";
  }

  return `${(20 * Math.log10(gain)).toFixed(1)} dB`;
}

function createPianoKeys(): readonly React.JSX.Element[] {
  const keys: React.JSX.Element[] = [];

  for (
    let pitch = VIEWPORT_CONSTANTS.maximumMidiPitch;
    pitch >= VIEWPORT_CONSTANTS.minimumMidiPitch;
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

function formatTempo(tempoBpm: number): string {
  if (Number.isInteger(tempoBpm)) {
    return String(tempoBpm);
  }

  return tempoBpm.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
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

function downloadBrowserFile(
  blob: Blob,
  fileName: string,
): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, FILE_CONSTANTS.objectUrlRevokeDelayMs);
}

function createNativeProjectFileMetadata():
  NativeProjectFileMetadata {
  const now = new Date().toISOString();
  const documentId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : (
          `project-${Date.now()}-`
          + Math.random().toString(36).slice(2)
        );

  return {
    documentId,
    createdAt: now,
    savedAt: now,
  };
}

function formatNativeProjectError(
  prefix: string,
  error: unknown,
): string {
  if (error instanceof NativeProjectFileError) {
    const location =
      error.path === "$" ? "" : ` Location: ${error.path}.`;

    return `${prefix} ${error.message}${location}`;
  }

  if (error instanceof Error) {
    return `${prefix} ${error.message}`;
  }

  return prefix;
}

function formatAudioPlaybackError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "The browser could not initialize the audio engine.";
}
