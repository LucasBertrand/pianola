import type {
  ClipId,
  InstrumentId,
  ProjectState,
} from "../../domain/model";
import type { ViewportState } from "../../editor/geometry/converter";
import type { GridSettings } from "../../editor/model/grid-settings";
import type { NoteColorMode } from "../../editor/model/note-color-mode";
import type { PitchSnapSettings } from "../../music/pitch-snap";
import {
  NATIVE_PROJECT_FILE_FORMAT,
  NATIVE_PROJECT_FILE_VERSION,
} from "./version";

export interface NativeProjectFileMetadata {
  readonly documentId: string;
  readonly createdAt: string;
  readonly savedAt: string;
}

export type NativeJsonPrimitive = string | number | boolean | null;
export type NativeJsonValue =
  | NativeJsonPrimitive
  | NativeJsonObject
  | readonly NativeJsonValue[];

/** Stored v1 object; deliberately independent from the domain model. */
export interface NativeJsonObject {
  readonly [key: string]: NativeJsonValue;
}

export interface NativeProjectFile {
  readonly format: typeof NATIVE_PROJECT_FILE_FORMAT;
  readonly formatVersion: typeof NATIVE_PROJECT_FILE_VERSION;
  readonly metadata: NativeProjectFileMetadata;
  readonly project: NativeJsonObject;
  readonly editor: NativeJsonObject;
}

export type NativeViewportState = Pick<
  ViewportState,
  "zoomX" | "zoomY" | "scrollX" | "scrollY"
>;

export type NativeSelectionMode = "replace" | "add" | "subtract";

export interface NativeClipEditorState {
  readonly playheadTick: number;
  readonly pitchSnapSettings: PitchSnapSettings;
  readonly gridSettings: GridSettings;
  readonly viewport: NativeViewportState;
}

/** Durable editor preferences that define the user's project workspace. */
export interface NativeEditorState {
  readonly activeClipId: ClipId;
  readonly selectedInstrumentId: InstrumentId | null;
  readonly selectionMode: NativeSelectionMode;
  readonly noteColorMode: NoteColorMode;
  readonly pitchPreviewEnabled: boolean;
  readonly clipStatesById: Readonly<
    Record<ClipId, NativeClipEditorState>
  >;
}

export interface LoadedNativeProject {
  readonly metadata: NativeProjectFileMetadata;
  readonly projectState: ProjectState;
  readonly editorState: NativeEditorState;
}
