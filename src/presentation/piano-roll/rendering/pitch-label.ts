import {
  PROJECT_CONSTANTS,
} from "../../../domain/project/project-constants";

import {
  DEFAULT_PITCH_SNAP_SETTINGS,
  type PitchSnapSettings,
} from "../../../domain/music-theory/pitch-snap";
import {
  spellMidiNote,
} from "../../../domain/music-theory/pitch-spelling";

export interface MidiNoteLabelSegment {
  readonly startTick: number;
  readonly endTick: number;
  readonly label: string;
}

export interface PitchContextBoundary {
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

  return spellMidiNote(pitch, settings);
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
  pitchContextBoundaries: readonly PitchContextBoundary[],
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

  for (const boundary of pitchContextBoundaries) {
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
