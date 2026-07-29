import {
  PROJECT_CONSTANTS,
} from "../../config/program-constants";

const PITCH_CLASS_LABELS = Object.freeze([
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const);

const MIDI_NOTE_LABELS = createMidiNoteLabels();

export function getMidiNoteLabel(pitch: number): string {
  if (
    !Number.isInteger(pitch)
    || pitch < PROJECT_CONSTANTS.minimumMidiPitch
    || pitch > PROJECT_CONSTANTS.maximumMidiPitch
  ) {
    return "";
  }

  return MIDI_NOTE_LABELS[pitch] ?? "";
}

function createMidiNoteLabels(): readonly string[] {
  const labels: string[] = [];

  for (
    let pitch = PROJECT_CONSTANTS.minimumMidiPitch;
    pitch <= PROJECT_CONSTANTS.maximumMidiPitch;
    pitch += 1
  ) {
    const pitchClass = pitch % 12;
    const octave = Math.floor(pitch / 12) - 1;

    labels[pitch] =
      `${PITCH_CLASS_LABELS[pitchClass] ?? "?"}${octave}`;
  }

  return Object.freeze(labels);
}
