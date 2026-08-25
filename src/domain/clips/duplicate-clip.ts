import type {
  Clip,
  Track,
} from "./clip";
import type {
  ClipId,
  InstrumentId,
} from "../identifiers";

/** Creates an independent clip value while preserving its musical contents. */
export function duplicateClipValue(
  source: Clip,
  id: ClipId,
  name: string,
): Clip {
  return {
    ...source,
    id,
    name,
    tracksByInstrumentId: cloneTracks(source.tracksByInstrumentId),
    transportSettings: {
      ...source.transportSettings,
      loop: { ...source.transportSettings.loop },
    },
    timeline: {
      ...source.timeline,
      timeMap: {
        meterMarkers: source.timeline.timeMap.meterMarkers.map((marker) => ({
          startTick: marker.startTick,
          timeSignature: marker.timeSignature.beatGroups === undefined
            ? {
                numerator: marker.timeSignature.numerator,
                denominator: marker.timeSignature.denominator,
              }
            : {
                numerator: marker.timeSignature.numerator,
                denominator: marker.timeSignature.denominator,
                beatGroups: [...marker.timeSignature.beatGroups],
              },
        })),
        tempoMarkers: source.timeline.timeMap.tempoMarkers.map(
          (marker) => ({ ...marker }),
        ),
        scaleMarkers: source.timeline.timeMap.scaleMarkers.map(
          (marker) => ({ ...marker }),
        ),
      },
    },
  };
}

function cloneTracks(
  sourceTracks: Readonly<Record<InstrumentId, Track>>,
): Record<InstrumentId, Track> {
  const tracks: Record<InstrumentId, Track> = {};

  for (const [instrumentId, track] of Object.entries(sourceTracks)) {
    tracks[instrumentId] = {
      instrumentId,
      notesById: { ...track.notesById },
    };
  }

  return tracks;
}
