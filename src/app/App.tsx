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
} from "../config/product-config";
import {
  EDITOR_CONSTANTS,
} from "../config/editor-config";
import {
  RENDERING_CONSTANTS,
} from "../config/rendering-config";
import { APPLICATION_COLORS } from "../config/application-colors";
import type {
  NoteCollisionResolutionRequest,
} from "../use-cases/notes/note-collision-resolution";
import {
  type PianoRollCommand,
} from "../domain/commands/command-types";
import type {
  ClipId,
  PresetId,
  ProjectState,
  InstrumentId,
  SubtractiveSynthConfig,
} from "../domain/model";
import {
  getActiveClip,
  getClipDurationTicks,
  getClipMeasureCount,
} from "../domain/model";
import {
  createNoteCollisionResolutionPlan,
  type NoteCollisionResolutionMode,
} from "../domain/note-collision";
import type {
  ViewportState,
} from "../editor/geometry/converter";
import {
  type MidiImportAnalysis,
} from "../project-io/midi/midi-import-types";
import {
  type NativeClipEditorState,
} from "../project-io/native/native-project-schema";
import {
  ApplicationDialogOverlay,
} from "../ui/dialogs/ApplicationDialogOverlay";
import type {
  ApplicationConfirmationOptions,
  ApplicationDialogState,
  ApplicationDialogTone,
} from "../use-cases/dialogs/application-dialog-port";
import {
  PianoRollLayers,
} from "../ui/piano-roll/PianoRollLayers";
import {
  ViewControls,
} from "../ui/editor-toolbar/ViewControls";
import {
  BarRuler,
  RollPlayhead,
} from "../ui/piano-roll/Timeline";
import {
  PianoKeyboard,
} from "../ui/piano-roll/PianoKeyboard";
import {
  EditorToolbar,
} from "../ui/editor-toolbar/EditorToolbar";
import {
  GeneralInspector,
} from "../ui/inspector/GeneralInspector";
import {
  InstrumentPresetDialog,
} from "../ui/dialogs/InstrumentPresetDialog";
import {
  EditorHeader,
} from "../ui/editor-toolbar/EditorHeader";
import {
  useAudioPlayback,
} from "../ui/transport/useAudioPlayback";
import type {
  PianoRollControllerPort,
} from "../editor/interactions/piano-roll-controller-port";
import {
  type PitchSnapSettings,
} from "../music/pitch-snap";
import type {
  SelectionMode,
} from "../editor/interactions/gestures/gesture-draft";
import type {
  NoteColorMode,
} from "../editor/model/note-color-mode";
import {
  createDemoProjectState,
} from "./demo-project";
import {
  createEditorRuntime,
} from "./create-app-runtime";
import type {
  EditorRuntime,
} from "../editor/runtime/editor-runtime";
import {
  useClipWorkflow,
} from "../ui/inspector/clips/useClipWorkflow";
import {
  useProjectInstrumentWorkflow,
} from "../ui/inspector/instruments/useProjectInstrumentWorkflow";
import {
  useSelectionWorkflow,
} from "../ui/piano-roll/useSelectionWorkflow";
import {
  useProjectFileWorkflow,
} from "../ui/project-files/useProjectFileWorkflow";
import {
  useMidiFileWorkflow,
} from "../ui/project-files/useMidiFileWorkflow";
import {
  useTransportWorkflow,
} from "../ui/transport/useTransportWorkflow";
import {
  useViewportControls,
} from "../ui/piano-roll/useViewportControls";
import {
  selectInstrumentPresetId,
  createInstrumentConfigFromPreset,
} from "../domain/instrument-presets";

