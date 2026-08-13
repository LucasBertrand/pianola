import {
  APPLICATION_CONSTANTS,
} from "../../config/product-config";
import {
  type Clip,
  createDefaultClipTimeline,
  DEFAULT_MEASURE_COUNT,
} from "../../domain/clips/clip";
import {
  createDefaultInstrumentPresetLibrary,
} from "../../domain/instrument-presets";
import {
  createDefaultMasterBusState,
} from "../../domain/master-bus";
import {
  PROJECT_SCHEMA_VERSION,
  type ProjectState,
} from "../../domain/project/project-document";
import {
  createDefaultProjectClock,
  createDefaultTransportState,
} from "../../domain/transport/transport";

/** Creates an empty project with one clip and no instruments or notes. */
export function createBlankProjectState(): ProjectState {
  const clipId = "clip-main";
  const clock = createDefaultProjectClock();
  const clip: Clip = {
    id: clipId,
    name: "Main Clip",
    timeline: createDefaultClipTimeline(clock, DEFAULT_MEASURE_COUNT),
    tracksByInstrumentId: {},
    instrumentStatesById: {},
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
    clipOrder: [clipId],
    workspace: { activeClipId: clipId },
    masterBus: createDefaultMasterBusState(),
  };
}
