import {
  type Clip,
} from "../clips/clip";
import {
  type ProjectState,
} from "../project/project-document";
import { DomainValidationError } from "../validation/validation-result";
import type { ActiveClipProjectState } from "./active-clip-project-state";
import {
  applyAddClip,
  applyConcatenateClipGroup,
  applyCreateClipGroup,
  applyDeleteClip,
  applyDeleteClipGroup,
  applyUngroupClipGroup,
  applyMoveClipHierarchyNode,
  applyRenameClip,
  applyUpdateClipGroup,
  applyReorderClips,
  applyUpdateClip,
} from "./clip-commands";
import { CommandRejectedError } from "./command-errors";
import { assertNever, reject } from "./command-context";
import type {
  AddClipCommand,
  ConcatenateClipGroupCommand,
  AddProjectInstrumentCommand,
  CreateClipGroupCommand,
  DeleteClipCommand,
  DeleteClipGroupCommand,
  DeleteProjectInstrumentCommand,
  DeleteInstrumentPresetCommand,
  PianoRollCommand,
  RenameClipCommand,
  ReorderClipsCommand,
  MoveClipHierarchyNodeCommand,
  UpdateClipGroupCommand,
  UngroupClipGroupCommand,
  UpdateClipCommand,
  ReorderProjectInstrumentsCommand,
  SaveInstrumentPresetCommand,
  SetAutoAdvanceEnabledCommand,
  SetMasterMutedCommand,
  UpdateMasterGainCommand,
  UpdateMasterTuningCommand,
  UpdateProjectInstrumentCommand,
  UpdateProjectTitleCommand,
} from "./command-types";
import {
  applyAddProjectInstrument,
  applyDeleteProjectInstrument,
  applyDeleteInstrumentPreset,
  applyReorderProjectInstruments,
  applySaveInstrumentPreset,
  applyUpdateClipInstrumentState,
  applyUpdateProjectInstrument,
} from "./instrument-commands";
import { applyAddNotes, applyMoveNotes } from "./note-commands";
import {
  applyRepositionNotes,
  applyResizeNotes,
} from "./note-position-commands";
import {
  applySliceNotes,
  applyTransformNotes,
} from "./note-shape-commands";
import {
  applyDeleteNotes,
  applySetNotesEnabled,
} from "./note-state-commands";
import {
  applySetAutoAdvanceEnabled,
  applySetMasterMuted,
  applyUpdateMasterGain,
  applyUpdateMasterTuning,
  applyUpdateProjectTitle,
} from "./project-commands";
import {
  applyAddMeterMarker,
  applyAddScaleMarker,
  applyAddTempoMarker,
  applyAppendMeasures,
  applyDeleteMeterMarker,
  applyDeleteScaleMarker,
  applyDeleteTempoMarker,
  applyInsertMeasure,
  applyMoveMeterMarker,
  applyMoveScaleMarker,
  applyMoveTempoMarker,
  applyRemoveMeasure,
  applySetLoopEnabled,
  applyUpdateLoop,
  applyUpdateMeterMarker,
  applyUpdateScaleMarker,
  applyUpdateTempo,
  applyUpdateTempoMarker,
  applyUpdateTimeSignature,
} from "./transport-commands";
import { assertValidTransaction } from "./transaction";
import type { Transaction } from "./transaction";

export function projectReducer(
  state: ProjectState,
  transaction: Transaction,
): ProjectState {
  assertValidTransaction(transaction);

  let nextState = state;

  for (const command of transaction.commands) {
    try {
      nextState = applyCommand(nextState, command);
    } catch (error: unknown) {
      if (error instanceof DomainValidationError) {
        throw new CommandRejectedError(
          "INVALID_COMMAND",
          error.message,
          command.type,
        );
      }

      throw error;
    }
  }

  if (nextState === state) {
    return state;
  }

  return {
    ...nextState,
    revision: state.revision + 1,
  };
}

function applyCommand(
  state: ProjectState,
  command: PianoRollCommand,
): ProjectState {
  switch (command.type) {
    case "AddClip":
      return applyAddClip(state, command);
    case "DeleteClip":
      return applyDeleteClip(state, command);
    case "CreateClipGroup":
      return applyCreateClipGroup(state, command);
    case "UpdateClipGroup":
      return applyUpdateClipGroup(state, command);
    case "DeleteClipGroup":
      return applyDeleteClipGroup(state, command);
    case "ConcatenateClipGroup":
      return applyConcatenateClipGroup(state, command);
    case "UngroupClipGroup":
      return applyUngroupClipGroup(state, command);
    case "MoveClipHierarchyNode":
      return applyMoveClipHierarchyNode(state, command);
    case "ReorderClips":
      return applyReorderClips(state, command);
    case "RenameClip":
      return applyRenameClip(state, command);
    case "UpdateClip":
      return applyUpdateClip(state, command);
    case "AddProjectInstrument":
      return applyAddProjectInstrument(state, command);
    case "UpdateProjectInstrument":
      return applyUpdateProjectInstrument(state, command);
    case "DeleteProjectInstrument":
      return applyDeleteProjectInstrument(state, command);
    case "ReorderProjectInstruments":
      return applyReorderProjectInstruments(state, command);
    case "SaveInstrumentPreset":
      return applySaveInstrumentPreset(state, command);
    case "DeleteInstrumentPreset":
      return applyDeleteInstrumentPreset(state, command);
    case "UpdateProjectTitle":
      return applyUpdateProjectTitle(state, command);
    case "UpdateMasterGain":
      return applyUpdateMasterGain(state, command);
    case "SetMasterMuted":
      return applySetMasterMuted(state, command);
    case "UpdateMasterTuning":
      return applyUpdateMasterTuning(state, command);
    case "SetAutoAdvanceEnabled":
      return applySetAutoAdvanceEnabled(state, command);
    default:
      return applyActiveClipCommand(state, command);
  }
}

