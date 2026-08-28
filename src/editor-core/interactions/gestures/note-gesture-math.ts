import {
  type Note,
} from "../../../domain/notes/note";
import {
  snapPitchToTonalPattern,
  type PitchSnapSettings,
} from "../../../domain/music-theory/pitch-snap";
import type {
  ResizeEdge,
} from "./gesture-draft";

export interface NoteSelectionBounds {
  readonly minimumStartTick: number;
  readonly maximumEndTick: number;
  readonly minimumPitch: number;
  readonly maximumPitch: number;
}

export interface ResizeDeltaBounds {
  readonly minimumDeltaTicks: number;
  readonly maximumDeltaTicks: number;
}

export interface RepositionedPitch {
  readonly destinationTick: number;
  readonly pitch: number;
  readonly snapSettings: PitchSnapSettings;
}

export function quantizeTick(
  tick: number,
  resolutionTicks: number,
): number {
  if (
    !Number.isFinite(tick)
    || !Number.isSafeInteger(resolutionTicks)
    || resolutionTicks <= 0
  ) {
    return tick;
  }

  return Math.round(tick / resolutionTicks) * resolutionTicks;
}

export function snapTickToCellStart(
  tick: number,
  resolutionTicks: number,
): number {
  if (
    !Number.isFinite(tick)
    || !Number.isSafeInteger(resolutionTicks)
    || resolutionTicks <= 0
  ) {
    return tick;
  }

  return Math.floor(tick / resolutionTicks) * resolutionTicks;
}

export function measureNoteSelection(
  notes: readonly Note[],
): NoteSelectionBounds {
  let minimumStartTick = Number.POSITIVE_INFINITY;
  let maximumEndTick = 0;
  let minimumPitch = 127;
  let maximumPitch = 0;

  for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    if (note.startTick < minimumStartTick) {
      minimumStartTick = note.startTick;
    }

    const endTick = note.startTick + note.durationTicks;

    if (endTick > maximumEndTick) {
      maximumEndTick = endTick;
    }

    if (note.pitch < minimumPitch) {
      minimumPitch = note.pitch;
    }

    if (note.pitch > maximumPitch) {
      maximumPitch = note.pitch;
    }
  }

  return {
    minimumStartTick: Number.isFinite(minimumStartTick)
      ? minimumStartTick
      : 0,
    maximumEndTick,
    minimumPitch,
    maximumPitch,
  };
}

export function calculateResizeDeltaBounds(
  notes: readonly Note[],
  edge: ResizeEdge,
  gridResolutionTicks: number,
  totalTicks: number,
): ResizeDeltaBounds {
  let minimumDeltaTicks = Number.NEGATIVE_INFINITY;
  let maximumDeltaTicks = Number.POSITIVE_INFINITY;

  for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    const minimumDuration = Math.min(
      gridResolutionTicks,
      note.durationTicks,
    );

    if (edge === "start") {
      minimumDeltaTicks = Math.max(
        minimumDeltaTicks,
        -note.startTick,
      );
      maximumDeltaTicks = Math.min(
        maximumDeltaTicks,
        note.durationTicks - minimumDuration,
      );
    } else {
      minimumDeltaTicks = Math.max(
        minimumDeltaTicks,
        minimumDuration - note.durationTicks,
      );
      maximumDeltaTicks = Math.min(
        maximumDeltaTicks,
        totalTicks - note.startTick - note.durationTicks,
      );
    }
  }

  return {
    minimumDeltaTicks,
    maximumDeltaTicks,
  };
}

export function buildRepositionedNotes(
  notes: readonly Note[],
  deltaTicks: number,
  deltaPitch: number,
  getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
): readonly Note[] {
  const repositionedNotes: Note[] = [];

  for (const note of notes) {
    const repositionedPitch = resolveRepositionedPitch(
      note.pitch,
      note.startTick,
      deltaTicks,
      deltaPitch,
      getSnapSettingsAtTick,
    );

    repositionedNotes.push({
      ...note,
      startTick: repositionedPitch.destinationTick,
      pitch: repositionedPitch.pitch,
    });
  }

  return repositionedNotes;
}

/**
 * Resolves one selected note against the tonal pattern at its destination.
 * A horizontal move only changes pitch when it crosses into another tonal
 * segment; vertical moves always apply the destination pattern.
 */
export function resolveRepositionedPitch(
  basePitch: number,
  baseTick: number,
  deltaTicks: number,
  deltaPitch: number,
  getSnapSettingsAtTick: (tick: number) => PitchSnapSettings,
): RepositionedPitch {
  const destinationTick = Math.max(0, baseTick + deltaTicks);
  const snapSettings = getSnapSettingsAtTick(destinationTick);
  const shouldSnapForTonalChange =
    deltaPitch === 0
    && snapSettings.enabled
    && !haveSameTonalPattern(
      getSnapSettingsAtTick(baseTick),
      snapSettings,
    );
  const pitch = deltaPitch !== 0 || shouldSnapForTonalChange
    ? snapPitchToTonalPattern(
        basePitch + deltaPitch,
        snapSettings,
        deltaPitch,
      )
    : basePitch;

  return {
    destinationTick,
    pitch,
    snapSettings,
  };
}

function haveSameTonalPattern(
  first: PitchSnapSettings,
  second: PitchSnapSettings,
): boolean {
  return first.rootNote === second.rootNote
    && first.patternType === second.patternType
    && first.patternId === second.patternId;
}
