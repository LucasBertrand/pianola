import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createPortal,
} from "react-dom";
import {
  APPLICATION_CONSTANTS,
} from "../../config/product-config";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import {
  getClipDurationTicks,
} from "../../domain/clips/clip";
import {
  getMeasureCount,
} from "../../domain/transport/time-map";
import { isNoteEditable } from "../../domain/notes/note";
import type {
  LoopRegion,
} from "../../domain/transport/transport";
import {
  createTimeMapMarkerFlags,
} from "../../use-cases/piano-roll/timeline/time-map-marker-plans";
import {
  useTimeMapMarkerWorkflow,
} from "../../ui/piano-roll/useTimeMapMarkerWorkflow";
import {
  TempoMeterMarkerDialog,
} from "../../ui/dialogs/TempoMeterMarkerDialog";
import {
  ManageMeasuresDialog,
} from "../../ui/dialogs/ManageMeasuresDialog";
import {
  type MidiImportAnalysis,
} from "../../project-io/midi/midi-import-types";
import {
  ApplicationDialogOverlay,
} from "../../ui/dialogs/ApplicationDialogOverlay";
import {
  useApplicationDialogs,
} from "../../ui/dialogs/useApplicationDialogs";
import {
  PianoRollLayers,
} from "../../ui/piano-roll/PianoRollLayers";
import {
  PianoRollViewportControls,
} from "../../ui/editor-toolbar/PianoRollViewportControls";
import {
  computeClipFitViewport,
} from "../../editor/viewport/compute-clip-fit-viewport";
import {
  PianoRollRuler,
  PianoRollPlayhead,
} from "../../ui/piano-roll/PianoRollTimeline";
import {
  PianoRollGlobalLasso,
} from "../../ui/piano-roll/PianoRollGlobalLasso";
import {
  PianoKeyboard,
} from "../../ui/piano-roll/PianoKeyboard";
import {
  EditorToolbar,
} from "../../ui/editor-toolbar/EditorToolbar";
import {
  ProjectInspector,
} from "../../ui/inspector/ProjectInspector";
import {
  ProjectInspectorResizeHandle,
} from "../../ui/inspector/ProjectInspectorResizeHandle";
import {
  InstrumentPresetDialog,
} from "../../ui/dialogs/InstrumentPresetDialog";
import {
  ClipEditorDialog,
} from "../../ui/dialogs/ClipEditorDialog";
import {
  EditorHeader,
} from "../../ui/editor-toolbar/EditorHeader";
import {
  useAudioPlayback,
} from "../../ui/transport/useAudioPlayback";
import type {
  PianoRollControllerPort,
} from "../../editor/interactions/piano-roll-controller-port";
import type {
  PointerInteractionStrategy,
} from "../../editor/interactions/pointer/pointer-interaction-strategy";
import {
  type PitchSnapSettings,
} from "../../music/pitch-snap";
import type {
  SelectionMode,
} from "../../editor/interactions/gestures/gesture-draft";
import type {
  NoteColorMode,
} from "../../editor/model/note-color-mode";
import type {
  EditorRuntime,
} from "../../editor/runtime/editor-runtime";
import {
  MutableRenderSignal,
} from "../../editor/model/render-signal";
import type {
  TimelineDragPreview,
} from "../../editor/model/timeline-drag-preview";
import {
  useClipWorkflow,
} from "../../ui/inspector/clips/useClipWorkflow";
import {
  useClipDialogWorkflow,
} from "../../ui/inspector/clips/useClipDialogWorkflow";
import {
  useProjectInstrumentWorkflow,
} from "../../ui/inspector/instruments/useProjectInstrumentWorkflow";
import {
  usePianoRollSelectionWorkflow,
} from "../../ui/piano-roll/usePianoRollSelectionWorkflow";
import {
  useProjectFileWorkflow,
} from "../../ui/project-files/useProjectFileWorkflow";
import {
  useProjectAutosave,
} from "../../ui/project-files/useProjectAutosave";
import {
  getPlaybackFollowTargetClipId,
  resolvePlaybackFollowClipSelection,
  shouldReturnViewportToStart,
} from "../../ui/transport/playback-follow-policy";
import {
  useMidiFileWorkflow,
} from "../../ui/project-files/useMidiFileWorkflow";
import {
  useTransportWorkflow,
} from "../../ui/transport/useTransportWorkflow";
import {
  usePrimaryActionTrigger,
} from "./interactions/usePrimaryActionTrigger";
import {
  useStylusAction,
} from "./interactions/useStylusAction";
import {
  FloatingRadialMenu,
  type FloatingRadialMenuItem,
} from "./context-menu/FloatingRadialMenu";
import {
  CommandIcon,
} from "../shared/CommandIcon";
import {
  useFloatingRadialMenu,
} from "./context-menu/useFloatingRadialMenu";
import {
  useKeyboardShortcut,
} from "./interactions/useKeyboardShortcut";
import {
  useViewportControls,
} from "../../ui/piano-roll/useViewportControls";
import {
  useInstrumentDialogWorkflow,
} from "../../ui/inspector/instruments/useInstrumentDialogWorkflow";
import {
  useNoteCollisionDialogWorkflow,
} from "./interactions/useNoteCollisionDialogWorkflow";
import {
  useMarkerCollisionDialogWorkflow,
} from "./interactions/useMarkerCollisionDialogWorkflow";
import {
  usePianoRollProjectState,
} from "./usePianoRollProjectState";
import type {
  ProjectRepository,
  ProjectWorkspaceState,
} from "../../persistence/project-persistence-model";
import type {
  UserSettings,
  UserSettingsRepository,
} from "../../persistence/user-settings-model";
import {
  captureProjectWorkspace,
} from "../../use-cases/persistence/project-workspace";
import {
  createPersonalInstrumentPreset,
  createPersonalInstrumentPresetId,
  mergeInstrumentPresetLibraries,
} from "../../domain/personal-instrument-presets";
import {
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
  MAXIMUM_PROJECT_INSTRUMENT_COUNT,
  type InstrumentPreset,
  type SubtractiveSynthConfig,
} from "../../domain/instruments/instrument";
import type {
  PresetId,
} from "../../domain/identifiers";

