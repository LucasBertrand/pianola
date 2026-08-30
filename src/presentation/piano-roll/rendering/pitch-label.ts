import {
  PROJECT_CONSTANTS,
} from "../../../domain/project/project-constants";

import {
  DEFAULT_PITCH_SNAP_SETTINGS,
  type PitchSnapSettings,
} from "../../../domain/music-theory/pitch-snap";
import {
  spellPitchClass,
} from "../../../domain/music-theory/tonal-spelling";
import { formatMusicAccidentals } from "../../../domain/music-theory/music-notation";
import { Note } from "@tonaljs/tonal";

export interface MidiNoteLabelSegment {
  readonly startTick: number;
  readonly endTick: number;
  readonly label: string;
}

export interface TonalBoundary {
  readonly startTick: number;
}

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

  const matchedNote = spellPitchClass(pitch, settings);

  if (matchedNote !== "") {
    const octave = Math.floor(pitch / 12) - 1;

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

    return formatMusicAccidentals(`${matchedNote}${noteOctave}`);
  }

  // Fallback
  return formatMusicAccidentals(Note.fromMidi(pitch) || "");
}

export function getPitchLabelContextKey(
  settings: PitchSnapSettings,
): string {
  return `${settings.rootNote}:${settings.patternType}:${settings.patternId}`;
}

export function getMidiNoteLabelSegments(
  pitch: number,
  startTick: number,
  endTick: number,
  tonalBoundaries: readonly TonalBoundary[],
  getSettingsAtTick: (tick: number) => PitchSnapSettings,
): readonly MidiNoteLabelSegment[] {
  const changes: Array<{
    readonly startTick: number;
    readonly label: string;
  }> = [];
  let currentLabel = getMidiNoteLabel(
    pitch,
    getSettingsAtTick(startTick),
  );

  changes.push({ startTick, label: currentLabel });

  for (const boundary of tonalBoundaries) {
    if (boundary.startTick <= startTick) {
      continue;
    }

    if (boundary.startTick >= endTick) {
      break;
    }

    const nextLabel = getMidiNoteLabel(
      pitch,
      getSettingsAtTick(boundary.startTick),
    );

    if (nextLabel === currentLabel) {
      continue;
    }

    changes.push({
      startTick: boundary.startTick,
      label: nextLabel,
    });
    currentLabel = nextLabel;
  }

  return changes.map((change, index) => ({
    ...change,
    endTick: changes[index + 1]?.startTick ?? endTick,
  }));
}
