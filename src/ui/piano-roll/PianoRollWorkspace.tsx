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
} from "../../config/product-config";
import {
  EDITOR_CONSTANTS,
} from "../../config/editor-config";
import {
  type ClipId,
} from "../../domain/identifiers";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import {
  getClipDurationTicks,
} from "../../domain/clips/clip";
import {
  getMeasureCount,
} from "../../domain/transport/time-map";
import {
  createTimeMapMarkerFlags,
} from "../../use-cases/piano-roll/timeline/time-map-marker-plans";
import {
  useTimeMapMarkerWorkflow,
} from "../../ui/piano-roll/useTimeMapMarkerWorkflow";
import {
  TempoMeterMarkerDialog,
} from "../../ui/dialogs/TempoMeterMarkerDialog";
import type {
  ViewportState,
} from "../../editor/geometry/converter";
import {
  type MidiImportAnalysis,
} from "../../project-io/midi/midi-import-types";
import {
  type NativeClipEditorState,
} from "../../project-io/native/native-project-schema";
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
  useMidiFileWorkflow,
} from "../../ui/project-files/useMidiFileWorkflow";
import {
  useTransportWorkflow,
} from "../../ui/transport/useTransportWorkflow";
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
  usePianoRollProjectState,
} from "./usePianoRollProjectState";

export interface PianoRollWorkspaceProps {
  readonly runtime: EditorRuntime;
}

