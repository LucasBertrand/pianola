import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import type {
  LoopRegion,
} from "../../domain/transport/transport";
import {
  createTimeMapMarkerFlags,
} from "../../application/piano-roll/timeline/time-map-marker-plans";
import {
  useTimeMapMarkerWorkflow,
} from "./useTimeMapMarkerWorkflow";
import {
  useApplicationDialogs,
} from "../dialogs/useApplicationDialogs";
import {
  PianoRollWorkspaceDialogs,
} from "../dialogs/PianoRollWorkspaceDialogs";
import {
  usePianoRollDialogState,
} from "../dialogs/usePianoRollDialogState";
import {
  PianoRollLayers,
} from "./PianoRollLayers";
import {
  PianoRollWorkspaceLayout,
} from "./PianoRollWorkspaceLayout";
import {
  PianoRollViewportControls,
} from "./viewport/PianoRollViewportControls";
import {
  PianoRollRuler,
  PianoRollPlayhead,
} from "./PianoRollTimeline";
import {
  PianoRollGlobalLasso,
} from "./PianoRollGlobalLasso";
import {
  PianoKeyboard,
} from "./PianoKeyboard";
import {
  EditorToolbar,
} from "../editor-toolbar/EditorToolbar";
import {
  ProjectInspector,
} from "../inspector/ProjectInspector";
import {
  ProjectInspectorResizeHandle,
} from "../inspector/ProjectInspectorResizeHandle";
import {
  EditorHeader,
} from "../editor-header/EditorHeader";
import type {
  PianoRollControllerPort,
} from "../../editor-core/interactions/piano-roll-controller-port";
import type {
  PointerInteractionStrategy,
} from "../../editor-core/interactions/pointer/pointer-interaction-strategy";
import {
  type PitchSnapSettings,
} from "../../domain/music-theory/pitch-snap";
import type {
  EditorRuntime,
} from "../../application/editor-session/editor-runtime";
import {
  MutableRenderSignal,
} from "../../editor-core/model/render-signal";
import type {
  TimelineDragPreview,
} from "../../editor-core/model/timeline-drag-preview";
import {
  usePianoRollProjectState,
} from "./usePianoRollProjectState";
import {
  usePrimaryActionTrigger,
} from "./interactions/usePrimaryActionTrigger";
import {
  FloatingRadialMenu,
} from "../radial-menu/FloatingRadialMenu";
import {
  useKeyboardShortcut,
} from "./interactions/useKeyboardShortcut";
import {
  useRenderSignalValue,
} from "./useRenderSignalValue";
import {
  useNoteCollisionDialogWorkflow,
} from "./interactions/useNoteCollisionDialogWorkflow";
import {
  useMarkerCollisionDialogWorkflow,
} from "./interactions/useMarkerCollisionDialogWorkflow";
import {
  usePianoRollProjectLifecycle,
} from "../project-files/usePianoRollProjectLifecycle";
import {
  usePianoRollTransportViewport,
} from "../transport/usePianoRollTransportViewport";
import type {
  ProjectRepository,
  PersistedEditorWorkspace,
} from "../../application/ports/project-repository";
import type {
  UserSettings,
  UserSettingsRepository,
} from "../../application/ports/user-settings-repository";
import { useInspectorWorkspace } from "./useInspectorWorkspace";
import { useInstrumentsWorkspace } from "./useInstrumentsWorkspace";
import { useClipsWorkspace } from "./useClipsWorkspace";
import { useSelectionWorkspace } from "./useSelectionWorkspace";

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
  const inspector = useInspectorWorkspace();
  const dialogState = usePianoRollDialogState();
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

  const handleNoteCollision = useNoteCollisionDialogWorkflow({
    runtime,
    showDialog: setApplicationDialog,
    alert: showApplicationAlert,
  });

  const {
    preferences,
    instrumentDialog,
    instruments,
  } = useInstrumentsWorkspace({
    runtime,
    selectedInstrumentId,
    selectInstrument: setSelectedInstrumentId,
    pianoRollControllerRef,
    confirm: showApplicationConfirmation,
    alert: showApplicationAlert,
    showDialog: setApplicationDialog,
    initialUserSettings,
    projectPresetsById: projectState.instrumentPresetsById,
    projectPresetOrder: projectState.instrumentPresetOrder,
    userSettingsRepository,
    onUserSettingsChange,
    previewInstrumentSettings,
  });

  const {
    clips,
    clipDialog,
    selectClipForPlayback,
    selectClipNotes,
  } = useClipsWorkspace({
    runtime,
    clearInteractionSelection,
    confirm: showApplicationConfirmation,
    alert: showApplicationAlert,
    showDialog: setApplicationDialog,
    autoScrollEnabled,
    playbackStatus,
    activeClipId: activeClip.id,
    playingClipId,
  });

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

  const selectionWk = useSelectionWorkspace({
    runtime,
    getController: getPianoRollController,
    resolveCollision: handleNoteCollision,
    resolveMarkerCollision: handleMarkerCollision,
    alert: showApplicationAlert,
    showDialog: setApplicationDialog,
    selectedNotes,
    selectedMarkerCount,
    playbackStatus,
    togglePlayback,
    openMarkerAtPlayhead: timeMapMarkers.openMarkerAtPlayhead,
  });

  const projectLifecycle = usePianoRollProjectLifecycle({
    runtime,
    documentId,
    storedRevision,
    projectRepository,
    selectedInstrumentId,
    controllerRef: pianoRollControllerRef,
    stopPlayback,
    clearClipboard: selectionWk.selection.clearClipboard,
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
    selectionWk.selection.undo,
  );
  useKeyboardShortcut(
    [initialUserSettings.shortcuts["editor.redo"]],
    selectionWk.selection.redo,
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
      inspectorOpen={inspector.open}
      inspectorSection={inspector.section}
      header={(
        <EditorHeader
          projectControls={{
            projectTitle: projectState.title,
            midiInputRef: projectLifecycle.midiInputRef,
            onCloseProject: projectLifecycle.closeProject,
            onExportProject: projectLifecycle.exportProject,
            onOpenMidiImport: projectLifecycle.openMidiImport,
            onExportMidi: projectLifecycle.exportMidi,
            onMidiFileChange: projectLifecycle.importMidiFile,
            onProjectTitleCommit: handleProjectTitleCommit,
          }}
          transportControls={{
            status: playbackStatus,
            loopEnabled: activeClip.transportSettings.loopEnabled,
            autoAdvanceEnabled: projectState.autoAdvanceEnabled,
            autoScrollEnabled,
            onReturnToStart: handleReturnToStart,
            onTogglePlayback: togglePlayback,
            onToggleLoop: handleToggleLoop,
            onToggleAutoAdvance: handleToggleAutoAdvance,
            onToggleAutoScroll: handleAutoScrollToggle,
          }}
          context={{
            projectState,
            loopDragPreview,
            selectedNotes,
            selectedMarkerCount,
            gridResolutionTicks,
            pitchSnapSettings,
            saveStatus: projectLifecycle.saveStatus,
          }}
          masterBus={{
            gain: projectState.masterBus.gain,
            muted: projectState.masterBus.muted,
            tuningFrequencyHz: projectState.masterBus.tuningFrequencyHz,
            onPreview: previewMasterGain,
            onCommit: handleMasterGainCommit,
            onMuteToggle: handleMasterMuteToggle,
            onTuningCommit: handleMasterTuningCommit,
          }}
        />
      )}
      renderToolbar={() => (
          <EditorToolbar
            inspectorOpen={inspector.open}
            inspectorSection={inspector.section}
            canUndo={runtime.editorCommands.canUndo()}
            canRedo={runtime.editorCommands.canRedo()}
            measureCount={measureCount}
            selectionAvailable={selectionWk.editableTimelineSelectionAvailable}
            noteSelectionAvailable={selectedNotes.length > 0}
            editableNoteSelectionAvailable={selectionWk.editableNoteSelectionAvailable}
            selectionWillBeMuted={selectionWk.selectionWillBeMuted}
            clipboardSelectionAvailable={selectionWk.editableTimelineSelectionAvailable}
            clipboardAvailable={selectionWk.selection.clipboardAvailable}
            selectionMode={preferences.selectionMode}
            noteColorMode={preferences.noteColorMode}
            onToggleInspector={inspector.toggle}
            onUndo={selectionWk.selection.undo}
            onRedo={selectionWk.selection.redo}
            onAddMeasures={() => dialogState.openMeasure("insert")}
            onRemoveMeasures={() => dialogState.openMeasure("remove")}
            onDeleteSelection={selectionWk.selection.remove}
            onToggleSelectionMute={selectionWk.selection.toggleMute}
            onCopy={selectionWk.selection.copy}
            onCut={selectionWk.selection.cut}
            onPaste={selectionWk.selection.paste}
            onSelectionModeChange={preferences.changeSelectionMode}
            onNoteColorModeToggle={preferences.toggleNoteColorMode}
            onOpenSliceSelection={selectionWk.openSliceSelection}
            onAddMarkerAtPlayhead={timeMapMarkers.openMarkerAtPlayhead}
            onTransformSelection={selectionWk.selection.transform}
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
          onTwoFingerDoubleTap={selectionWk.selection.undo}
          controllerRef={pianoRollControllerRef}
          interactionStrategyRef={interactionStrategyRef}
          onSelectionChange={handleSelectionChange}
          onGridSeek={seekPlayback}
          onOpenContextMenu={selectionWk.radialMenu.openAt}
          onNoteCollision={handleNoteCollision}
          onMarkerCollision={handleMarkerCollision}
          globalLassoRef={globalLassoRef}
          timelineDragPreview={timelineDragPreview}
        />
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
      )}
      inspectorResizeHandle={(
        <ProjectInspectorResizeHandle inspectorOpen={inspector.open} />
      )}
      renderInspector={(setToolbarHost) => (
        <ProjectInspector
          open={inspector.open}
          portraitSection={inspector.section}
          projectState={projectState}
          playingClipId={
            playbackStatus === "playing" ? playingClipId : null
          }
          playheadPosition={runtime.playheadPosition}
          suppressClipSelectionHighlight={
            autoScrollEnabled && playbackStatus === "playing"
          }
          selectedInstrumentId={selectedInstrumentId}
          selectionAvailable={selectionWk.editableNoteSelectionAvailable}
          setToolbarHost={setToolbarHost}
          onClipSelect={selectClipForPlayback}
          onToggleClipBypass={clips.toggleBypass}
          onToggleClipPlayback={toggleClipPlayback}
          onAddClip={clips.add}
          onDuplicateClip={clips.duplicate}
          onDuplicateClipGroup={clips.duplicateGroup}
          onToggleClipGroupBypass={clips.toggleGroupBypass}
          onCreateClipGroup={clips.createGroup}
          onUpdateClipGroup={clips.updateGroup}
          onConcatenateClipGroup={clips.concatenateGroup}
          onUngroupClips={clips.ungroup}
          onDeleteClipGroup={clips.deleteGroup}
          onMoveClipNode={clips.moveNode}
          onSelectClipNotes={selectClipNotes}
          onEditClip={clipDialog.openEdit}
          onReorderInstrument={instruments.reorder}
          onAddProjectInstrument={instrumentDialog.openCreate}
          onInstrumentSelect={instruments.select}
          onEditProjectInstrument={instrumentDialog.openEdit}
          onUpdateProjectInstrument={instruments.update}
          onInstrumentGainPreview={previewInstrumentGain}
          onSelectInstrumentNotes={instruments.selectNotes}
          onTransferSelectionToInstrument={selectionWk.selection.transferToInstrument}
          onDeleteProjectInstrument={instruments.remove}
        />
      )}
      overlays={(
        <>
          {selectionWk.radialMenu.state === null ? null : (
            <FloatingRadialMenu
              position={selectionWk.radialMenu.state.position}
              revision={selectionWk.radialMenu.state.revision}
              closing={selectionWk.radialMenu.state.closing}
              items={selectionWk.radialMenuCommands.items}
              centerButton={selectionWk.radialMenuCommands.centerButton}
              onClose={selectionWk.radialMenu.close}
            />
          )}
          <PianoRollWorkspaceDialogs
            runtime={runtime}
            projectState={projectState}
            measureCount={measureCount}
            application={applicationDialogs}
            state={dialogState}
            clip={clipDialog}
            splitClip={clips.split}
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
