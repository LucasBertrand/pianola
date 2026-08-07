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
} from "../config/program-constants";
import type {
  NoteCollisionResolutionRequest,
} from "../application/note-collision-resolution";
import {
  type PianoRollCommand,
} from "../domain/commands";
import type {
  ProjectState,
  VoiceId,
} from "../domain/model";
import {
  getProjectDurationTicks,
} from "../domain/model";
import {
  createNoteCollisionResolutionPlan,
  type NoteCollisionResolutionMode,
} from "../domain/note-collision";
import type {
  ViewportState,
} from "../geometry/converter";
import {
  type MidiImportAnalysis,
} from "../midi/midi-importer";
import {
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
  ViewControls,
} from "../ui/components/ViewControls";
import {
  BarRuler,
  RollPlayhead,
  TimelineLoopRegion,
} from "../ui/components/Timeline";
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
  EditorHeader,
} from "../ui/components/EditorHeader";
import {
  useAudioPlayback,
} from "../ui/hooks/useAudioPlayback";
import type {
  PianoRollEventController,
} from "../interaction/piano-roll-event-controller";
import {
  type PitchSnapSettings,
} from "../music/pitch-snap";
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
  type EditorRuntime,
} from "./editor-runtime";
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
import {
  useTransportWorkflow,
} from "./workflows/useTransportWorkflow";
import {
  useViewportControls,
} from "./workflows/useViewportControls";
import type {
  ApplicationConfirmationOptions,
} from "./workflows/dialog-types";

export function App(): React.JSX.Element {
  const sceneRef = useRef<EditorRuntime | null>(null);
  const pianoRollEventControllerRef =
    useRef<PianoRollEventController | null>(null);
  const editTransactionSequenceRef = useRef(0);
  const pendingMidiImportRef =
    useRef<MidiImportAnalysis | null>(null);

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

  const {
    appShellRef,
    stageRef,
    horizontalZoomInputRef: zoomInputRef,
    horizontalScrollInputRef: scrollInputRef,
    verticalScrollInputRef: pitchScrollInputRef,
    verticalZoomInputRef: pitchZoomInputRef,
    horizontalZoomLabelRef: zoomLabelRef,
    verticalZoomLabelRef: pitchZoomLabelRef,
    timelinePositionRef: barLabelRef,
    timelineTimeRef: timelineTimeRef,
    publishViewport,
    restoreViewport,
  } = useViewportControls(
    scene,
    generalInspectorOpen,
    seekPlayback,
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
  const getPianoRollEventController = useCallback(
    (): PianoRollEventController | null =>
      pianoRollEventControllerRef.current,
    [],
  );
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
    runtime: scene,
    getController: getPianoRollEventController,
    seekPlayback,
  });
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
  const handleNoteColorModeToggle = useCallback((): void => {
    setNoteColorMode((currentMode) => {
      const nextMode: NoteColorMode =
        currentMode === "voice" ? "pitch" : "voice";

      scene.noteColorMode.set(nextMode);
      return nextMode;
    });
  }, [scene]);
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

      restoreViewport(
        restoredViewport,
        getProjectDurationTicks(nextProject),
      );
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
      <EditorHeader
        projectStore={scene.projectStore}
        editorCommands={scene.editorCommands}
        gridSettings={scene.gridSettings}
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
        onReturnToStart={returnToStart}
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

          <ViewControls
            timelinePositionRef={barLabelRef}
            timelineTimeRef={timelineTimeRef}
            horizontalScrollRef={scrollInputRef}
            horizontalZoomRef={zoomInputRef}
            horizontalZoomLabelRef={zoomLabelRef}
            verticalScrollRef={pitchScrollInputRef}
            verticalZoomRef={pitchZoomInputRef}
            verticalZoomLabelRef={pitchZoomLabelRef}
            pitchSnapSettings={pitchSnapSettings}
            onPitchSnapSettingsChange={updatePitchSnapSettings}
          />
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

function formatAudioPlaybackError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "The browser could not initialize the audio engine.";
}