/** Coordinates the workflows that meet on the piano-roll workspace. */
export function PianoRollWorkspace({
  runtime,
}: PianoRollWorkspaceProps): React.JSX.Element {
  const pianoRollControllerRef =
    useRef<PianoRollControllerPort | null>(null);
  const pendingMidiImportRef =
    useRef<MidiImportAnalysis | null>(null);

  const {
    project: projectState,
    selectedInstrumentId,
    selectionAvailable,
    selectInstrument: setSelectedInstrumentId,
    setSelectionAvailable,
    handleSelectionChange,
    clearInteractionSelection,
  } = usePianoRollProjectState(runtime, pianoRollControllerRef);
  const [projectInspectorOpen, setGeneralInspectorOpen] =
    useState(false);
  const [projectInspectorSection, setGeneralInspectorSection] =
    useState<"instruments" | "clips">("instruments");
  const [
    projectInspectorToolbarHost,
    setGeneralInspectorToolbarHost,
  ] = useState<HTMLDivElement | null>(null);
  const [selectionMode, setSelectionMode] =
    useState<SelectionMode>("replace");
  const [noteColorMode, setNoteColorMode] =
    useState<NoteColorMode>(
      () => runtime.noteColorMode.get(),
    );
  const [pitchPreviewEnabled, setPitchPreviewEnabled] =
    useState<boolean>(
      EDITOR_CONSTANTS.defaultPitchPreviewEnabled,
    );
  const [pitchSnapSettings, setPitchSnapSettings] =
    useState<PitchSnapSettings>(
      () => runtime.pitchSnapSettings.get(),
    );
  const activeClip = getActiveClip(projectState);

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
    insertMeasureAtPlayhead: handleInsertMeasureAtPlayhead,
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
  const timeMapMarkers = useTimeMapMarkerWorkflow({
    runtime,
    alert: showApplicationAlert,
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
    paste: handlePaste,
    transferToInstrument: handleTransferSelectionToInstrument,
  } = usePianoRollSelectionWorkflow({
    commands: runtime.editorCommands,
    projectStore: runtime.projectStore,
    getController: getPianoRollController,
    getPlayheadTick() {
      return runtime.playheadTick.get();
    },
    setPlayheadTick: seekPlayback,
    getGridResolutionTicks() {
      return runtime.gridResolutionTicks.get();
    },
    resolveCollision: handleNoteCollision,
    alert: showApplicationAlert,
  });
  const handleNoteColorModeToggle = useCallback((): void => {
    setNoteColorMode((currentMode) => {
      const nextMode: NoteColorMode =
        currentMode === "instrument" ? "pitch" : "instrument";

      runtime.noteColorMode.set(nextMode);
      return nextMode;
    });
  }, [runtime]);
  const {
    loadInputRef: loadProjectInputRef,
    save: handleSaveProject,
    createNew: handleNewProject,
    open: handleOpenProject,
    load: handleProjectFileChange,
    replaceActiveProject,
  } = useProjectFileWorkflow({
    runtime,
    getEditorState() {
      const runtimeStates = runtime.captureClipEditorStates();
      const clipStatesById: Record<ClipId, NativeClipEditorState> = {};
      const state = runtime.projectStore.getState();

      for (const [clipId, clipState] of Object.entries(runtimeStates)) {
        const clip = state.clipsById[clipId];

        if (clip === undefined) {
          continue;
        }

        clipStatesById[clipId] = {
          playheadTick: Math.min(
            getClipDurationTicks(clip),
            Math.max(0, Math.round(clipState.playheadTick)),
          ),
          pitchSnapSettings: clipState.pitchSnapSettings,
          gridSettings: clipState.gridSettings,
          viewport: getNativeViewportState(clipState.viewport),
        };
      }

      return {
        activeClipId: state.workspace.activeClipId,
        selectedInstrumentId,
        selectionMode,
        noteColorMode,
        pitchPreviewEnabled,
        clipStatesById,
      };
    },
    stopPlayback,
    seekPlayback,
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
    onEditorStateRestored(nextProject, editorState) {
      setSelectionMode(editorState.selectionMode);
      setNoteColorMode(editorState.noteColorMode);
      setPitchPreviewEnabled(editorState.pitchPreviewEnabled);
      setSelectedInstrumentId(editorState.selectedInstrumentId);
      const activeEditorState =
        editorState.clipStatesById[nextProject.workspace.activeClipId];

      if (activeEditorState !== undefined) {
        setPitchSnapSettings(activeEditorState.pitchSnapSettings);
      }
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
        playbackStatus={playbackStatus}
        projectInputRef={loadProjectInputRef}
        midiInputRef={importMidiInputRef}
        onNewProject={handleNewProject}
        onSaveProject={handleSaveProject}
        onOpenProject={handleOpenProject}
        onOpenMidiImport={handleOpenMidiImport}
        onExportMidi={handleExportMidi}
        onProjectFileChange={handleProjectFileChange}
        onMidiFileChange={handleMidiFileChange}
        onProjectTitleCommit={handleProjectTitleCommit}
        onReturnToStart={handleReturnToStart}
        onTogglePlayback={togglePlayback}
        onStopPlayback={stopPlayback}
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
            canUndo={runtime.projectStore.canUndo()}
            canRedo={runtime.projectStore.canRedo()}
            measureCount={getMeasureCount(
              projectState.clock.ppqn,
              activeClip.timeline.timeMap,
              activeClip.timeline.durationTicks,
            )}
            selectionAvailable={selectionAvailable}
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
            onInsertMeasure={handleInsertMeasureAtPlayhead}
            onRemoveMeasure={handleRemoveMeasureAtPlayhead}
            onDeleteSelection={handleDeleteSelection}
            onToggleSelectionEnabled={handleToggleSelectionEnabled}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onSelectionModeChange={setSelectionMode}
            onNoteColorModeToggle={handleNoteColorModeToggle}
            onSliceSelectionAtPlayhead={handleSliceSelectionAtPlayhead}
            onAddMarkerAtPlayhead={timeMapMarkers.openMarkerAtPlayhead}
            onTransformSelection={handleTransformSelection}
          />,
          projectInspectorToolbarHost,
        )}

          <div className="roll-frame">
            <PianoKeyboard
              viewport={runtime.viewport}
              previewEnabled={pitchPreviewEnabled}
              pitchSnapSettings={pitchSnapSettings}
              onPreviewToggle={() => {
                setPitchPreviewEnabled((enabled) => !enabled);
              }}
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
                onLoopCommit={handleLoopRegionCommit}
                onOpenMarker={timeMapMarkers.openMarker}
                onMoveMarker={timeMapMarkers.moveMarker}
                onGridSeek={seekPlayback}
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
                  onSelectionChange={handleSelectionChange}
                  onGridSeek={seekPlayback}
                  onNoteCollision={handleNoteCollision}
                />
              </div>
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
          selectionAvailable={selectionAvailable}
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
          measureIndex={timeMapMarkers.draft.measureIndex}
          bpm={timeMapMarkers.draft.bpm}
          timeSignature={timeMapMarkers.draft.timeSignature}
          canDelete={timeMapMarkers.draft.canDelete}
          onBpmChange={timeMapMarkers.setDraftBpm}
          onTimeSignatureChange={timeMapMarkers.setDraftTimeSignature}
          onDelete={timeMapMarkers.deleteDraft}
          onConfirm={timeMapMarkers.confirmDraft}
          onCancel={timeMapMarkers.cancelDraft}
        />
      )}
    </main>
  );
}

function getNativeViewportState(
  viewport: ViewportState,
): NativeClipEditorState["viewport"] {
  return {
    zoomX: viewport.zoomX,
    zoomY: viewport.zoomY,
    scrollX: viewport.scrollX,
    scrollY: viewport.scrollY,
  };
}

function formatAudioPlaybackError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "The browser could not initialize the audio engine.";
}
