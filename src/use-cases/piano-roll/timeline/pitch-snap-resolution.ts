import type {
  TimeMap,
} from "../../../domain/transport/time-map";
import {
  getScaleMarkerAtTick,
} from "../../../domain/transport/time-map";
import type {
  PitchSnapSettings,
} from "../../../domain/music-theory/pitch-snap";

export function resolvePitchSnapSettings(
  timeMap: TimeMap,
  globalSettings: PitchSnapSettings,
  tick: number,
): PitchSnapSettings {

  const scaleMarker = getScaleMarkerAtTick(timeMap, tick);
  return {
    ...globalSettings,
    rootNote: scaleMarker.rootNote,
    patternId: scaleMarker.patternId,
    patternType: scaleMarker.patternType,
  };
}