type ActiveClipCommand = Exclude<
  PianoRollCommand,
  | AddClipCommand
  | CreateClipGroupCommand
  | DeleteClipCommand
  | DeleteClipGroupCommand
  | ConcatenateClipGroupCommand
  | UngroupClipGroupCommand
  | MoveClipHierarchyNodeCommand
  | ReorderClipsCommand
  | RenameClipCommand
  | UpdateClipGroupCommand
  | UpdateClipCommand
  | AddProjectInstrumentCommand
  | UpdateProjectInstrumentCommand
  | DeleteProjectInstrumentCommand
  | ReorderProjectInstrumentsCommand
  | SaveInstrumentPresetCommand
  | DeleteInstrumentPresetCommand
  | UpdateProjectTitleCommand
  | SetAutoAdvanceEnabledCommand
  | UpdateMasterGainCommand
  | SetMasterMutedCommand
  | UpdateMasterTuningCommand
>;

function applyActiveClipCommand(
  state: ProjectState,
  command: ActiveClipCommand,
): ProjectState {
  const clip = state.clipsById[command.clipId];

  if (clip === undefined) {
    reject(
      "INVALID_COMMAND",
      `Clip "${command.clipId}" does not exist.`,
      command.type,
    );
  }

  const context: ActiveClipProjectState = {
    projectInstrumentsById: state.projectInstrumentsById,
    instrumentOrder: state.instrumentOrder,
    clock: state.clock,
    timeline: clip.timeline,
    tracksByInstrumentId: clip.tracksByInstrumentId,
    instrumentStatesById: clip.instrumentStatesById,
    transportSettings: clip.transportSettings,
  };
  let nextContext: ActiveClipProjectState;

  switch (command.type) {
    case "UpdateClipInstrumentState":
      nextContext = applyUpdateClipInstrumentState(context, command);
      break;
    case "InsertMeasure":
      nextContext = applyInsertMeasure(context, command);
      break;
    case "RemoveMeasure":
      nextContext = applyRemoveMeasure(context, command);
      break;
    case "AppendMeasures":
      nextContext = applyAppendMeasures(context, command);
      break;
    case "AddNotes":
      nextContext = applyAddNotes(context, command);
      break;
    case "MoveNotes":
      nextContext = applyMoveNotes(context, command);
      break;
    case "RepositionNotes":
      nextContext = applyRepositionNotes(context, command);
      break;
    case "ResizeNotes":
      nextContext = applyResizeNotes(context, command);
      break;
    case "TransformNotes":
      nextContext = applyTransformNotes(context, command);
      break;
    case "SliceNotes":
      nextContext = applySliceNotes(context, command);
      break;
    case "DeleteNotes":
      nextContext = applyDeleteNotes(context, command);
      break;
    case "SetNotesEnabled":
      nextContext = applySetNotesEnabled(context, command);
      break;
    case "UpdateTimeSignature":
      nextContext = applyUpdateTimeSignature(context, command);
      break;
    case "UpdateTempo":
      nextContext = applyUpdateTempo(context, command);
      break;
    case "AddMeterMarker":
      nextContext = applyAddMeterMarker(context, command);
      break;
    case "MoveMeterMarker":
      nextContext = applyMoveMeterMarker(context, command);
      break;
    case "UpdateMeterMarker":
      nextContext = applyUpdateMeterMarker(context, command);
      break;
    case "DeleteMeterMarker":
      nextContext = applyDeleteMeterMarker(context, command);
      break;
    case "AddTempoMarker":
      nextContext = applyAddTempoMarker(context, command);
      break;
    case "MoveTempoMarker":
      nextContext = applyMoveTempoMarker(context, command);
      break;
    case "UpdateTempoMarker":
      nextContext = applyUpdateTempoMarker(context, command);
      break;
    case "DeleteTempoMarker":
      nextContext = applyDeleteTempoMarker(context, command);
      break;
    case "AddScaleMarker":
      nextContext = applyAddScaleMarker(context, command);
      break;
    case "MoveScaleMarker":
      nextContext = applyMoveScaleMarker(context, command);
      break;
    case "UpdateScaleMarker":
      nextContext = applyUpdateScaleMarker(context, command);
      break;
    case "DeleteScaleMarker":
      nextContext = applyDeleteScaleMarker(context, command);
      break;
    case "UpdateLoop":
      nextContext = applyUpdateLoop(context, command);
      break;
    case "SetLoopEnabled":
      nextContext = applySetLoopEnabled(context, command);
      break;
    default:
      return assertNever(command);
  }

  if (nextContext === context) {
    return state;
  }

  const nextClip: Clip = {
    ...clip,
    timeline: nextContext.timeline,
    tracksByInstrumentId: nextContext.tracksByInstrumentId,
    instrumentStatesById: nextContext.instrumentStatesById,
    transportSettings: nextContext.transportSettings,
  };

  return {
    ...state,
    clipsById: {
      ...state.clipsById,
      [clip.id]: nextClip,
    },
  };
}