export interface PianoRollWorkspaceProps {
  readonly runtime: EditorRuntime;
  readonly documentId: string;
  readonly storedRevision: number;
  readonly initialWorkspace: ProjectWorkspaceState;
  readonly projectRepository: ProjectRepository;
  readonly initialUserSettings: UserSettings;
  readonly userSettingsRepository: UserSettingsRepository;
  readonly onUserSettingsChange: (settings: UserSettings) => void;
  readonly onCloseProject: () => void | Promise<void>;
}

/** Coordinates the workflows that meet on the piano-roll workspace. */
export function PianoRollWorkspace({
  runtime,
  documentId,
  storedRevision,
  initialWorkspace,
  projectRepository,
  initialUserSettings,
  userSettingsRepository,
  onUserSettingsChange,
  onCloseProject,
}: PianoRollWorkspaceProps): React.JSX.Element {
  const pianoRollControllerRef =
    useRef<PianoRollControllerPort | null>(null);
  const interactionStrategyRef =
    useRef<PointerInteractionStrategy | null>(null);
  const globalLassoRef = useRef<HTMLDivElement | null>(null);
  const timelineDragPreview = useMemo(
    () => new MutableRenderSignal<TimelineDragPreview | null>(null),
    [],
  );
  const loopDragPreview = useMemo(
    () => new MutableRenderSignal<LoopRegion | null>(null),
    [],
  );
  const pendingMidiImportRef =
    useRef<MidiImportAnalysis | null>(null);

  const {
    project: projectState,
    selectedInstrumentId,
    selectedNotes,
    selectedMarkerCount,
    selectInstrument: setSelectedInstrumentId,
    setSelectionAvailable,
    handleSelectionChange,
    clearInteractionSelection,
  } = usePianoRollProjectState(runtime, pianoRollControllerRef);
  const [projectInspectorOpen, setGeneralInspectorOpen] =
    useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(false);
  const [manageMeasuresDialogOpen, setManageMeasuresDialogOpen] =
    useState(false);
  const [projectInspectorSection, setGeneralInspectorSection] =
    useState<"instruments" | "clips">("instruments");
  const [
    projectInspectorToolbarHost,
    setGeneralInspectorToolbarHost,
  ] = useState<HTMLDivElement | null>(null);
  const [selectionMode, setSelectionMode] =
    useState<SelectionMode>(initialUserSettings.selectionMode);
  const [noteColorMode, setNoteColorMode] =
    useState<NoteColorMode>(
      initialUserSettings.noteColorMode,
    );
  const [pitchPreviewEnabled, setPitchPreviewEnabled] =
    useState<boolean>(
      initialUserSettings.pitchPreviewEnabled,
    );
  const [pitchSnapSettings, setPitchSnapSettings] =
    useState<PitchSnapSettings>(
      () => runtime.pitchSnapSettings.get(),
  );
  const [gridResolutionTicks, setGridResolutionTicks] = useState(
    () => runtime.gridResolutionTicks.get(),
  );
  const activeClip = getActiveClip(projectState);
  const mergedPresetLibrary = useMemo(() => mergeInstrumentPresetLibraries(
    projectState.instrumentPresetsById,
    projectState.instrumentPresetOrder,
    initialUserSettings.personalInstrumentPresetsById,
    initialUserSettings.personalInstrumentPresetOrder,
  ), [
    initialUserSettings.personalInstrumentPresetOrder,
    initialUserSettings.personalInstrumentPresetsById,
    projectState.instrumentPresetOrder,
    projectState.instrumentPresetsById,
  ]);
  const personalPresetIds = useMemo(
    () => new Set(initialUserSettings.personalInstrumentPresetOrder),
    [initialUserSettings.personalInstrumentPresetOrder],
  );

  useEffect(() => {
    setSelectedInstrumentId(initialWorkspace.selectedInstrumentId);
  }, [initialWorkspace.selectedInstrumentId, setSelectedInstrumentId]);

  const totalTicks = getClipDurationTicks(activeClip);
  const updatePitchSnapSettings = useCallback(
    (changes: Partial<PitchSnapSettings>): void => {
      const nextSettings: PitchSnapSettings = {
        ...runtime.pitchSnapSettings.get(),
        ...changes,
      };

      runtime.pitchSnapSettings.set(nextSettings);
      setPitchSnapSettings(nextSettings);
    },
    [runtime],
  );
  const handleAutoFit = useCallback(() => {
    runtime.viewport.set(
      computeClipFitViewport(
        activeClip,
        runtime.viewportWidth.get(),
        runtime.viewportHeight.get(),
      )
    );
  }, [runtime, activeClip]);

  const handlePitchSelect = useCallback((pitch: number): void => {
    pianoRollControllerRef.current
      ?.togglePitchSelection(pitch);
  }, []);
  const clearTimelineSelection = useCallback((): void => {
    pianoRollControllerRef.current?.clearSelection();
  }, []);
  const clearPendingMidiImport = useCallback((): void => {
    pendingMidiImportRef.current = null;
  }, []);
  const {
    dialog: applicationDialog,
    showDialog: setApplicationDialog,
    alert: showApplicationAlert,
    confirm: showApplicationConfirmation,
    accept: handleApplicationDialogConfirm,
    acceptAlternate: handleApplicationDialogAlternate,
    cancel: handleApplicationDialogCancel,
  } = useApplicationDialogs(clearPendingMidiImport);
  const {
    status: playbackStatus,
    playingClipId,
    togglePlayback,
    toggleClipPlayback,
    stopPlayback,
    returnToStart,
    seek: seekPlayback,
    auditionPitch,
    previewInstrumentGain,
    previewInstrumentSettings,
    previewMasterGain,
  } = useAudioPlayback({
    projectStore: runtime.projectStore,
    playheadPosition: runtime.playheadPosition,
    onError(error) {
      showApplicationAlert(
        "Playback unavailable",
        formatAudioPlaybackError(error),
        "danger",
      );
    },
  });
  const autosave = useProjectAutosave(
    runtime,
    documentId,
    storedRevision,
    projectRepository,
    selectedInstrumentId,
  );
  const handlePitchAudition = useCallback((pitch: number): void => {
    if (selectedInstrumentId !== null) {
      auditionPitch(selectedInstrumentId, pitch);
    }
  }, [
    auditionPitch,
    selectedInstrumentId,
  ]);

  useEffect(
    () => runtime.pitchSnapSettings.subscribe(() => {
      setPitchSnapSettings(runtime.pitchSnapSettings.get());
    }),
    [runtime],
  );
  useEffect(
    () => runtime.gridResolutionTicks.subscribe(() => {
      setGridResolutionTicks(runtime.gridResolutionTicks.get());
    }),
    [runtime],
  );

  usePrimaryActionTrigger(
    togglePlayback,
    initialUserSettings.shortcuts["transport.toggle"],
  );
  const radialMenu = useFloatingRadialMenu();

  useStylusAction(radialMenu.toggleAt);

  const {
    appShellRef,
    stageRef,
    horizontalZoomInputRef: zoomInputRef,
    horizontalScrollInputRef: scrollInputRef,
    verticalScrollInputRef: pitchScrollInputRef,
    verticalZoomInputRef: pitchZoomInputRef,
    timelinePositionRef: barLabelRef,
    timelineTimeRef: timelineTimeRef,
    beginHorizontalViewportInteraction,
    endHorizontalViewportInteraction,
    publishViewport,
  } = useViewportControls(
    runtime,
    projectInspectorOpen,
    autoScrollEnabled
      && playbackStatus === "playing"
      && playingClipId === activeClip.id,
    seekPlayback,
    handleAutoFit,
  );
  const handleReturnToStart = useCallback((): void => {
    returnToStart();
    const viewport = runtime.viewport.get();

    if (
      shouldReturnViewportToStart(
        autoScrollEnabled,
        activeClip.id,
        playingClipId,
      )
      && viewport.scrollX !== 0
    ) {
      publishViewport({
        ...viewport,
        scrollX: 0,
      });
    }
  }, [
    activeClip.id,
    autoScrollEnabled,
    playingClipId,
    publishViewport,
    returnToStart,
    runtime,
  ]);
  const handleAutoScrollToggle = useCallback((): void => {
    setAutoScrollEnabled((enabled) => !enabled);
  }, []);
  const handleNoteCollision = useNoteCollisionDialogWorkflow({
    runtime,
    showDialog: setApplicationDialog,
    alert: showApplicationAlert,
  });
  const {
    select: handleInstrumentSelect,
    add: addProjectInstrument,
    reorder: handleReorderInstrument,
    remove: handleDeleteProjectInstrument,
    update: handleUpdateProjectInstrument,
    savePreset: saveProjectInstrumentPreset,
    removePreset: removeProjectInstrumentPreset,
    selectNotes: handleSelectInstrumentNotes,
    toggleLock: handleToggleInstrumentLock,
  } = useProjectInstrumentWorkflow({
    commands: runtime.editorCommands,
    selectedInstrumentId,
    selectInstrument: setSelectedInstrumentId,
    toggleInstrumentSelection(instrumentId) {
      runtime.selectionRequests.toggleInstrument(instrumentId);
    },
    removeInstrumentFromSelection(instrumentId) {
      pianoRollControllerRef.current
        ?.removeInstrumentFromSelection(instrumentId);
    },
    confirm: showApplicationConfirmation,
  });
  const savePersonalInstrumentPreset = useCallback(async (
    presetName: string,
    config: SubtractiveSynthConfig,
  ): Promise<InstrumentPreset> => {
    const normalizedName = validatePersonalPresetName(presetName);

    const preset = createPersonalInstrumentPreset(
      createPersonalInstrumentPresetId(),
      normalizedName,
      config,
    );
    const updatedSettings = await userSettingsRepository.update((current) => {
      assertPersonalPresetNameAvailable(current, normalizedName);

      if (
        current.personalInstrumentPresetOrder.length
        >= MAXIMUM_PROJECT_INSTRUMENT_COUNT
      ) {
        throw new Error("The personal preset library is full.");
      }

      return {
        ...current,
        personalInstrumentPresetsById: {
          ...current.personalInstrumentPresetsById,
          [preset.id]: preset,
        },
        personalInstrumentPresetOrder: [
          ...current.personalInstrumentPresetOrder,
          preset.id,
        ],
      };
    });

    onUserSettingsChange(updatedSettings);
    return preset;
  }, [onUserSettingsChange, userSettingsRepository]);
  const updatePersonalInstrumentPreset = useCallback(async (
    presetId: PresetId,
    config: SubtractiveSynthConfig,
  ): Promise<InstrumentPreset> => {
    const updatedSettings = await userSettingsRepository.update((current) => {
      const currentPreset = current.personalInstrumentPresetsById[presetId];

      if (currentPreset === undefined) {
        throw new Error("This personal preset no longer exists.");
      }

      return {
        ...current,
        personalInstrumentPresetsById: {
          ...current.personalInstrumentPresetsById,
          [presetId]: createPersonalInstrumentPreset(
            presetId,
            currentPreset.name,
            config,
          ),
        },
      };
    });
    const preset = updatedSettings.personalInstrumentPresetsById[presetId];

    if (preset === undefined) {
      throw new Error("The updated preset could not be loaded.");
    }

    onUserSettingsChange(updatedSettings);

    if (runtime.projectStore.getState().instrumentPresetsById[presetId]) {
      saveProjectInstrumentPreset(preset, "Update instrument preset");
    }

    return preset;
  }, [
    onUserSettingsChange,
    runtime,
    saveProjectInstrumentPreset,
    userSettingsRepository,
  ]);
  const renamePersonalInstrumentPreset = useCallback(async (
    presetId: PresetId,
    presetName: string,
  ): Promise<InstrumentPreset> => {
    const normalizedName = validatePersonalPresetName(presetName);
    const updatedSettings = await userSettingsRepository.update((current) => {
      const preset = current.personalInstrumentPresetsById[presetId];

      if (preset === undefined) {
        throw new Error("This personal preset no longer exists.");
      }

      assertPersonalPresetNameAvailable(current, normalizedName, presetId);
      return {
        ...current,
        personalInstrumentPresetsById: {
          ...current.personalInstrumentPresetsById,
          [presetId]: { ...preset, name: normalizedName },
        },
      };
    });
    const preset = updatedSettings.personalInstrumentPresetsById[presetId];

    if (preset === undefined) {
      throw new Error("The renamed preset could not be loaded.");
    }

    onUserSettingsChange(updatedSettings);

    if (runtime.projectStore.getState().instrumentPresetsById[presetId]) {
      saveProjectInstrumentPreset(preset, "Rename instrument preset");
    }

    return preset;
  }, [
    onUserSettingsChange,
    runtime,
    saveProjectInstrumentPreset,
    userSettingsRepository,
  ]);
  const deletePersonalInstrumentPreset = useCallback(async (
    presetId: PresetId,
  ): Promise<void> => {
    const updatedSettings = await userSettingsRepository.update((current) => {
      if (current.personalInstrumentPresetsById[presetId] === undefined) {
        throw new Error("This personal preset no longer exists.");
      }

      return {
        ...current,
        personalInstrumentPresetsById: Object.fromEntries(
          Object.entries(current.personalInstrumentPresetsById).filter(
            ([candidateId]) => candidateId !== presetId,
          ),
        ),
        personalInstrumentPresetOrder:
          current.personalInstrumentPresetOrder.filter(
            (candidateId) => candidateId !== presetId,
          ),
      };
    });

    onUserSettingsChange(updatedSettings);
    removeProjectInstrumentPreset(presetId, "Delete instrument preset");
  }, [
    onUserSettingsChange,
    removeProjectInstrumentPreset,
    userSettingsRepository,
  ]);
  const instrumentDialog = useInstrumentDialogWorkflow({
    runtime,
    addInstrument: addProjectInstrument,
    updateInstrument: handleUpdateProjectInstrument,
    removeInstrument: handleDeleteProjectInstrument,
    previewInstrumentSettings,
    presetsById: mergedPresetLibrary.presetsById,
    personalPresetIds,
    createPersonalPreset: savePersonalInstrumentPreset,
    updatePersonalPreset: updatePersonalInstrumentPreset,
    renamePersonalPreset: renamePersonalInstrumentPreset,
    deletePersonalPreset: deletePersonalInstrumentPreset,
    dismissApplicationDialog(): void {
      setApplicationDialog(null);
    },
  });
  const getPianoRollController = useCallback(
    (): PianoRollControllerPort | null =>
      pianoRollControllerRef.current,
    [],
  );
  const beginClipChange = useCallback((): void => {
    clearInteractionSelection();
  }, [clearInteractionSelection]);
  const {
    select: handleClipSelect,
    toggleBypass: handleToggleClipBypass,
    add: handleAddClip,
    duplicate: handleDuplicateClip,
    duplicateGroup: handleDuplicateClipGroup,
    createGroup: handleCreateClipGroup,
    updateGroup: handleUpdateClipGroup,
    toggleGroupBypass: handleToggleClipGroupBypass,
    concatenateGroup: handleConcatenateClipGroup,
    ungroup: handleUngroupClips,
    deleteGroup: handleDeleteClipGroup,
    moveNode: handleMoveClipNode,
    remove: handleDeleteClip,
    update: handleUpdateClip,
  } = useClipWorkflow({
    commands: runtime.editorCommands,
    beginClipChange,
    duplicateEditorState: runtime.duplicateClipEditorState,
    confirm: showApplicationConfirmation,
    alert: showApplicationAlert,
  });
  const clipDialog = useClipDialogWorkflow({
    runtime,
    updateClip: handleUpdateClip,
    removeClip: handleDeleteClip,
    dismissApplicationDialog(): void {
      setApplicationDialog(null);
    },
  });
  const handleClipSelectionRequest = useCallback((clipId: string): void => {
    handleClipSelect(resolvePlaybackFollowClipSelection(
      autoScrollEnabled,
      playbackStatus,
      clipId,
      playingClipId,
    ));
  }, [
    autoScrollEnabled,
    handleClipSelect,
    playbackStatus,
    playingClipId,
  ]);
  const handleSelectClipNotes = useCallback((clipId: string): void => {
    handleClipSelectionRequest(clipId);
    runtime.selectionRequests.selectAllNotes();
  }, [handleClipSelectionRequest, runtime]);
  useEffect(() => {
    const targetClipId = getPlaybackFollowTargetClipId(
      autoScrollEnabled,
      playbackStatus,
      activeClip.id,
      playingClipId,
    );

    if (targetClipId !== null) {
      handleClipSelect(targetClipId);
    }
  }, [
    activeClip.id,
    autoScrollEnabled,
    handleClipSelect,
    playbackStatus,
    playingClipId,
  ]);
  const {
    insertMeasuresAtPlayhead: handleInsertMeasuresAtPlayhead,
    removeMeasureAtPlayhead: handleRemoveMeasureAtPlayhead,
    commitMasterGain: handleMasterGainCommit,
    toggleMasterMute: handleMasterMuteToggle,
    commitMasterTuning: handleMasterTuningCommit,
    commitProjectTitle: handleProjectTitleCommit,
    toggleLoop: handleToggleLoop,
    toggleAutoAdvance: handleToggleAutoAdvance,
    commitLoopRegion: handleLoopRegionCommit,
  } = useTransportWorkflow({
    runtime,
    getController: getPianoRollController,
    seekPlayback,
  });
  const handleMarkerCollision = useMarkerCollisionDialogWorkflow({
    showDialog: setApplicationDialog,
  });
  const timeMapMarkers = useTimeMapMarkerWorkflow({
    runtime,
    alert: showApplicationAlert,
    getController: getPianoRollController,
    resolveCollision: handleNoteCollision,
    resolveMarkerCollision: handleMarkerCollision,
  });
  const {
    clipboardAvailable,
    clearClipboard: clearSelectionClipboard,
    undo: handleUndo,
    redo: handleRedo,
    copy: handleCopy,
    cut: handleCut,
    remove: handleDeleteSelection,
    toggleDisabled: handleToggleSelectionDisabled,
    transform: handleTransformSelection,
    sliceAtPlayhead: handleSliceSelectionAtPlayhead,
    sliceAtLoopAnchors: handleSliceSelectionAtLoopAnchors,
    paste: handlePaste,
    transferToInstrument: handleTransferSelectionToInstrument,
  } = usePianoRollSelectionWorkflow({
    commands: runtime.editorCommands,
    selection: runtime.selection,
    getController: getPianoRollController,
    getPlayheadTick() {
      return runtime.playheadTick.get();
    },
    getGridResolutionTicks() {
      return runtime.gridResolutionTicks.get();
    },
    resolveCollision: handleNoteCollision,
    resolveMarkerCollision: handleMarkerCollision,
    alert: showApplicationAlert,
  });
  const handleOpenSliceSelection = useCallback((): void => {
    setApplicationDialog({
      title: "Slice selected notes",
      message: "Choose where to split the selected notes.",
      confirmLabel: "At playhead",
      alternateLabel: "At loop anchors",
      cancelLabel: "Cancel",
      tone: "default",
      onConfirm: handleSliceSelectionAtPlayhead,
      onAlternate: handleSliceSelectionAtLoopAnchors,
    });
  }, [
    handleSliceSelectionAtLoopAnchors,
    handleSliceSelectionAtPlayhead,
    setApplicationDialog,
  ]);
  const editableNoteSelectionAvailable = selectedNotes.some(isNoteEditable);
  const editableTimelineSelectionAvailable =
    editableNoteSelectionAvailable || selectedMarkerCount > 0;
  const selectedNotesContainNonDisabledNote = selectedNotes.some(
    (note) => note.status !== "disabled",
  );
  const radialMenuItems = useMemo<readonly FloatingRadialMenuItem[]>(() => [
    {
      id: "copy",
      label: "Copy",
      icon: <CommandIcon kind="copy" />,
      disabled: !editableTimelineSelectionAvailable,
      onSelect: handleCopy,
    },
    {
      id: "cut",
      label: "Cut",
      icon: <CommandIcon kind="cut" />,
      disabled: !editableTimelineSelectionAvailable,
      tone: "danger",
      onSelect: handleCut,
    },
    {
      id: "paste",
      label: "Paste",
      icon: <CommandIcon kind="paste" />,
      disabled: !clipboardAvailable,
      onSelect: handlePaste,
    },
    {
      id: "slice",
      label: "Slice",
      icon: <CommandIcon kind="slice" />,
      disabled: !editableNoteSelectionAvailable,
      onSelect: handleOpenSliceSelection,
    },
    {
      id: "toggle-disabled",
      label: selectedNotesContainNonDisabledNote ? "Disable" : "Enable",
      icon: (
        <CommandIcon
          kind={selectedNotesContainNonDisabledNote ? "disable" : "enable"}
        />
      ),
      disabled: selectedNotes.length === 0,
      tone: selectedNotesContainNonDisabledNote ? "danger" : "default",
      onSelect: handleToggleSelectionDisabled,
    },
    {
      id: "add-marker",
      label: "Mark",
      icon: <CommandIcon kind="marker" />,
      tone: "default",
      onSelect: timeMapMarkers.openMarkerAtPlayhead,
    },
  ], [
    clipboardAvailable,
    handleCopy,
    handleCut,
    handleOpenSliceSelection,
    handlePaste,
    handleToggleSelectionDisabled,
    selectedNotes.length,
    selectedNotesContainNonDisabledNote,
    editableNoteSelectionAvailable,
    editableTimelineSelectionAvailable,
    timeMapMarkers.openMarkerAtPlayhead,
  ]);
  const handleNoteColorModeToggle = useCallback((): void => {
    setNoteColorMode((currentMode) => {
      const nextMode: NoteColorMode =
        currentMode === "instrument" ? "pitch" : "instrument";

      runtime.noteColorMode.set(nextMode);
      void userSettingsRepository.update((current) => ({
        ...current,
        noteColorMode: nextMode,
      })).then(onUserSettingsChange).catch((error: unknown) => {
        showApplicationAlert(
          "Settings not saved",
          error instanceof Error ? error.message : "Unable to save settings.",
          "danger",
        );
      });
      return nextMode;
    });
  }, [
    onUserSettingsChange,
    runtime,
    showApplicationAlert,
    userSettingsRepository,
  ]);
  const handleSelectionModeChange = useCallback((
    nextMode: SelectionMode,
  ): void => {
    setSelectionMode(nextMode);
    void userSettingsRepository.update((current) => ({
      ...current,
      selectionMode: nextMode,
    })).then(onUserSettingsChange).catch((error: unknown) => {
      showApplicationAlert(
        "Settings not saved",
        error instanceof Error ? error.message : "Unable to save settings.",
        "danger",
      );
    });
  }, [
    onUserSettingsChange,
    showApplicationAlert,
    userSettingsRepository,
  ]);
  const handlePitchPreviewToggle = useCallback((): void => {
    setPitchPreviewEnabled((enabled) => {
      const nextEnabled = !enabled;
      void userSettingsRepository.update((current) => ({
        ...current,
        pitchPreviewEnabled: nextEnabled,
      })).then(onUserSettingsChange).catch((error: unknown) => {
        showApplicationAlert(
          "Settings not saved",
          error instanceof Error ? error.message : "Unable to save settings.",
          "danger",
        );
      });
      return nextEnabled;
    });
  }, [
    onUserSettingsChange,
    showApplicationAlert,
    userSettingsRepository,
  ]);
  const {
    exportProject: handleExportProject,
    replaceActiveProject,
  } = useProjectFileWorkflow({
    runtime,
    documentId,
    captureWorkspace: () => captureProjectWorkspace(
      runtime,
      selectedInstrumentId,
    ),
    stopPlayback,
    resetInteraction() {
      const controller = pianoRollControllerRef.current;

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
    onWorkspaceRestored(workspace) {
      setSelectedInstrumentId(workspace.selectedInstrumentId);
      const activeState = workspace.clipStatesById[workspace.activeClipId];

      if (activeState !== undefined) {
        setPitchSnapSettings(activeState.pitchSnapSettings);
      }
    },
    alert: showApplicationAlert,
  });
  useKeyboardShortcut(
    [initialUserSettings.shortcuts["editor.undo"]],
    handleUndo,
  );
  useKeyboardShortcut(
    [initialUserSettings.shortcuts["editor.redo"]],
    handleRedo,
  );
  const handleCloseProject = useCallback(async (): Promise<void> => {
    try {
      await autosave.flush();
      await onCloseProject();
    } catch (error: unknown) {
      showApplicationAlert(
        "Project not closed",
        error instanceof Error
          ? `The latest changes could not be saved. ${error.message}`
          : "The latest changes could not be saved.",
        "danger",
      );
    }
  }, [autosave, onCloseProject, showApplicationAlert]);
  const {
    inputRef: importMidiInputRef,
    openImport: handleOpenMidiImport,
    importFile: handleMidiFileChange,
    exportFile: handleExportMidi,
  } = useMidiFileWorkflow({
    runtime,
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
      <EditorHeader
        projectState={projectState}
        loopDragPreview={loopDragPreview}
        selectedNotes={selectedNotes}
        selectedMarkerCount={selectedMarkerCount}
        gridResolutionTicks={gridResolutionTicks}
        playbackStatus={playbackStatus}
        autoScrollEnabled={autoScrollEnabled}
        midiInputRef={importMidiInputRef}
        saveStatus={autosave.status}
        onCloseProject={handleCloseProject}
        onExportProject={handleExportProject}
        onOpenMidiImport={handleOpenMidiImport}
        onExportMidi={handleExportMidi}
        onMidiFileChange={handleMidiFileChange}
        onProjectTitleCommit={handleProjectTitleCommit}
        onReturnToStart={handleReturnToStart}
        onTogglePlayback={togglePlayback}
        onToggleLoop={handleToggleLoop}
        onToggleAutoAdvance={handleToggleAutoAdvance}
        onToggleAutoScroll={handleAutoScrollToggle}
        onPreviewMasterGain={previewMasterGain}
        onMasterGainCommit={handleMasterGainCommit}
        onMasterMuteToggle={handleMasterMuteToggle}
        onMasterTuningCommit={handleMasterTuningCommit}
      />

      <section
        className={
          `workspace${
            projectInspectorOpen
              ? " is-project-inspector-open"
              : ""
          }${
            projectInspectorOpen
            && projectInspectorSection === "clips"
              ? " is-clips-inspector-open"
              : ""
          }`
        }
      >
        <div className="editor-panel">
          {projectInspectorToolbarHost === null
            ? null
            : createPortal(
          <EditorToolbar
            inspectorOpen={projectInspectorOpen}
            inspectorSection={projectInspectorSection}
            canUndo={runtime.editorCommands.canUndo()}
            canRedo={runtime.editorCommands.canRedo()}
            measureCount={getMeasureCount(
              projectState.clock.ppqn,
              activeClip.timeline.timeMap,
              activeClip.timeline.durationTicks,
            )}
            selectionAvailable={editableTimelineSelectionAvailable}
            noteSelectionAvailable={selectedNotes.length > 0}
            editableNoteSelectionAvailable={editableNoteSelectionAvailable}
            selectedNotesContainNonDisabledNote={selectedNotesContainNonDisabledNote}
            clipboardSelectionAvailable={editableTimelineSelectionAvailable}
            clipboardAvailable={clipboardAvailable}
            selectionMode={selectionMode}
            noteColorMode={noteColorMode}
            onToggleInspector={(section) => {
              if (
                projectInspectorOpen
                && projectInspectorSection === section
              ) {
                setGeneralInspectorOpen(false);
                return;
              }

              setGeneralInspectorSection(section);
              setGeneralInspectorOpen(true);
            }}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onManageMeasures={() => setManageMeasuresDialogOpen(true)}
            onRemoveMeasure={handleRemoveMeasureAtPlayhead}
            onDeleteSelection={handleDeleteSelection}
            onToggleSelectionDisabled={handleToggleSelectionDisabled}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onSelectionModeChange={handleSelectionModeChange}
            onNoteColorModeToggle={handleNoteColorModeToggle}
            onOpenSliceSelection={handleOpenSliceSelection}
            onAddMarkerAtPlayhead={timeMapMarkers.openMarkerAtPlayhead}
            onTransformSelection={handleTransformSelection}
          />,
          projectInspectorToolbarHost,
        )}

          <div className="roll-frame">
            <PianoKeyboard
              viewport={runtime.viewport}
              playheadTick={runtime.playheadTick}
              timeMap={activeClip.timeline.timeMap}
              previewEnabled={pitchPreviewEnabled}
              pitchSnapSettings={pitchSnapSettings}
              onPreviewToggle={handlePitchPreviewToggle}
              onPitchAudition={handlePitchAudition}
              onPitchLongPress={handlePitchSelect}
              onPitchInteractionChange={(pitch) => {
                runtime.highlightedPitch.set(pitch);
              }}
            />
            <div ref={stageRef} className="roll-stage">
              <PianoRollRuler
                viewport={runtime.viewport}
                projectStore={runtime.projectStore}
                gridResolutionTicks={runtime.gridResolutionTicks}
                markerFlags={createTimeMapMarkerFlags(
                  activeClip.timeline.timeMap,
                )}
                selection={runtime.selection}
                timelineDragPreview={timelineDragPreview}
                loopDragPreview={loopDragPreview}
                interactionStrategyRef={interactionStrategyRef}
                selectionMode={selectionMode}
                onLoopCommit={handleLoopRegionCommit}
                onOpenMarker={timeMapMarkers.openMarker}
                onSelectMarker={timeMapMarkers.selectMarker}
                onMoveMarker={timeMapMarkers.moveMarker}
                onClearSelection={clearTimelineSelection}
              />
              <div className="canvas-host">
                <PianoRollLayers
                  runtime={runtime}
                  selectionMode={selectionMode}
                  activeInstrumentId={selectedInstrumentId ?? ""}
                  totalTicks={totalTicks}
                  setViewport={publishViewport}
                  onHorizontalViewportInteractionStart={
                    beginHorizontalViewportInteraction
                  }
                  onHorizontalViewportInteractionEnd={
                    endHorizontalViewportInteraction
                  }
                  onTwoFingerDoubleTap={handleUndo}
                  controllerRef={
                    pianoRollControllerRef
                  }
                  interactionStrategyRef={interactionStrategyRef}
                  onSelectionChange={handleSelectionChange}
                  onGridSeek={seekPlayback}
                  onOpenContextMenu={radialMenu.openAt}
                  onNoteCollision={handleNoteCollision}
                  onMarkerCollision={handleMarkerCollision}
                  globalLassoRef={globalLassoRef}
                  timelineDragPreview={timelineDragPreview}
                />
              </div>
              <PianoRollGlobalLasso elementRef={globalLassoRef} />
              <PianoRollPlayhead
                viewport={runtime.viewport}
                clipId={activeClip.id}
                playheadPosition={runtime.playheadPosition}
              />
            </div>
          </div>

          <PianoRollViewportControls
            timelinePositionRef={barLabelRef}
            timelineTimeRef={timelineTimeRef}
            horizontalScrollRef={scrollInputRef}
            horizontalZoomRef={zoomInputRef}
            verticalScrollRef={pitchScrollInputRef}
            verticalZoomRef={pitchZoomInputRef}
            gridSettings={runtime.gridSettings}
            pitchSnapSettings={pitchSnapSettings}
            onPitchSnapSettingsChange={updatePitchSnapSettings}
            onAutoFit={handleAutoFit}
          />
        </div>
        <ProjectInspectorResizeHandle inspectorOpen={projectInspectorOpen} />
        <ProjectInspector
          open={projectInspectorOpen}
          portraitSection={projectInspectorSection}
          projectState={projectState}
          playingClipId={
            playbackStatus === "playing" ? playingClipId : null
          }
          playheadPosition={runtime.playheadPosition}
          suppressClipSelectionHighlight={
            autoScrollEnabled && playbackStatus === "playing"
          }
          selectedInstrumentId={selectedInstrumentId}
          selectionAvailable={editableNoteSelectionAvailable}
          setToolbarHost={setGeneralInspectorToolbarHost}
          onClipSelect={handleClipSelectionRequest}
          onToggleClipBypass={handleToggleClipBypass}
          onToggleClipPlayback={toggleClipPlayback}
          onAddClip={handleAddClip}
          onDuplicateClip={handleDuplicateClip}
          onDuplicateClipGroup={handleDuplicateClipGroup}
          onToggleClipGroupBypass={handleToggleClipGroupBypass}
          onCreateClipGroup={handleCreateClipGroup}
          onUpdateClipGroup={handleUpdateClipGroup}
          onConcatenateClipGroup={handleConcatenateClipGroup}
          onUngroupClips={handleUngroupClips}
          onDeleteClipGroup={handleDeleteClipGroup}
          onMoveClipNode={handleMoveClipNode}
          onSelectClipNotes={handleSelectClipNotes}
          onEditClip={clipDialog.openEdit}
          onReorderInstrument={handleReorderInstrument}
          onAddProjectInstrument={instrumentDialog.openCreate}
          onInstrumentSelect={handleInstrumentSelect}
          onEditProjectInstrument={instrumentDialog.openEdit}
          onUpdateProjectInstrument={handleUpdateProjectInstrument}
          onInstrumentGainPreview={previewInstrumentGain}
          onSelectInstrumentNotes={handleSelectInstrumentNotes}
          onTransferSelectionToInstrument={handleTransferSelectionToInstrument}
          onToggleInstrumentLock={handleToggleInstrumentLock}
          onDeleteProjectInstrument={handleDeleteProjectInstrument}
        />
      </section>
      {radialMenu.state === null ? null : (
        <FloatingRadialMenu
          position={radialMenu.state.position}
          revision={radialMenu.state.revision}
          closing={radialMenu.state.closing}
          items={radialMenuItems}
          centerButton={{
            label: playbackStatus === "playing" ? "Pause" : "Play",
            icon: (
              <CommandIcon
                kind={playbackStatus === "playing" ? "pause" : "play"}
              />
            ),
            onSelect: togglePlayback,
          }}
          onClose={radialMenu.close}
        />
      )}
      <ApplicationDialogOverlay
        dialog={applicationDialog}
        onConfirm={handleApplicationDialogConfirm}
        onAlternate={handleApplicationDialogAlternate}
        onCancel={handleApplicationDialogCancel}
      />
      {!clipDialog.open ? null : (
        <ClipEditorDialog
          clipName={clipDialog.name}
          clipColor={clipDialog.color}
          canDelete={clipDialog.canDelete}
          onClipNameChange={clipDialog.setName}
          onClipColorChange={clipDialog.setColor}
          onConfirm={clipDialog.confirm}
          onDelete={clipDialog.remove}
          onCancel={clipDialog.cancel}
        />
      )}
      {!instrumentDialog.open || instrumentDialog.config === null ? null : (
        <InstrumentPresetDialog
          mode={instrumentDialog.mode}
          presetsById={mergedPresetLibrary.presetsById}
          presetOrder={mergedPresetLibrary.presetOrder}
          personalPresetIds={personalPresetIds}
          selectedPresetId={instrumentDialog.selectedPresetId}
          instrumentName={instrumentDialog.name}
          instrumentColor={instrumentDialog.color}
          instrument={instrumentDialog.config}
          onPresetSelectionChange={instrumentDialog.selectPreset}
          onInstrumentNameChange={instrumentDialog.setName}
          onInstrumentColorChange={instrumentDialog.setColor}
          onInstrumentChange={instrumentDialog.setConfig}
          selectedPresetIsPersonal={instrumentDialog.selectedPresetIsPersonal}
          onCreatePreset={instrumentDialog.createPreset}
          onSavePreset={instrumentDialog.savePreset}
          onRenamePreset={instrumentDialog.renamePreset}
          onDeletePreset={instrumentDialog.deletePreset}
          onConfirm={instrumentDialog.confirm}
          onDelete={instrumentDialog.mode === "edit" ? instrumentDialog.remove : undefined}
          onCancel={instrumentDialog.cancel}
        />
      )}
      {timeMapMarkers.draft === null ? null : (
        <TempoMeterMarkerDialog
          mode={timeMapMarkers.draft.mode}
          tempoIncluded={timeMapMarkers.draft.tempoIncluded}
          meterIncluded={timeMapMarkers.draft.meterIncluded}
          scaleIncluded={timeMapMarkers.draft.scaleIncluded}
          canChangeMarkerTypes={timeMapMarkers.draft.canChangeMarkerTypes}
          bpm={timeMapMarkers.draft.bpm}
          timeSignature={timeMapMarkers.draft.timeSignature}
          rootNote={timeMapMarkers.draft.rootNote}
          patternType={timeMapMarkers.draft.patternType}
          patternId={timeMapMarkers.draft.patternId}
          onTempoIncludedChange={timeMapMarkers.setDraftTempoIncluded}
          onMeterIncludedChange={timeMapMarkers.setDraftMeterIncluded}
          onScaleIncludedChange={timeMapMarkers.setDraftScaleIncluded}
          onBpmChange={timeMapMarkers.setDraftBpm}
          onTimeSignatureChange={timeMapMarkers.setDraftTimeSignature}
          onRootNoteChange={timeMapMarkers.setDraftRootNote}
          onPatternTypeChange={timeMapMarkers.setDraftPatternType}
          onPatternIdChange={timeMapMarkers.setDraftPatternId}
          onConfirm={timeMapMarkers.confirmDraft}
          onCancel={timeMapMarkers.cancelDraft}
        />
      )}
      {manageMeasuresDialogOpen ? (
        <ManageMeasuresDialog
          onConfirm={(count, position) => {
            handleInsertMeasuresAtPlayhead(count, position);
            setManageMeasuresDialogOpen(false);
          }}
          onCancel={() => setManageMeasuresDialogOpen(false)}
        />
      ) : null}
    </main>
  );
}

function validatePersonalPresetName(name: string): string {
  const normalizedName = name.trim();

  if (
    normalizedName.length === 0
    || normalizedName.length > MAXIMUM_INSTRUMENT_NAME_LENGTH
  ) {
    throw new Error(
      `Preset names must contain between 1 and ${MAXIMUM_INSTRUMENT_NAME_LENGTH} characters.`,
    );
  }

  return normalizedName;
}

function assertPersonalPresetNameAvailable(
  settings: UserSettings,
  name: string,
  ignoredPresetId?: PresetId,
): void {
  const normalizedName = name.toLocaleLowerCase();
  const duplicate = settings.personalInstrumentPresetOrder.some((presetId) => (
    presetId !== ignoredPresetId
    && settings.personalInstrumentPresetsById[presetId]?.name
      .toLocaleLowerCase() === normalizedName
  ));

  if (duplicate) {
    throw new Error(`A personal preset named "${name}" already exists.`);
  }
}

function formatAudioPlaybackError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "The browser could not initialize the audio engine.";
}
