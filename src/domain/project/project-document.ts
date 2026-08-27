import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import type {
  Clip,
} from "../clips/clip";
import type {
  ClipHierarchyNode,
} from "../clips/clip-hierarchy";
import type {
  ClipId,
  InstrumentId,
  PresetId,
} from "../identifiers";
import type {
  InstrumentPreset,
  ProjectInstrument,
} from "../instruments/instrument";
import type {
  MasterBusState,
} from "../master-bus";
import type {
  ProjectClock,
} from "../transport/transport";

export const PROJECT_SCHEMA_VERSION =
  PROJECT_CONSTANTS.schemaVersion;
export const MAXIMUM_PROJECT_TITLE_LENGTH =
  PROJECT_CONSTANTS.maximumProjectTitleLength;

export interface ProjectDocument {
  readonly schemaVersion: number;
  readonly revision: number;
  readonly title: string;
  readonly clock: ProjectClock;
  readonly projectInstrumentsById: Readonly<Record<InstrumentId, ProjectInstrument>>;
  readonly instrumentOrder: readonly InstrumentId[];
  readonly instrumentPresetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly instrumentPresetOrder: readonly PresetId[];
  readonly clipsById: Readonly<Record<ClipId, Clip>>;
  readonly clipHierarchy: readonly ClipHierarchyNode[];
  readonly autoAdvanceEnabled: boolean;
  readonly autoScrollEnabled: boolean;
  readonly masterBus: MasterBusState;
}

export interface ActiveClipSelection {
  readonly activeClipId: ClipId;
}

/** Runtime aggregate. Only `document` participates in musical history. */
export interface EditorSessionState extends ProjectDocument {
  readonly workspace: ActiveClipSelection;
}

export function getActiveClip(state: EditorSessionState): Clip {
  return getClip(state, state.workspace.activeClipId);
}

export function getClip(
  state: Pick<ProjectDocument, "clipsById">,
  clipId: ClipId,
): Clip {
  const clip = state.clipsById[clipId];

  if (clip === undefined) {
    throw new Error(
      `Clip "${clipId}" does not exist.`,
    );
  }

  return clip;
}
