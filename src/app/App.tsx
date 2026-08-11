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
  ClipId,
  ProjectState,
  InstrumentId,
} from "../domain/model";
import {
  getActiveClip,
  getClipDurationTicks,
  getActiveClipDurationTicks,
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
  type NativeClipEditorState,
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
  useClipWorkflow,
} from "./workflows/useClipWorkflow";
import {
  useProjectInstrumentWorkflow,
} from "./workflows/useProjectInstrumentWorkflow";
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
  const [selectedInstrumentId, setSelectedInstrumentId] =
    useState<InstrumentId | null>(
      () => scene.projectStore.getState().instrumentOrder[0] ?? null,
    );
  const [generalInspectorOpen, setGeneralInspectorOpen] =
    useState(false);
  const [generalInspectorSection, setGeneralInspectorSection] =
    useState<"instruments" | "clips">("instruments");
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
  const selectedInstrument =
    selectedInstrumentId === null
      ? undefined
      : projectState.projectInstrumentsById[selectedInstrumentId];
  const selectedInstrumentIndex =
    selectedInstrumentId === null
      ? -1
      : projectState.instrumentOrder.indexOf(selectedInstrumentId);
  const activeClip = getActiveClip(projectState);

  const totalTicks = getActiveClipDurationTicks(projectState);
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
      soleInstrumentId: InstrumentId | null,
    ): void => {
      setSelectionAvailable(hasSelection);

      if (soleInstrumentId !== null) {
        setSelectedInstrumentId(soleInstrumentId);
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
    previewInstrumentGain,
    previewInstrumentPreset,
    previewMasterGain,
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
    if (selectedInstrumentId !== null) {
      auditionPitch(selectedInstrumentId, pitch);
    }
  }, [
    auditionPitch,
    selectedInstrumentId,
  ]);

  useEffect(
    () => scene.projectStore.subscribe((state, previousState) => {
      if (state.activeClipId !== previousState.activeClipId) {
        const controller = pianoRollEventControllerRef.current;

        controller?.cancel();
        controller?.clearSelection();
        scene.selectionRequests.clear();
        setSelectionAvailable(false);
      }

      setProjectState(state);
      setSelectedInstrumentId((currentInstrumentId) => {
        if (
          currentInstrumentId !== null
          && state.projectInstrumentsById[currentInstrumentId] !== undefined
        ) {
          return currentInstrumentId;
        }

        return state.instrumentOrder[0] ?? null;
      });
    }),
    [scene],
  );
  useEffect(
    () => scene.pitchSnapSettings.subscribe(() => {
      setPitchSnapSettings(scene.pitchSnapSettings.get());
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
    timelinePositionRef: barLabelRef,
    timelineTimeRef: timelineTimeRef,
    beginHorizontalViewportInteraction,
    endHorizontalViewportInteraction,
    publishViewport,
  } = useViewportControls(
    scene,
    generalInspectorOpen,
    playbackStatus === "playing",
    seekPlayback,
  );
  const handleReturnToStart = useCallback((): void => {
    returnToStart();
    const viewport = scene.viewport.get();

    if (viewport.scrollX !== 0) {
      publishViewport({
        ...viewport,
        scrollX: 0,
      });
    }
  }, [publishViewport, returnToStart, scene]);
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
            [
              ...(request.prefixCommands ?? []),
              ...plan.commands,
            ],
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
    select: handleInstrumentSelect,
    add: handleAddProjectInstrument,
    moveSelected: handleMoveSelectedInstrument,
    remove: handleDeleteProjectInstrument,
    update: handleUpdateProjectInstrument,
    updateClipState: handleUpdateClipInstrumentState,
    commitEnvelopeParameter: handleEnvelopeParameterCommit,
    previewEnvelopeParameter: handleEnvelopeParameterPreview,
    commitWaveform: handleWaveformCommit,
    commitPolyphony: handleInstrumentPolyphonyCommit,
    commitInstrumentParameter: handleInstrumentParameterCommit,
    previewInstrumentParameter: handleInstrumentParameterPreview,
    selectNotes: handleSelectInstrumentNotes,
    toggleLock: handleToggleInstrumentLock,
  } = useProjectInstrumentWorkflow({
    commands: scene.editorCommands,
    selectedInstrumentId,
    selectInstrument: setSelectedInstrumentId,
    toggleInstrumentSelection(instrumentId) {
      scene.selectionRequests.toggleInstrument(instrumentId);
    },
    removeInstrumentFromSelection(instrumentId) {
      pianoRollEventControllerRef.current
        ?.removeInstrumentFromSelection(instrumentId);
    },
    confirm: showApplicationConfirmation,
    previewInstrument: previewInstrumentPreset,
  });
  const getPianoRollEventController = useCallback(
    (): PianoRollEventController | null =>
      pianoRollEventControllerRef.current,
    [],
  );
  const clearInteractionSelection = useCallback((): void => {
    const controller = pianoRollEventControllerRef.current;

    controller?.cancel();
    controller?.clearSelection();
    scene.selectionRequests.clear();
    setSelectionAvailable(false);
  }, [scene]);
  const beginClipChange = useCallback((): void => {
    stopPlayback();
    clearInteractionSelection();
  }, [clearInteractionSelection, stopPlayback]);
  const {
    select: handleClipSelect,
    add: handleAddClip,
    duplicate: handleDuplicateClip,
    moveActive: handleMoveActiveClip,
    remove: handleDeleteClip,
    rename: handleRenameClip,
  } = useClipWorkflow({
    commands: scene.editorCommands,
    beginClipChange,
    duplicateEditorState: scene.duplicateClipEditorState,
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
    toggleEnabled: handleToggleSelectionEnabled,
    transform: handleTransformSelection,
    sliceAtPlayhead: handleSliceSelectionAtPlayhead,
    paste: handlePaste,
    transferToSelectedInstrument: handleTransferSelectionToInstrument,
  } = useSelectionWorkflow({
    commands: scene.editorCommands,
    projectStore: scene.projectStore,
    getController: getPianoRollEventController,
    getPlayheadTick() {
      return scene.playheadTick.get();
    },
    setPlayheadTick: seekPlayback,
    getGridResolutionTicks() {
      return scene.gridResolutionTicks.get();
    },
    selectedInstrumentId,
    resolveCollision: handleNoteCollision,
    alert: showApplicationAlert,
  });
  const handleNoteColorModeToggle = useCallback((): void => {
    setNoteColorMode((currentMode) => {
      const nextMode: NoteColorMode =
        currentMode === "instrument" ? "pitch" : "instrument";

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
      const runtimeStates = scene.captureClipEditorStates();
      const clipStatesById: Record<ClipId, NativeClipEditorState> = {};
      const state = scene.projectStore.getState();

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
      setSelectedInstrumentId(editorState.selectedInstrumentId);
      const activeEditorState =
        editorState.clipStatesById[nextProject.activeClipId];

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
            generalInspectorOpen
              ? " is-general-inspector-open"
              : ""
          }${
            generalInspectorOpen
            && generalInspectorSection === "clips"
              ? " is-clips-inspector-open"
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
            inspectorSection={generalInspectorSection}
            canUndo={scene.projectStore.canUndo()}
            canRedo={scene.projectStore.canRedo()}
            measureCount={activeClip.measureCount}
            selectionAvailable={selectionAvailable}
            clipboardAvailable={clipboardAvailable}
            selectionMode={selectionMode}
            noteColorMode={noteColorMode}
            selectedInstrument={
              selectedInstrument === undefined
                ? undefined
                : {
                    color: selectedInstrument.color,
                    locked:
                      activeClip.instrumentStatesById[selectedInstrument.id]
                        ?.locked ?? true,
                  }
            }
            onToggleInspector={(section) => {
              if (
                generalInspectorOpen
                && generalInspectorSection === section
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
            onTransferSelectionToInstrument={handleTransferSelectionToInstrument}
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
                onSeek={seekPlayback}
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
            verticalScrollRef={pitchScrollInputRef}
            verticalZoomRef={pitchZoomInputRef}
            pitchSnapSettings={pitchSnapSettings}
            onPitchSnapSettingsChange={updatePitchSnapSettings}
          />
        </div>
        <GeneralInspector
          open={generalInspectorOpen}
          portraitSection={generalInspectorSection}
          projectState={projectState}
          selectedInstrumentId={selectedInstrumentId}
          selectedInstrumentIndex={selectedInstrumentIndex}
          selectedInstrument={selectedInstrument}
          setToolbarHost={setGeneralInspectorToolbarHost}
          onClose={() => {
            setGeneralInspectorOpen(false);
          }}
          onClipSelect={handleClipSelect}
          onAddClip={handleAddClip}
          onDuplicateClip={handleDuplicateClip}
          onMoveActiveClip={handleMoveActiveClip}
          onDeleteClip={handleDeleteClip}
          onRenameClip={handleRenameClip}
          onMoveSelectedInstrument={handleMoveSelectedInstrument}
          onAddProjectInstrument={handleAddProjectInstrument}
          onInstrumentSelect={handleInstrumentSelect}
          onUpdateProjectInstrument={handleUpdateProjectInstrument}
          onUpdateClipInstrumentState={handleUpdateClipInstrumentState}
          onInstrumentGainPreview={previewInstrumentGain}
          onSelectInstrumentNotes={handleSelectInstrumentNotes}
          onToggleInstrumentLock={handleToggleInstrumentLock}
          onDeleteProjectInstrument={handleDeleteProjectInstrument}
          onWaveformCommit={handleWaveformCommit}
          onPolyphonyCommit={handleInstrumentPolyphonyCommit}
          onEnvelopePreview={handleEnvelopeParameterPreview}
          onEnvelopeCommit={handleEnvelopeParameterCommit}
          onInstrumentParameterPreview={handleInstrumentParameterPreview}
          onInstrumentParameterCommit={handleInstrumentParameterCommit}
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
