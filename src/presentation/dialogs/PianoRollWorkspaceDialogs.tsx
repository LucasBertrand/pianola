import React from "react";
import type {
  EditorRuntime,
} from "../../application/editor-session/editor-runtime";
import {
  MAXIMUM_CLIP_GROUP_COUNT,
  countClipGroups,
} from "../../domain/clips/clip-hierarchy";
import type {
  EditorSessionState,
} from "../../domain/project/project-document";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import {
  getMeasureSpanAtTick,
} from "../../domain/transport/time-map";
import type {
  ClipDialogWorkflow,
} from "../inspector/clips/useClipDialogWorkflow";
import type {
  ClipWorkflow,
} from "../inspector/clips/useClipWorkflow";
import type {
  InstrumentDialogWorkflow,
} from "../inspector/instruments/useInstrumentDialogWorkflow";
import type {
  PianoRollUserPreferences,
} from "../inspector/instruments/usePianoRollUserPreferences";
import type {
  TimeMapMarkerWorkflow,
} from "../piano-roll/useTimeMapMarkerWorkflow";
import type {
  TransportWorkflow,
} from "../transport/useTransportWorkflow";
import {
  ApplicationDialogOverlay,
} from "./ApplicationDialogOverlay";
import {
  ClipEditorDialog,
} from "./ClipEditorDialog";
import {
  ClipSplitDialog,
} from "./ClipSplitDialog";
import {
  InstrumentPresetDialog,
} from "./InstrumentPresetDialog";
import {
  ManageMeasuresDialog,
} from "./ManageMeasuresDialog";
import {
  TempoMeterMarkerDialog,
} from "./TempoMeterMarkerDialog";
import type {
  ApplicationDialogWorkflow,
} from "./useApplicationDialogs";
import type {
  PianoRollDialogState,
} from "./usePianoRollDialogState";
import {
  resolveMeasureDialogMaximumCounts,
} from "./piano-roll-dialog-model";

export interface PianoRollWorkspaceDialogsProps {
  readonly runtime: EditorRuntime;
  readonly projectState: EditorSessionState;
  readonly measureCount: number;
  readonly application: ApplicationDialogWorkflow;
  readonly state: PianoRollDialogState;
  readonly clip: ClipDialogWorkflow;
  readonly splitClip: ClipWorkflow["split"];
  readonly instrument: InstrumentDialogWorkflow;
  readonly preferences: PianoRollUserPreferences;
  readonly timeMapMarkers: TimeMapMarkerWorkflow;
  readonly insertMeasures: TransportWorkflow["insertMeasuresAtPlayhead"];
  readonly removeMeasures: TransportWorkflow["removeMeasuresAtPlayhead"];
  readonly onApplicationCancel: () => void;
}