export function App(): React.JSX.Element {
  const runtimeRef = useRef<EditorRuntime | null>(null);
  const pianoRollControllerRef =
    useRef<PianoRollControllerPort | null>(null);
  const editTransactionSequenceRef = useRef(0);
  const pendingMidiImportRef =
    useRef<MidiImportAnalysis | null>(null);

  if (runtimeRef.current === null) {
    runtimeRef.current = createEditorRuntime(
      createDemoProjectState(),
    );
  }

  const runtime = runtimeRef.current;

  const [projectState, setProjectState] = useState(
    () => runtime.projectStore.getState(),
  );
  const [selectedInstrumentId, setSelectedInstrumentId] =
    useState<InstrumentId | null>(
      () => runtime.projectStore.getState().instrumentOrder[0] ?? null,
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
  const [applicationDialog, setApplicationDialog] =
    useState<ApplicationDialogState | null>(null);
  const [pendingInstrumentPresetId, setPendingInstrumentPresetId] =
    useState<PresetId | "" | null>(null);
  const [pendingInstrumentName, setPendingInstrumentName] = useState("");
  const [pendingInstrumentColor, setPendingInstrumentColor] =
    useState<string>(APPLICATION_COLORS.accent.primary);
  const [pendingInstrumentConfig, setPendingInstrumentConfig] =
    useState<SubtractiveSynthConfig | null>(null);
  const [pendingEditedInstrumentId, setPendingEditedInstrumentId] =
    useState<InstrumentId | null>(null);
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
    pianoRollControllerRef.current
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
    () => runtime.projectStore.subscribe((state, previousState) => {
      if (state.workspace.activeClipId !== previousState.workspace.activeClipId) {
        const controller = pianoRollControllerRef.current;

        controller?.cancel();
        controller?.clearSelection();
        runtime.selectionRequests.clear();
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
    [runtime],
  );
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
    generalInspectorOpen,
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
  const dispatchEditCommands = useCallback(
    (
      commands: readonly PianoRollCommand[],
      label: string,
    ): ProjectState | null => {
      if (commands.length === 0) {
        return null;
      }

      editTransactionSequenceRef.current += 1;
      return runtime.editorCommands.dispatch(commands, label);
    },
    [runtime],
  );
  const handleNoteCollision = useCallback(
    (request: NoteCollisionResolutionRequest): void => {
      const resolveCollision = (
        mode: NoteCollisionResolutionMode,
      ): void => {
        const timestamp = Date.now();
        const plan = createNoteCollisionResolutionPlan(
          runtime.projectStore.getState(),
          request.clipId,
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
      runtime,
      showApplicationAlert,
    ],
  );
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
  const handleOpenAddInstrumentDialog = useCallback((): void => {
    const state = runtime.projectStore.getState();
    const presetId = selectInstrumentPresetId(
      state.instrumentPresetOrder,
      state.instrumentOrder.length,
    );

    setApplicationDialog(null);
    setPendingInstrumentName(`Instrument ${state.instrumentOrder.length + 1}`);
    setPendingInstrumentColor(
      RENDERING_CONSTANTS.userInstrumentColors[
        state.instrumentOrder.length
        % RENDERING_CONSTANTS.userInstrumentColors.length
      ] ?? APPLICATION_COLORS.accent.primary,
    );
    const preset = state.instrumentPresetsById[presetId];

    if (preset === undefined) {
      return;
    }

    setPendingEditedInstrumentId(null);
    setPendingInstrumentConfig(createInstrumentConfigFromPreset(preset));
    setPendingInstrumentPresetId(presetId);
  }, [runtime]);
  const handleOpenEditInstrumentDialog = useCallback((instrumentId: InstrumentId): void => {
    const projectInstrument =
      runtime.projectStore.getState().projectInstrumentsById[instrumentId];

    if (
      projectInstrument === undefined
      || projectInstrument.instrument.kind !== "subtractive"
    ) {
      return;
    }

    setApplicationDialog(null);
    setPendingEditedInstrumentId(instrumentId);
    setPendingInstrumentName(projectInstrument.name);
    setPendingInstrumentColor(projectInstrument.color);
    setPendingInstrumentConfig({
      ...projectInstrument.instrument,
      envelope: { ...projectInstrument.instrument.envelope },
      filterEnvelope: { ...projectInstrument.instrument.filterEnvelope },
    });
    setPendingInstrumentPresetId("");
  }, [runtime]);
  const handleInstrumentPresetSelection = useCallback((presetId: PresetId): void => {
    const preset = runtime.projectStore.getState().instrumentPresetsById[presetId];

    if (preset === undefined) {
      return;
    }

    setPendingInstrumentPresetId(presetId);
    setPendingInstrumentConfig(createInstrumentConfigFromPreset(preset));
  }, [runtime]);
  const handleConfirmAddInstrument = useCallback((): void => {
    if (pendingInstrumentPresetId === null || pendingInstrumentConfig === null) {
      return;
    }

    if (pendingInstrumentName.trim().length === 0) {
      return;
    }

    if (pendingEditedInstrumentId === null) {
      addProjectInstrument(
        pendingInstrumentName,
        pendingInstrumentConfig,
        pendingInstrumentColor,
      );
    } else {
      handleUpdateProjectInstrument(
        pendingEditedInstrumentId,
        {
          name: pendingInstrumentName.trim(),
          color: pendingInstrumentColor,
          instrument: pendingInstrumentConfig,
        },
        "Update instrument settings",
      );
    }
    setPendingInstrumentPresetId(null);
    setPendingInstrumentConfig(null);
    setPendingEditedInstrumentId(null);
    setPendingInstrumentName("");
  }, [
    addProjectInstrument,
    handleUpdateProjectInstrument,
    pendingEditedInstrumentId,
    pendingInstrumentConfig,
    pendingInstrumentColor,
    pendingInstrumentName,
    pendingInstrumentPresetId,
  ]);
  const getPianoRollController = useCallback(
    (): PianoRollControllerPort | null =>
      pianoRollControllerRef.current,
    [],
  );
  const clearInteractionSelection = useCallback((): void => {
    const controller = pianoRollControllerRef.current;

    controller?.cancel();
    controller?.clearSelection();
    runtime.selectionRequests.clear();
    setSelectionAvailable(false);
  }, [runtime]);
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
  } = useSelectionWorkflow({
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
        projectStore={runtime.projectStore}
        editorCommands={runtime.editorCommands}
        gridSettings={runtime.gridSettings}
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
            canUndo={runtime.projectStore.canUndo()}
            canRedo={runtime.projectStore.canRedo()}
            measureCount={getClipMeasureCount(
              projectState.clock,
              activeClip,
            )}
            selectionAvailable={selectionAvailable}
            clipboardAvailable={clipboardAvailable}
            selectionMode={selectionMode}
            noteColorMode={noteColorMode}
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
            onSliceSelectionAtPlayhead={handleSliceSelectionAtPlayhead}
            onTransformSelection={handleTransformSelection}
          />,
          generalInspectorToolbarHost,
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
              <BarRuler
                viewport={runtime.viewport}
                projectStore={runtime.projectStore}
                gridResolutionTicks={runtime.gridResolutionTicks}
                onLoopCommit={handleLoopRegionCommit}
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
              <RollPlayhead
                viewport={runtime.viewport}
                playheadTick={runtime.playheadTick}
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
          selectionAvailable={selectionAvailable}
          setToolbarHost={setGeneralInspectorToolbarHost}
          onClipSelect={handleClipSelect}
          onAddClip={handleAddClip}
          onDuplicateClip={handleDuplicateClip}
          onReorderClip={handleReorderClip}
          onDeleteClip={handleDeleteClip}
          onRenameClip={handleRenameClip}
          onReorderInstrument={handleReorderInstrument}
          onAddProjectInstrument={handleOpenAddInstrumentDialog}
          onInstrumentSelect={handleInstrumentSelect}
          onEditProjectInstrument={handleOpenEditInstrumentDialog}
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
      {pendingInstrumentPresetId === null || pendingInstrumentConfig === null ? null : (
        <InstrumentPresetDialog
          mode={pendingEditedInstrumentId === null ? "create" : "edit"}
          presetsById={projectState.instrumentPresetsById}
          presetOrder={projectState.instrumentPresetOrder}
          selectedPresetId={pendingInstrumentPresetId}
          instrumentName={pendingInstrumentName}
          instrumentColor={pendingInstrumentColor}
          instrument={pendingInstrumentConfig}
          onPresetSelectionChange={handleInstrumentPresetSelection}
          onInstrumentNameChange={setPendingInstrumentName}
          onInstrumentColorChange={setPendingInstrumentColor}
          onInstrumentChange={setPendingInstrumentConfig}
          onConfirm={handleConfirmAddInstrument}
          onCancel={() => {
            setPendingInstrumentPresetId(null);
            setPendingInstrumentConfig(null);
            setPendingEditedInstrumentId(null);
            setPendingInstrumentName("");
          }}
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
