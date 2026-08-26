import {
  getClipPlaybackOrder,
} from "../../domain/clips/clip-hierarchy";
import type {
  ClipId,
  InstrumentId,
} from "../../domain/identifiers";
import type {
  ProjectDocument,
  ProjectState,
} from "../../domain/project/project-document";
import {
  DEFAULT_GRID_SETTINGS,
} from "../../editor/model/grid-settings";
import type {
  ClipEditorRuntimeState,
  EditorRuntime,
} from "../../editor/runtime/editor-runtime";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
} from "../../music/pitch-snap";
import type {
  ProjectClipWorkspaceState,
  ProjectWorkspaceState,
  StoredProject,
} from "../../persistence/project-persistence-model";

export function createDefaultProjectWorkspace(
  document: ProjectDocument,
): ProjectWorkspaceState {
  const clipOrder = getClipPlaybackOrder(document.clipHierarchy);
  const activeClipId = clipOrder[0];

  if (activeClipId === undefined) {
    throw new Error("A project must contain at least one clip.");
  }

  const clipStatesById: Record<ClipId, ProjectClipWorkspaceState> = {};

  for (const clipId of clipOrder) {
    const clip = document.clipsById[clipId];

    if (clip !== undefined) {
      clipStatesById[clipId] = {
        pitchSnapSettings: DEFAULT_PITCH_SNAP_SETTINGS,
        gridSettings: DEFAULT_GRID_SETTINGS,
      };
    }
  }

  return {
    activeClipId,
    selectedInstrumentId: document.instrumentOrder[0] ?? null,
    clipStatesById,
  };
}

export function createProjectState(
  document: ProjectDocument,
  workspace: ProjectWorkspaceState,
): ProjectState {
  return {
    ...document,
    workspace: { activeClipId: workspace.activeClipId },
  };
}

export function createStoredProjectState(
  stored: StoredProject,
): ProjectState {
  return createProjectState(stored.document, stored.workspace);
}

export function captureProjectWorkspace(
  runtime: EditorRuntime,
  selectedInstrumentId: InstrumentId | null,
): ProjectWorkspaceState {
  const document = runtime.projectStore.getState();
  const runtimeStates = runtime.captureClipEditorStates();
  const clipStatesById: Record<ClipId, ProjectClipWorkspaceState> = {};

  for (const clipId of getClipPlaybackOrder(document.clipHierarchy)) {
    const clip = document.clipsById[clipId];
    const state = runtimeStates[clipId];

    if (clip !== undefined && state !== undefined) {
      clipStatesById[clipId] = {
        pitchSnapSettings: state.pitchSnapSettings,
        gridSettings: state.gridSettings,
      };
    }
  }

  return {
    activeClipId: document.workspace.activeClipId,
    selectedInstrumentId:
      selectedInstrumentId !== null
      && document.projectInstrumentsById[selectedInstrumentId] !== undefined
        ? selectedInstrumentId
        : null,
    clipStatesById,
  };
}

export function restoreProjectWorkspace(
  runtime: EditorRuntime,
  workspace: ProjectWorkspaceState,
): void {
  const states: Record<ClipId, ClipEditorRuntimeState> = {};

  for (const [clipId, state] of Object.entries(
    workspace.clipStatesById,
  )) {
    states[clipId] = {
      pitchSnapSettings: state.pitchSnapSettings,
      gridSettings: state.gridSettings,
    };
  }

  runtime.restoreClipEditorStates(states);
}

