import {
  AUDIO_CONSTANTS,
} from "../config/audio-config";

/**
 * Resolves the audible note level while velocity-sensitive playback is
 * intentionally disabled. The stored velocity remains available for native
 * project and MIDI round-trips.
 */
export function resolveNoteEnvelopePeakLevel(
  _storedVelocity: number,
): number {
  return AUDIO_CONSTANTS.fixedNoteEnvelopePeakLevel;
}
