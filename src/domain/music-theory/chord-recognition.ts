import {
  Note as MusicTheoryNote,
  detectChord,
  intervalName,
  simplifyInterval,
} from "musictheoryjs";
import type { Note } from "../notes/note";

export type NotePitchClassSpeller = (note: Note) => string;

export function detectChordsFromNotes(
  notes: readonly Note[],
  spellNote: NotePitchClassSpeller = spellNoteWithMusicTheoryDefault,
): string | null {
  if (notes.length === 0) return null;

  const sortedNotes = [...notes].sort((a, b) => a.pitch - b.pitch);
  const pitchClassesByChroma = new Map<number, MusicTheoryNote>();
  for (const note of sortedNotes) {
    const chroma = ((note.pitch % 12) + 12) % 12;
    if (!pitchClassesByChroma.has(chroma)) {
      pitchClassesByChroma.set(chroma, spellMidiNote(note, spellNote(note)));
    }
  }

  const spelledNotes = Array.from(pitchClassesByChroma.values());
  if (spelledNotes.length === 2) {
    return intervalName(
      simplifyInterval(spelledNotes[0]!.intervalTo(spelledNotes[1]!)),
    );
  }

  return detectChord(spelledNotes)?.toString() ?? null;
}

function spellNoteWithMusicTheoryDefault(note: Note): string {
  return MusicTheoryNote.fromMidi(note.pitch, "flat").toString({
    octave: false,
    unicodeAccidentals: true,
  });
}

function spellMidiNote(note: Note, pitchClass: string): MusicTheoryNote {
  const octave = Math.floor(note.pitch / 12) - 1;
  const candidate = MusicTheoryNote.from(`${pitchClass}${octave}`);
  return candidate.withOctave(
    octave + Math.round((note.pitch - candidate.midi) / 12),
  );
}
