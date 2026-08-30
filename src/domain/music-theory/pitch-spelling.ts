import { Chord, Note, Scale } from "musictheoryjs";
import type { PitchSnapSettings } from "./pitch-snap";

export function spellPitchClass(
  pitch: number,
  settings: PitchSnapSettings,
): string {
  if (settings.rootNote === "none") {
    return Note.fromMidi(pitch, "flat").toString({
      octave: false,
      unicodeAccidentals: true,
    });
  }

  const pitchClass = ((pitch % 12) + 12) % 12;
  const patternNotes = settings.patternType === "scale"
    ? Scale.from(`${settings.rootNote}4`, settings.patternId).notes
    : Chord.from(`${settings.rootNote}${settings.patternId}`).notes;
  const contextualSpelling = patternNotes.find((note) => note.pitchClass === pitchClass);

  return (contextualSpelling ?? Note.fromMidi(pitch, "flat")).toString({
    octave: false,
    unicodeAccidentals: true,
  });
}

/** Formats a persisted pitch class for display without changing its stored form. */
export function formatPitchClass(noteName: string): string {
  if (noteName === "none") return noteName;
  return Note.from(noteName).toString({
    octave: false,
    unicodeAccidentals: true,
  });
}

/** Spells a MIDI pitch in its contextual pattern and returns a Unicode label. */
export function spellMidiNote(
  pitch: number,
  settings: PitchSnapSettings,
): string {
  const pitchClass = spellPitchClass(pitch, settings);
  const octave = Math.floor(pitch / 12) - 1;
  const spelled = Note.from(`${pitchClass}${octave}`);
  const adjusted = spelled.withOctave(
    octave + Math.round((pitch - spelled.midi) / 12),
  );
  return adjusted.toString({ unicodeAccidentals: true });
}
