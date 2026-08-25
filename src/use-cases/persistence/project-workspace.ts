import {
  VIEWPORT_CONSTANTS,
} from "../../config/editor-config";
import {
  getClipDurationTicks,
} from "../../domain/clips/clip";
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
import type {
  ViewportState,
} from "../../editor/geometry/converter";
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
        firstVisibleTick: 0,
        highestVisiblePitch:
          VIEWPORT_CONSTANTS.initialMaximumVisiblePitch,
        horizontalZoom:
          VIEWPORT_CONSTANTS.initialHorizontalZoom,
        verticalZoom: VIEWPORT_CONSTANTS.initialVerticalZoom,
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
      clipStatesById[clipId] = toPersistentClipState(
        state,
        getClipDurationTicks(clip),
      );
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
  const viewportBase = runtime.viewport.get();
  const states: Record<ClipId, ClipEditorRuntimeState> = {};

  for (const [clipId, state] of Object.entries(
    workspace.clipStatesById,
  )) {
    states[clipId] = {
      pitchSnapSettings: state.pitchSnapSettings,
      gridSettings: state.gridSettings,
      viewport: toRuntimeViewport(state, viewportBase),
    };
  }

  runtime.restoreClipEditorStates(states);
}

function toPersistentClipState(
  state: ClipEditorRuntimeState,
  durationTicks: number,
): ProjectClipWorkspaceState {
  const viewport = state.viewport;
  const firstVisibleTick = Math.min(
    durationTicks,
    Math.max(
      0,
      viewport.scrollX * viewport.ticksPerPixel / viewport.zoomX,
    ),
  );
  const highestVisiblePitch = Math.min(
    VIEWPORT_CONSTANTS.highestDisplayedMidiPitch,
    Math.max(
      VIEWPORT_CONSTANTS.lowestDisplayedMidiPitch,
      VIEWPORT_CONSTANTS.highestDisplayedMidiPitch
        - viewport.scrollY / (viewport.pitchHeight * viewport.zoomY),
    ),
  );

  return {
    firstVisibleTick,
    highestVisiblePitch,
    horizontalZoom: viewport.zoomX,
    verticalZoom: viewport.zoomY,
    pitchSnapSettings: state.pitchSnapSettings,
    gridSettings: state.gridSettings,
  };
}

function toRuntimeViewport(
  state: ProjectClipWorkspaceState,
  base: ViewportState,
): ViewportState {
  return {
    ...base,
    zoomX: state.horizontalZoom,
    zoomY: state.verticalZoom,
    scrollX:
      state.firstVisibleTick * state.horizontalZoom / base.ticksPerPixel,
    scrollY:
      (
        VIEWPORT_CONSTANTS.highestDisplayedMidiPitch
        - state.highestVisiblePitch
      ) * base.pitchHeight * state.verticalZoom,
  };
}
