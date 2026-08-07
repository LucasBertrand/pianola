import type {
  Note,
} from "../../domain/model";
import {
  snapPitchToTonalPattern,
  type PitchSnapSettings,
} from "../../music/pitch-snap";
import type {
  ResizeEdge,
} from "./state";

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
  pitchSnapSettings: PitchSnapSettings,
): readonly Note[] {
  const repositionedNotes: Note[] = [];

  for (const note of notes) {
    repositionedNotes.push({
      ...note,
      startTick: note.startTick + deltaTicks,
      pitch:
        deltaPitch === 0
          ? note.pitch
          : snapPitchToTonalPattern(
              note.pitch + deltaPitch,
              pitchSnapSettings,
              deltaPitch,
            ),
    });
  }

  return repositionedNotes;
}
