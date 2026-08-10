import {
  EDITOR_CONSTANTS,
  VIEWPORT_CONSTANTS,
} from "../../config/program-constants";
import type {
  ClipId,
  ProjectState,
} from "../../domain/model";
import {
  DEFAULT_PITCH_SNAP_SETTINGS,
} from "../../music/pitch-snap";
import {
  NativeProjectFileError,
  type NativeEditorState,
  type NativeClipEditorState,
  type NativeProjectFileMetadata,
} from "../../persistence/native-project-file";
import {
  DEFAULT_GRID_SETTINGS,
} from "../../ui/rendering/grid-settings";
import {
  INITIAL_MAX_VISIBLE_PITCH,
  INITIAL_PITCH_HEIGHT,
} from "../editor-runtime";

export function createNativeProjectFileMetadata():
NativeProjectFileMetadata {
  const now = new Date().toISOString();
  const documentId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    documentId,
    createdAt: now,
    savedAt: now,
  };
}

export function createDefaultNativeEditorState(
  projectState: ProjectState,
): NativeEditorState {
  const clipStatesById: Record<ClipId, NativeClipEditorState> = {};
  const defaultViewport = {
    zoomX: VIEWPORT_CONSTANTS.initialHorizontalZoom,
    zoomY: VIEWPORT_CONSTANTS.initialVerticalZoom,
    scrollX: 0,
    scrollY:
      (
        VIEWPORT_CONSTANTS.maximumMidiPitch
        - INITIAL_MAX_VISIBLE_PITCH
      ) * INITIAL_PITCH_HEIGHT,
  };

  for (const clipId of projectState.clipOrder) {
    const clip = projectState.clipsById[clipId];

    if (clip !== undefined) {
      clipStatesById[clipId] = {
        playheadTick: clip.transportSettings.anchorTick,
        pitchSnapSettings: DEFAULT_PITCH_SNAP_SETTINGS,
        gridSettings: DEFAULT_GRID_SETTINGS,
        viewport: defaultViewport,
      };
    }
  }

  return {
    selectedVoiceId: projectState.voiceOrder[0] ?? null,
    selectionMode: "replace",
    noteColorMode: EDITOR_CONSTANTS.defaultNoteColorMode,
    pitchPreviewEnabled:
      EDITOR_CONSTANTS.defaultPitchPreviewEnabled,
    clipStatesById,
  };
}

export function formatNativeProjectError(
  prefix: string,
  error: unknown,
): string {
  if (error instanceof NativeProjectFileError) {
    const location =
      error.path === "$" ? "" : ` Location: ${error.path}.`;

    return `${prefix} ${error.message}${location}`;
  }

  if (error instanceof Error) {
    return `${prefix} ${error.message}`;
  }

  return prefix;
}
