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
  InstrumentPresetDialog,
} from "../../ui/dialogs/InstrumentPresetDialog";
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
  useMidiFileWorkflow,
} from "../../ui/project-files/useMidiFileWorkflow";
import {
  useTransportWorkflow,
} from "../../ui/transport/useTransportWorkflow";
import {
  usePrimaryActionTrigger,
} from "./interactions/usePrimaryActionTrigger";
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
    selectionAvailable,
    selectedNotes,
    selectedMarkerCount,
    selectInstrument: setSelectedInstrumentId,
    setSelectionAvailable,
    handleSelectionChange,
    clearInteractionSelection,
  } = usePianoRollProjectState(runtime, pianoRollControllerRef);
  const [projectInspectorOpen, setGeneralInspectorOpen] =
    useState(false);
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
    togglePlayback,
    stopPlayback,
    returnToStart,
    seek: seekPlayback,
    auditionPitch,
    previewInstrumentGain,
    previewInstrumentSettings,
    previewMasterGain,
  } = useAudioPlayback({
    projectStore: runtime.projectStore,
    playheadTick: runtime.playheadTick,
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
    playbackStatus,
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
    playbackStatus === "playing",
    seekPlayback,
  );
  const handleReturnToStart = useCallback((): void => {
    returnToStart();
    const viewport = runtime.viewport.get();

    if (viewport.scrollX !== 0) {
      publishViewport({
        ...viewport,
        scrollX: 0,
      });
    }
  }, [publishViewport, returnToStart, runtime]);
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
  const instrumentDialog = useInstrumentDialogWorkflow({
    runtime,
    addInstrument: addProjectInstrument,
    updateInstrument: handleUpdateProjectInstrument,
    removeInstrument: handleDeleteProjectInstrument,
    previewInstrumentSettings,
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
    stopPlayback();
    clearInteractionSelection();
  }, [clearInteractionSelection, stopPlayback]);
  const {
    select: handleClipSelect,
    add: handleAddClip,
    duplicate: handleDuplicateClip,
    reorder: handleReorderClip,
    remove: handleDeleteClip,
    rename: handleRenameClip,
  } = useClipWorkflow({
    commands: runtime.editorCommands,
    beginClipChange,
    duplicateEditorState: runtime.duplicateClipEditorState,
    confirm: showApplicationConfirmation,
  });
  const {
    insertMeasuresAtPlayhead: handleInsertMeasuresAtPlayhead,
    removeMeasureAtPlayhead: handleRemoveMeasureAtPlayhead,
    commitMasterGain: handleMasterGainCommit,
    toggleMasterMute: handleMasterMuteToggle,
    commitMasterTuning: handleMasterTuningCommit,
    commitProjectTitle: handleProjectTitleCommit,
    toggleLoop: handleToggleLoop,
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
    toggleEnabled: handleToggleSelectionEnabled,
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
            selectionAvailable={selectedNotes.length > 0}
            clipboardSelectionAvailable={selectionAvailable}
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
            onToggleSelectionEnabled={handleToggleSelectionEnabled}
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
                  onNoteCollision={handleNoteCollision}
                  onMarkerCollision={handleMarkerCollision}
                  globalLassoRef={globalLassoRef}
                  timelineDragPreview={timelineDragPreview}
                />
              </div>
              <PianoRollGlobalLasso elementRef={globalLassoRef} />
              <PianoRollPlayhead
                viewport={runtime.viewport}
                playheadTick={runtime.playheadTick}
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
          />
        </div>
        <ProjectInspector
          open={projectInspectorOpen}
          portraitSection={projectInspectorSection}
          projectState={projectState}
          selectedInstrumentId={selectedInstrumentId}
          selectionAvailable={selectedNotes.length > 0}
          setToolbarHost={setGeneralInspectorToolbarHost}
          onClipSelect={handleClipSelect}
          onAddClip={handleAddClip}
          onDuplicateClip={handleDuplicateClip}
          onReorderClip={handleReorderClip}
          onDeleteClip={handleDeleteClip}
          onRenameClip={handleRenameClip}
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
      <ApplicationDialogOverlay
        dialog={applicationDialog}
        onConfirm={handleApplicationDialogConfirm}
        onAlternate={handleApplicationDialogAlternate}
        onCancel={handleApplicationDialogCancel}
      />
      {!instrumentDialog.open || instrumentDialog.config === null ? null : (
        <InstrumentPresetDialog
          mode={instrumentDialog.mode}
          presetsById={projectState.instrumentPresetsById}
          presetOrder={projectState.instrumentPresetOrder}
          selectedPresetId={instrumentDialog.selectedPresetId}
          instrumentName={instrumentDialog.name}
          instrumentColor={instrumentDialog.color}
          instrument={instrumentDialog.config}
          onPresetSelectionChange={instrumentDialog.selectPreset}
          onInstrumentNameChange={instrumentDialog.setName}
          onInstrumentColorChange={instrumentDialog.setColor}
          onInstrumentChange={instrumentDialog.setConfig}
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

function formatAudioPlaybackError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "The browser could not initialize the audio engine.";
}
