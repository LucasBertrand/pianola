import {
  type Clip,
} from "../../domain/clips/clip";
import {
  getClipPlaybackOrder,
} from "../../domain/clips/clip-hierarchy";
import {
  type ClipId,
} from "../../domain/identifiers";
import {
  type EditorSessionState,
} from "../../domain/project/project-document";
import {
  PROJECT_SCHEMA_VERSION,
} from "../../domain/project/project-document";
import { parseNativeProjectFile } from "./parse-native-project";
import type {
  NativeEditorState,
  NativeJsonObject,
  NativeJsonValue,
  NativeProjectFile,
  NativeProjectFileMetadata,
} from "./native-project-schema";
import {
  NATIVE_PROJECT_FILE_FORMAT,
  NATIVE_PROJECT_FILE_VERSION,
} from "./version";

export function serializeNativeProjectFile(
  state: EditorSessionState,
  metadata: NativeProjectFileMetadata,
  editorState: NativeEditorState,
): string {
  const clipsById: Record<ClipId, Clip> = {};

  for (const clipId of getClipPlaybackOrder(state.clipHierarchy)) {
    const clip = state.clipsById[clipId];

    if (clip !== undefined) {
      clipsById[clipId] = {
        ...clip,
      };
    }
  }

  const document: NativeProjectFile = {
    format: NATIVE_PROJECT_FILE_FORMAT,
    formatVersion: NATIVE_PROJECT_FILE_VERSION,
    metadata,
    project: toNativeJsonObject({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      title: state.title,
      clock: state.clock,
      projectInstrumentsById: state.projectInstrumentsById,
      instrumentOrder: state.instrumentOrder,
      instrumentPresetsById: state.instrumentPresetsById,
      instrumentPresetOrder: state.instrumentPresetOrder,
      clipsById,
      clipHierarchy: state.clipHierarchy,
      autoAdvanceEnabled: state.autoAdvanceEnabled,
      autoScrollEnabled: state.autoScrollEnabled,
      masterBus: state.masterBus,
    }),
    editor: toNativeJsonObject({
      ...editorState,
      activeClipId: state.workspace.activeClipId,
    }),
  };
  const serialized = JSON.stringify(document, null, 2);

  parseNativeProjectFile(serialized);
  return serialized;
}

function toNativeJsonObject(value: object): NativeJsonObject {
  return toNativeJsonValue(value) as NativeJsonObject;
}

function toNativeJsonValue(value: unknown): NativeJsonValue {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Native project data must contain only finite numbers.");
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toNativeJsonValue);
  }

  if (typeof value === "object") {
    const result: Record<string, NativeJsonValue> = {};

    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) {
        throw new TypeError(`Native project field "${key}" cannot be undefined.`);
      }

      result[key] = toNativeJsonValue(entry);
    }

    return result;
  }

  throw new TypeError("Native project data contains a non-JSON value.");
}
