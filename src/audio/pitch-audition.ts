import {
  AUDIO_CONSTANTS,
} from "../config/audio-config";
import type {
  InstrumentId,
} from "../domain/identifiers";
import type {
  AudioEnginePort,
  PlaybackSnapshot,
} from "./playback-model";
import {
  findPlaybackInstrument,
} from "./playback-transport-query";

/** Resumes audio and schedules one short, non-document audition note. */
export async function schedulePitchAudition(
  engine: AudioEnginePort,
  snapshot: PlaybackSnapshot,
  instrumentId: InstrumentId,
  pitch: number,
  occurrenceId: string,
  generation: number,
  assertUsable: () => void,
): Promise<void> {
  const instrument = findPlaybackInstrument(snapshot, instrumentId);

  if (instrument === undefined) {
    throw new Error(
      `Project instrument "${instrumentId}" is unavailable for audition.`,
    );
  }

  await engine.resume();
  assertUsable();
  const startAudioTimeSeconds = engine.currentTimeSeconds;

  engine.scheduleNote({
    occurrenceId,
    generation,
    instrument,
    pitch,
    velocity: AUDIO_CONSTANTS.auditionNoteVelocity,
    startAudioTimeSeconds,
    endAudioTimeSeconds:
      startAudioTimeSeconds + AUDIO_CONSTANTS.auditionNoteDurationSeconds,
  });
}
