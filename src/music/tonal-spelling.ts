import { Chord, Midi, Note, Scale } from "@tonaljs/tonal";
import type { PitchSnapSettings } from "./pitch-snap";

export function spellPitchClass(
  pitch: number,
  settings: PitchSnapSettings,
): string {
  const pitchClass = ((pitch % 12) + 12) % 12;
  const patternNotes = settings.patternType === "scale"
    ? Scale.get(`${settings.rootNote} ${settings.patternId}`).notes
    : Chord.get(`${settings.rootNote} ${settings.patternId}`).notes;
  const contextualSpelling = patternNotes.find(
    (noteName) => Note.chroma(noteName) === pitchClass,
  );

  if (contextualSpelling !== undefined) {
    return contextualSpelling;
  }

  return Midi.midiToNoteName(pitch, {
    pitchClass: true,
  });
}
