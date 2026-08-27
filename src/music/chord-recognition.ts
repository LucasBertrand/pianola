import { Chord, Midi, Interval } from "@tonaljs/tonal";
import type { Note } from "../domain/notes/note";

export type NotePitchClassSpeller = (note: Note) => string;

export function detectChordsFromNotes(
  notes: readonly Note[],
  spellNote: NotePitchClassSpeller = spellNoteWithTonalDefault,
): string | null {
  if (notes.length === 0) return null;

  // Sort notes by pitch so the lowest note is considered the bass by Tonal
  const sortedNotes = [...notes].sort((a, b) => a.pitch - b.pitch);
  const pitchClassesByChroma = new Map<number, string>();

  for (const note of sortedNotes) {
    const chroma = ((note.pitch % 12) + 12) % 12;
    if (!pitchClassesByChroma.has(chroma)) {
      pitchClassesByChroma.set(chroma, spellNote(note));
    }
  }

  const pitchClasses = Array.from(pitchClassesByChroma.values());

  if (pitchClasses.length === 2) {
    const classes = pitchClasses;
    return Interval.distance(classes[0]!, classes[1]!);
  }

  const detected = Chord.detect(pitchClasses);
  if (detected.length === 0) return null;

  return detected.join(" · ");
}

function spellNoteWithTonalDefault(note: Note): string {
  return Midi.midiToNoteName(note.pitch, {
    pitchClass: true,
  });
}
