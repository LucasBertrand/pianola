import type {
  Clip,
  ProjectState,
} from "../../domain/model";
import {
  getClipDurationTicks,
} from "../../domain/model";
import type {
  MidiExportProjection,
} from "../../project-io/midi/midi-exporter";

/** Maps domain state to the neutral musical projection consumed by SMF I/O. */
export function createMidiExportProjection(
  state: ProjectState,
  clip: Clip,
): MidiExportProjection {
  const tracks = state.instrumentOrder.flatMap((instrumentId) => {
    const instrument = state.projectInstrumentsById[instrumentId];
    const track = clip.tracksByInstrumentId[instrumentId];

    if (instrument === undefined || track === undefined) {
      return [];
    }

    return [{
      name: instrument.name,
      notes: Object.values(track.notesById).map((note) => ({
        id: note.id,
        pitch: note.pitch,
        velocity: note.velocity,
        startTick: note.startTick,
        durationTicks: note.durationTicks,
        enabled: note.enabled,
      })),
    }];
  });

  return {
    title: state.title,
    ppqn: clip.transportSettings.ppqn,
    bpm: clip.transportSettings.bpm,
    timeSignature: clip.transportSettings.timeSignature,
    durationTicks: getClipDurationTicks(clip),
    tracks,
  };
}
