import {
  APPLICATION_CONSTANTS,
} from "../../config/product-config";
import { PROJECT_CONSTANTS } from "../../config/domain-limits";
import {
  type Clip,
  createDefaultClipTimeline,
  DEFAULT_CLIP_BYPASS_ENABLED,
  DEFAULT_CLIP_COLOR,
  DEFAULT_MEASURE_COUNT,
} from "../../domain/clips/clip";
import {
  createFlatClipHierarchy,
} from "../../domain/clips/clip-hierarchy";
import {
  createDefaultInstrumentPresetLibrary,
} from "../../domain/instrument-presets";
import {
  createDefaultMasterBusState,
} from "../../domain/master-bus";
import {
  PROJECT_SCHEMA_VERSION,
  type EditorSessionState,
} from "../../domain/project/project-document";
import {
  createDefaultProjectClock,
  createDefaultTransportState,
} from "../../domain/transport/transport";

/** Creates an empty project with one clip and no instruments or notes. */
export function createBlankEditorSessionState(): EditorSessionState {
  const clipId = "clip-main";
  const clock = createDefaultProjectClock();
  const clip: Clip = {
    id: clipId,
    name: "Main Clip",
    color: DEFAULT_CLIP_COLOR,
    bypassEnabled: DEFAULT_CLIP_BYPASS_ENABLED,
    timeline: createDefaultClipTimeline(clock, DEFAULT_MEASURE_COUNT),
    tracksByInstrumentId: {},
    transportSettings: createDefaultTransportState(),
  };
  const presetLibrary = createDefaultInstrumentPresetLibrary();

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: 0,
    title: APPLICATION_CONSTANTS.defaultProjectTitle,
    clock,
    projectInstrumentsById: {},
    instrumentOrder: [],
    instrumentPresetsById: presetLibrary.instrumentPresetsById,
    instrumentPresetOrder: presetLibrary.instrumentPresetOrder,
    clipsById: { [clipId]: clip },
    clipHierarchy: createFlatClipHierarchy([clipId]),
    autoAdvanceEnabled: PROJECT_CONSTANTS.defaultAutoAdvanceEnabled,
    autoScrollEnabled: PROJECT_CONSTANTS.defaultAutoScrollEnabled,
    workspace: { activeClipId: clipId },
    masterBus: createDefaultMasterBusState(),
  };
}
