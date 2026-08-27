import { Chord, Midi, Interval } from "@tonaljs/tonal";
import type { Note } from "../domain/notes/note";

export function detectChordsFromNotes(notes: readonly Note[]): string | null {
  if (notes.length === 0) return null;

  // Sort notes by pitch so the lowest note is considered the bass by Tonal
  const sortedNotes = [...notes].sort((a, b) => a.pitch - b.pitch);
  const pitchClasses = new Set<string>();

  for (const note of sortedNotes) {
    pitchClasses.add(Midi.midiToNoteName(note.pitch, { pitchClass: true, sharps: true }));
  }

  if (pitchClasses.size === 2) {
    const classes = Array.from(pitchClasses);
    return Interval.distance(classes[0]!, classes[1]!);
  }

  const detected = Chord.detect(Array.from(pitchClasses));
  if (detected.length === 0) return null;

  return detected.join(" · ");
}
