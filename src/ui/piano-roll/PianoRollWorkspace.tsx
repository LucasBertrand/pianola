import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  APPLICATION_CONSTANTS,
} from "../../application/product/product-constants";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import {
  getClipDurationTicks,
} from "../../domain/clips/clip";
import {
  getMeasureSpans,
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
  useApplicationDialogs,
} from "../../ui/dialogs/useApplicationDialogs";
import {
  PianoRollWorkspaceDialogs,
} from "../../ui/dialogs/PianoRollWorkspaceDialogs";
import {
  usePianoRollDialogState,
} from "../../ui/dialogs/usePianoRollDialogState";
import {
  PianoRollLayers,
} from "../../ui/piano-roll/PianoRollLayers";
import {
  PianoRollWorkspaceLayout,
} from "../../ui/piano-roll/PianoRollWorkspaceLayout";
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
  ProjectInspectorResizeHandle,
} from "../../ui/inspector/ProjectInspectorResizeHandle";
import {
  EditorHeader,
} from "../../ui/editor-toolbar/EditorHeader";
import type {
  PianoRollControllerPort,
} from "../../editor/interactions/piano-roll-controller-port";
import type {
  PointerInteractionStrategy,
} from "../../editor/interactions/pointer/pointer-interaction-strategy";
import {
  type PitchSnapSettings,
} from "../../domain/music-theory/pitch-snap";
import type {
  EditorRuntime,
} from "../../application/editor-session/editor-runtime";
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
  usePianoRollProjectLifecycle,
} from "../../ui/project-files/usePianoRollProjectLifecycle";
import {
  RenderBaselineProfiler,
} from "../diagnostics/RenderBaselineProfiler";
import {
  usePianoRollTransportViewport,
  usePlaybackFollowSelection,
} from "../../ui/transport/usePianoRollTransportViewport";
import {
  usePrimaryActionTrigger,
} from "./interactions/usePrimaryActionTrigger";
import {
  useStylusAction,
} from "./interactions/useStylusAction";
import {
  FloatingRadialMenu,
} from "./context-menu/FloatingRadialMenu";
import {
  useFloatingRadialMenu,
} from "./context-menu/useFloatingRadialMenu";
import {
  usePianoRollRadialMenuCommands,
} from "./context-menu/usePianoRollRadialMenuCommands";
import {
  useKeyboardShortcut,
} from "./interactions/useKeyboardShortcut";
import {
  useRenderSignalValue,
} from "../../ui/piano-roll/useRenderSignalValue";
import {
  useInstrumentDialogWorkflow,
} from "../../ui/inspector/instruments/useInstrumentDialogWorkflow";
import {
  usePianoRollUserPreferences,
} from "../../ui/inspector/instruments/usePianoRollUserPreferences";
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
  PersistedEditorWorkspace,
} from "../../application/ports/project-repository";
import type {
  UserSettings,
  UserSettingsRepository,
} from "../../application/ports/user-settings-repository";

