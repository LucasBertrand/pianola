import {
  PROJECT_CONSTANTS,
} from "../../../config/domain-limits";

import {
  DEFAULT_PITCH_SNAP_SETTINGS,
  type PitchSnapSettings,
} from "../../../music/pitch-snap";
import { Note, Scale, Chord } from "@tonaljs/tonal";

export function getMidiNoteLabel(
  pitch: number,
  settings: PitchSnapSettings = DEFAULT_PITCH_SNAP_SETTINGS,
): string {
  if (
    !Number.isInteger(pitch)
    || pitch < PROJECT_CONSTANTS.minimumMidiPitch
    || pitch > PROJECT_CONSTANTS.maximumMidiPitch
  ) {
    return "";
  }

  const pitchClass = pitch % 12;
  const rootLabel = settings.rootNote;
  const patternNotes = settings.patternType === "scale"
    ? Scale.get(`${rootLabel} ${settings.patternId}`).notes
    : Chord.get(`${rootLabel} ${settings.patternId}`).notes;

  const matchedNote = patternNotes.find((n) => Note.chroma(n) === pitchClass);

  if (matchedNote) {
    // We need to attach the correct octave. 
    // Tonal's Note.transpose or finding the correct octave so that midi matches.
    // Let's use Note.fromMidi to get a default, then Note.enharmonic to match the letter.
    // Or simpler: Note.pitchClass(matchedNote) + octave.
    // But wait, Cb4 is midi 59. If pitch is 59, and matchedNote is "Cb".
    // Math.floor(59/12) - 1 = 3. Cb3 is 47.
    // The correct octave is the octave of the C natural below it.
    // Midi pitch of C natural is pitch - pitchClass.
    const octave = Math.floor(pitch / 12) - 1;
    
    // We can reconstruct the midi by checking Note.midi(`${matchedNote}${octave}`)
    let noteOctave = octave;
    if (Note.midi(`${matchedNote}${octave}`) === pitch - 12) {
      noteOctave = octave + 1;
    } else if (Note.midi(`${matchedNote}${octave}`) === pitch + 12) {
      noteOctave = octave - 1;
    } else if (Note.midi(`${matchedNote}${octave}`) !== pitch) {
        // If it's still not matching, maybe it's double flat/sharp crossing C?
        if (Note.midi(`${matchedNote}${octave + 1}`) === pitch) {
            noteOctave = octave + 1;
        } else if (Note.midi(`${matchedNote}${octave - 1}`) === pitch) {
            noteOctave = octave - 1;
        }
    }
    
    return `${matchedNote}${noteOctave}`;
  }

  // Fallback
  return Note.fromMidi(pitch) || "";
}

export function getPitchLabelContextKey(
  settings: PitchSnapSettings,
): string {
  return `${settings.rootNote}:${settings.patternType}:${settings.patternId}`;
}