/** Renders each dialog against the draft owned by its dedicated workflow. */
export function PianoRollWorkspaceDialogs({
  runtime,
  projectState,
  measureCount,
  application,
  state,
  clip,
  splitClip,
  instrument,
  preferences,
  timeMapMarkers,
  insertMeasures,
  removeMeasures,
  onApplicationCancel,
}: PianoRollWorkspaceDialogsProps): React.JSX.Element {
  const activeClip = getActiveClip(projectState);
  const splitTarget = state.splitClipId === null
    ? undefined
    : projectState.clipsById[state.splitClipId];

  return (
    <>
      <ApplicationDialogOverlay
        dialog={application.dialog}
        onConfirm={application.accept}
        onAlternate={application.acceptAlternate}
        onCancel={onApplicationCancel}
      />
      {!clip.open ? null : (
        <ClipEditorDialog
          clipName={clip.name}
          clipColor={clip.color}
          canDelete={clip.canDelete}
          onClipNameChange={clip.setName}
          onClipColorChange={clip.setColor}
          onConfirm={clip.confirm}
          onSplit={() => {
            if (clip.clipId !== null) {
              state.openSplit(clip.clipId);
              clip.cancel();
            }
          }}
          onDelete={clip.remove}
          onCancel={clip.cancel}
        />
      )}
      {splitTarget === undefined ? null : (
        <ClipSplitDialog
          clip={splitTarget}
          clock={projectState.clock}
          projectClipCount={Object.keys(projectState.clipsById).length}
          canCreateGroup={
            countClipGroups(projectState.clipHierarchy)
            < MAXIMUM_CLIP_GROUP_COUNT
          }
          onConfirm={(strategy) => {
            if (state.splitClipId !== null
              && splitClip(state.splitClipId, strategy) !== null) {
              state.closeSplit();
            }
          }}
          onCancel={state.closeSplit}
        />
      )}
      {!instrument.open || instrument.config === null ? null : (
        <InstrumentPresetDialog
          mode={instrument.mode}
          presetsById={preferences.presetsById}
          presetOrder={preferences.presetOrder}
          personalPresetIds={preferences.personalPresetIds}
          selectedPresetId={instrument.selectedPresetId}
          instrumentName={instrument.name}
          instrumentColor={instrument.color}
          instrument={instrument.config}
          onPresetSelectionChange={instrument.selectPreset}
          onInstrumentNameChange={instrument.setName}
          onInstrumentColorChange={instrument.setColor}
          onInstrumentChange={instrument.setConfig}
          selectedPresetIsPersonal={instrument.selectedPresetIsPersonal}
          onCreatePreset={instrument.createPreset}
          onSavePreset={instrument.savePreset}
          onRenamePreset={instrument.renamePreset}
          onDeletePreset={instrument.deletePreset}
          onConfirm={instrument.confirm}
          onDelete={instrument.mode === "edit" ? instrument.remove : undefined}
          onCancel={instrument.cancel}
        />
      )}
      {timeMapMarkers.draft === null ? null : (
        <TempoMeterMarkerDialog
          mode={timeMapMarkers.draft.mode}
          tempoIncluded={timeMapMarkers.draft.tempoIncluded}
          meterIncluded={timeMapMarkers.draft.meterIncluded}
          scaleIncluded={timeMapMarkers.draft.scaleIncluded}
          sectionIncluded={timeMapMarkers.draft.sectionIncluded}
          canChangeMarkerTypes={timeMapMarkers.draft.canChangeMarkerTypes}
          bpm={timeMapMarkers.draft.bpm}
          timeSignature={timeMapMarkers.draft.timeSignature}
          rootNote={timeMapMarkers.draft.rootNote}
          patternType={timeMapMarkers.draft.patternType}
          patternId={timeMapMarkers.draft.patternId}
          sectionComment={timeMapMarkers.draft.sectionComment}
          errorMessage={timeMapMarkers.draftError}
          onTempoIncludedChange={timeMapMarkers.setDraftTempoIncluded}
          onMeterIncludedChange={timeMapMarkers.setDraftMeterIncluded}
          onScaleIncludedChange={timeMapMarkers.setDraftScaleIncluded}
          onSectionIncludedChange={timeMapMarkers.setDraftSectionIncluded}
          onBpmChange={timeMapMarkers.setDraftBpm}
          onTimeSignatureChange={timeMapMarkers.setDraftTimeSignature}
          onRootNoteChange={timeMapMarkers.setDraftRootNote}
          onPatternTypeChange={timeMapMarkers.setDraftPatternType}
          onPatternIdChange={timeMapMarkers.setDraftPatternId}
          onSectionCommentChange={timeMapMarkers.setDraftSectionComment}
          onConfirm={timeMapMarkers.confirmDraft}
          onCancel={timeMapMarkers.cancelDraft}
        />
      )}
      {state.measureOperation === null ? null : (
        <ManageMeasuresDialog
          operation={state.measureOperation}
          maximumCountByPosition={resolveMeasureDialogMaximumCounts(
            state.measureOperation,
            measureCount,
            getMeasureSpanAtTick(
              projectState.clock.ppqn,
              activeClip.timeline.timeMap,
              activeClip.timeline.durationTicks,
              runtime.playheadTick.get(),
            ).index,
          )}
          onConfirm={(count, position) => {
            if (state.measureOperation === "insert") {
              insertMeasures(count, position);
            } else {
              removeMeasures(count, position);
            }

            state.closeMeasure();
          }}
          onCancel={state.closeMeasure}
        />
      )}
    </>
  );
}