export interface PianoRollWorkspaceProps {
  readonly runtime: EditorRuntime;
  readonly documentId: string;
  readonly storedRevision: number;
  readonly initialWorkspace: PersistedEditorWorkspace;
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
  const dialogState = usePianoRollDialogState();
  const [projectInspectorSection, setGeneralInspectorSection] =
    useState<"instruments" | "clips">("instruments");
  const pitchSnapSettings = useRenderSignalValue(runtime.pitchSnapSettings);
  const gridResolutionTicks = useRenderSignalValue(
    runtime.gridResolutionTicks,
  );
  const activeClip = getActiveClip(projectState);
  const autoScrollEnabled = projectState.autoScrollEnabled;
  const measureSpans = getMeasureSpans(
    projectState.clock.ppqn,
    activeClip.timeline.timeMap,
    activeClip.timeline.durationTicks,
  );
  const measureCount = measureSpans.length;
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
  const getPianoRollController = useCallback(
    (): PianoRollControllerPort | null => pianoRollControllerRef.current,
    [],
  );
  const applicationDialogs = useApplicationDialogs();
  const {
    showDialog: setApplicationDialog,
    alert: showApplicationAlert,
    confirm: showApplicationConfirmation,
    cancel: cancelApplicationDialog,
  } = applicationDialogs;
  const transportViewport = usePianoRollTransportViewport({
    runtime,
    activeClip,
    inspectorOpen: projectInspectorOpen,
    autoScrollEnabled,
    selectedInstrumentId,
    getController: getPianoRollController,
    alert: showApplicationAlert,
  });
  const {
    status: playbackStatus,
    playingClipId,
    togglePlayback,
    toggleClipPlayback,
    stopPlayback,
    seek: seekPlayback,
    previewInstrumentGain,
    previewInstrumentSettings,
    previewMasterGain,
  } = transportViewport.playback;
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
  } = transportViewport.viewport;
  const handleAutoFit = transportViewport.autoFit;
  const handleReturnToStart = transportViewport.returnToStart;
  const handlePitchAudition = transportViewport.auditionPitch;

  usePrimaryActionTrigger(
    togglePlayback,
    initialUserSettings.shortcuts["transport.toggle"],
  );
  const radialMenu = useFloatingRadialMenu();

  useStylusAction(radialMenu.toggleAt);

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
  const preferences = usePianoRollUserPreferences({
    runtime,
    settings: initialUserSettings,
    projectPresetsById: projectState.instrumentPresetsById,
    projectPresetOrder: projectState.instrumentPresetOrder,
    repository: userSettingsRepository,
    onSettingsChange: onUserSettingsChange,
    onPersistenceError(error) {
      showApplicationAlert(
        "Settings not saved",
        error instanceof Error ? error.message : "Unable to save settings.",
        "danger",
      );
    },
    saveProjectPreset: saveProjectInstrumentPreset,
    removeProjectPreset: removeProjectInstrumentPreset,
  });
  const instrumentDialog = useInstrumentDialogWorkflow({
    runtime,
    addInstrument: addProjectInstrument,
    updateInstrument: handleUpdateProjectInstrument,
    removeInstrument: handleDeleteProjectInstrument,
    previewInstrumentSettings,
    presetsById: preferences.presetsById,
    personalPresetIds: preferences.personalPresetIds,
    createPersonalPreset: preferences.createPersonalPreset,
    updatePersonalPreset: preferences.updatePersonalPreset,
    renamePersonalPreset: preferences.renamePersonalPreset,
    deletePersonalPreset: preferences.deletePersonalPreset,
    dismissApplicationDialog(): void {
      setApplicationDialog(null);
    },
  });
  const beginClipChange = useCallback((): void => {
    clearInteractionSelection();
  }, [clearInteractionSelection]);
  const {
    select: handleClipSelect,
    toggleBypass: handleToggleClipBypass,
    add: handleAddClip,
    duplicate: handleDuplicateClip,
    duplicateGroup: handleDuplicateClipGroup,
    split: handleSplitClip,
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
  const handleClipSelectionRequest = usePlaybackFollowSelection({
    autoScrollEnabled,
    playbackStatus,
    activeClipId: activeClip.id,
    playingClipId,
    selectClip: handleClipSelect,
  });
  const handleSelectClipNotes = useCallback((clipId: string): void => {
    handleClipSelectionRequest(clipId);
    runtime.selectionRequests.selectAllNotes();
  }, [handleClipSelectionRequest, runtime]);
  const {
    insertMeasuresAtPlayhead: handleInsertMeasuresAtPlayhead,
    removeMeasuresAtPlayhead: handleRemoveMeasuresAtPlayhead,
    commitMasterGain: handleMasterGainCommit,
    toggleMasterMute: handleMasterMuteToggle,
    commitMasterTuning: handleMasterTuningCommit,
    commitProjectTitle: handleProjectTitleCommit,
    toggleLoop: handleToggleLoop,
    toggleAutoAdvance: handleToggleAutoAdvance,
    toggleAutoScroll: handleAutoScrollToggle,
    commitLoopRegion: handleLoopRegionCommit,
  } = transportViewport.transport;
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
    toggleMute: handleToggleSelectionMute,
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
  const selectionWillBeMuted = selectedNotes.some(
    (note) => !note.muted,
  );
  const radialMenuCommands = usePianoRollRadialMenuCommands({
    editableNoteSelectionAvailable,
    editableTimelineSelectionAvailable,
    selectedNoteCount: selectedNotes.length,
    selectionWillBeMuted,
    clipboardAvailable,
  }, {
    copy: handleCopy,
    cut: handleCut,
    paste: handlePaste,
    slice: handleOpenSliceSelection,
    toggleMute: handleToggleSelectionMute,
    addMarker: timeMapMarkers.openMarkerAtPlayhead,
    togglePlayback,
  }, playbackStatus === "playing");
  const projectLifecycle = usePianoRollProjectLifecycle({
    runtime,
    documentId,
    storedRevision,
    projectRepository,
    selectedInstrumentId,
    controllerRef: pianoRollControllerRef,
    stopPlayback,
    clearClipboard: clearSelectionClipboard,
    onSelectionCleared() {
      setSelectionAvailable(false);
    },
    onWorkspaceRestored(workspace) {
      setSelectedInstrumentId(workspace.selectedInstrumentId);
    },
    showDialog: setApplicationDialog,
    alert: showApplicationAlert,
    onCloseProject,
  });
  useKeyboardShortcut(
    [initialUserSettings.shortcuts["editor.undo"]],
    handleUndo,
  );
  useKeyboardShortcut(
    [initialUserSettings.shortcuts["editor.redo"]],
    handleRedo,
  );
  const handleApplicationDialogCancellation = useCallback((): void => {
    projectLifecycle.clearPendingMidiImport();
    cancelApplicationDialog();
  }, [cancelApplicationDialog, projectLifecycle]);
  return (
    <PianoRollWorkspaceLayout
      appShellRef={appShellRef}
      stageRef={stageRef}
      productName={APPLICATION_CONSTANTS.productName}
      inspectorOpen={projectInspectorOpen}
      inspectorSection={projectInspectorSection}
      header={(
        <RenderBaselineProfiler id="EditorHeader">
        <EditorHeader
          projectState={projectState}
          loopDragPreview={loopDragPreview}
          selectedNotes={selectedNotes}
          selectedMarkerCount={selectedMarkerCount}
          gridResolutionTicks={gridResolutionTicks}
          pitchSnapSettings={pitchSnapSettings}
          playbackStatus={playbackStatus}
          autoScrollEnabled={autoScrollEnabled}
          midiInputRef={projectLifecycle.midiInputRef}
          saveStatus={projectLifecycle.saveStatus}
          onCloseProject={projectLifecycle.closeProject}
          onExportProject={projectLifecycle.exportProject}
          onOpenMidiImport={projectLifecycle.openMidiImport}
          onExportMidi={projectLifecycle.exportMidi}
          onMidiFileChange={projectLifecycle.importMidiFile}
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
        </RenderBaselineProfiler>
      )}
      renderToolbar={() => (
          <EditorToolbar
            inspectorOpen={projectInspectorOpen}
            inspectorSection={projectInspectorSection}
            canUndo={runtime.editorCommands.canUndo()}
            canRedo={runtime.editorCommands.canRedo()}
            measureCount={measureCount}
            selectionAvailable={editableTimelineSelectionAvailable}
            noteSelectionAvailable={selectedNotes.length > 0}
            editableNoteSelectionAvailable={editableNoteSelectionAvailable}
            selectionWillBeMuted={selectionWillBeMuted}
            clipboardSelectionAvailable={editableTimelineSelectionAvailable}
            clipboardAvailable={clipboardAvailable}
            selectionMode={preferences.selectionMode}
            noteColorMode={preferences.noteColorMode}
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
            onAddMeasures={() => dialogState.openMeasure("insert")}
            onRemoveMeasures={() => dialogState.openMeasure("remove")}
            onDeleteSelection={handleDeleteSelection}
            onToggleSelectionMute={handleToggleSelectionMute}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onSelectionModeChange={preferences.changeSelectionMode}
            onNoteColorModeToggle={preferences.toggleNoteColorMode}
            onOpenSliceSelection={handleOpenSliceSelection}
            onAddMarkerAtPlayhead={timeMapMarkers.openMarkerAtPlayhead}
            onTransformSelection={handleTransformSelection}
          />
      )}
      pianoKeyboard={(
        <PianoKeyboard
          viewport={runtime.viewport}
          playheadTick={runtime.playheadTick}
          timeMap={activeClip.timeline.timeMap}
          previewEnabled={preferences.pitchPreviewEnabled}
          pitchSnapSettings={pitchSnapSettings}
          onPreviewToggle={preferences.togglePitchPreview}
          onPitchAudition={handlePitchAudition}
          onPitchLongPress={handlePitchSelect}
          onPitchInteractionChange={(pitch) => {
            runtime.highlightedPitch.set(pitch);
          }}
        />
      )}
      ruler={(
        <PianoRollRuler
          viewport={runtime.viewport}
          projectStore={runtime.projectStore}
          gridResolutionTicks={runtime.gridResolutionTicks}
          markerFlags={createTimeMapMarkerFlags(activeClip.timeline.timeMap)}
          selection={runtime.selection}
          timelineDragPreview={timelineDragPreview}
          loopDragPreview={loopDragPreview}
          interactionStrategyRef={interactionStrategyRef}
          selectionMode={preferences.selectionMode}
          onLoopCommit={handleLoopRegionCommit}
          onOpenMarker={timeMapMarkers.openMarker}
          onSelectMarker={timeMapMarkers.selectMarker}
          onMoveMarker={timeMapMarkers.moveMarker}
          onClearSelection={clearTimelineSelection}
        />
      )}
      layers={(
        <RenderBaselineProfiler id="PianoRollLayers">
          <PianoRollLayers
                  runtime={runtime}
                  selectionMode={preferences.selectionMode}
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
        </RenderBaselineProfiler>
      )}
      globalLasso={<PianoRollGlobalLasso elementRef={globalLassoRef} />}
      playhead={(
        <PianoRollPlayhead
          viewport={runtime.viewport}
          clipId={activeClip.id}
          playheadPosition={runtime.playheadPosition}
        />
      )}
      viewportControls={(
        <RenderBaselineProfiler id="PianoRollViewportControls">
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
        </RenderBaselineProfiler>
      )}
      inspectorResizeHandle={(
        <ProjectInspectorResizeHandle inspectorOpen={projectInspectorOpen} />
      )}
      renderInspector={(setToolbarHost) => (
        <RenderBaselineProfiler id="ProjectInspector">
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
          setToolbarHost={setToolbarHost}
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
          onDeleteProjectInstrument={handleDeleteProjectInstrument}
          />
        </RenderBaselineProfiler>
      )}
      overlays={(
        <>
          {radialMenu.state === null ? null : (
            <FloatingRadialMenu
              position={radialMenu.state.position}
              revision={radialMenu.state.revision}
              closing={radialMenu.state.closing}
              items={radialMenuCommands.items}
              centerButton={radialMenuCommands.centerButton}
              onClose={radialMenu.close}
            />
          )}
          <PianoRollWorkspaceDialogs
            runtime={runtime}
            projectState={projectState}
            measureCount={measureCount}
            application={applicationDialogs}
            state={dialogState}
            clip={clipDialog}
            splitClip={handleSplitClip}
            instrument={instrumentDialog}
            preferences={preferences}
            timeMapMarkers={timeMapMarkers}
            insertMeasures={handleInsertMeasuresAtPlayhead}
            removeMeasures={handleRemoveMeasuresAtPlayhead}
            onApplicationCancel={handleApplicationDialogCancellation}
          />
        </>
      )}
    />
  );
}
