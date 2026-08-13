import type {
  Clip,
  ProjectDocument,
} from "../../domain/model";
import {
  getClipTimeSignature,
  getClipDurationTicks,
} from "../../domain/model";
import type {
  MidiExportPlan,
} from "../../project-io/midi/midi-exporter";

/** Maps a named source to the neutral musical plan consumed by SMF I/O. */
export function createMidiExportPlan(
  state: ProjectDocument,
  clip: Clip,
): MidiExportPlan {
  const tracks = state.instrumentOrder.flatMap((instrumentId) => {
    const instrument = state.projectInstrumentsById[instrumentId];
    const track = clip.tracksByInstrumentId[instrumentId];

    if (instrument === undefined || track === undefined) {
      return [];
    }

    return [{
      name: instrument.name,
      notes: Object.values(track.notesById).map((note) => ({
        origin: { sourceId: clip.id, noteId: note.id },
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
    sourceId: clip.id,
    title: state.title,
    ppqn: state.clock.ppqn,
    bpm: state.clock.tempoBpm,
    timeSignature: getClipTimeSignature(clip),
    durationTicks: getClipDurationTicks(clip),
    tracks,
  };
}
