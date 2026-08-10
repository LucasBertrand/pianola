import {
  APPLICATION_CONSTANTS,
  MIDI_CONSTANTS,
  PROJECT_CONSTANTS,
} from "../config/program-constants";
import type {
  Note,
  ProjectState,
} from "../domain/model";
import {
  getActiveClip,
  getActiveClipDurationTicks,
} from "../domain/model";
import type {
  MidiEvent,
  MidiFile,
  MidiTrack,
} from "./types";

export interface MidiExportResult {
  readonly file: MidiFile;
  readonly warnings: readonly string[];
}

/** Converts an immutable project snapshot into a deterministic format-1 SMF. */
export function createMidiExport(
  state: ProjectState,
): MidiExportResult {
  const activeClip = getActiveClip(state);
  const warnings: string[] = [];
  let zeroVelocityNoteCount = 0;
  const sourcePpqn = activeClip.transportSettings.ppqn;

  if (!Number.isSafeInteger(sourcePpqn) || sourcePpqn < 1) {
    throw new RangeError(
      "Project PPQN must be a positive safe integer.",
    );
  }

  const outputPpqn =
    sourcePpqn <= MIDI_CONSTANTS.maximumPpqn
      ? sourcePpqn
      : PROJECT_CONSTANTS.ppqn;

  if (outputPpqn !== sourcePpqn) {
    warnings.push(
      `Project timing was converted from ${String(sourcePpqn)} PPQN to ${String(outputPpqn)} PPQN for MIDI export.`,
    );
  }

  const projectEndTick = convertProjectTickForMidi(
    getActiveClipDurationTicks(state),
    sourcePpqn,
    outputPpqn,
  );
  const conductorEvents: MidiEvent[] = [
    {
      kind: "track-name",
      absoluteTick: 0,
      text: state.title,
    },
    {
      kind: "tempo",
      absoluteTick: 0,
      microsecondsPerQuarterNote:
        bpmToMicrosecondsPerQuarterNote(
          activeClip.transportSettings.bpm,
        ),
    },
    {
      kind: "time-signature",
      absoluteTick: 0,
      numerator:
        activeClip.transportSettings.timeSignature.numerator,
      denominator:
        activeClip.transportSettings.timeSignature.denominator,
      midiClocksPerMetronome: 24,
      thirtySecondNotesPerQuarter: 8,
    },
    {
      kind: "end-of-track",
      absoluteTick: projectEndTick,
    },
  ];
  const tracks: MidiTrack[] = [
    {
      events: conductorEvents,
    },
  ];

  for (
    let voiceIndex = 0;
    voiceIndex < state.voiceOrder.length;
    voiceIndex += 1
  ) {
    const voiceId = state.voiceOrder[voiceIndex];

    if (voiceId === undefined) {
      continue;
    }

    const voice = state.voicesById[voiceId];
    const track = activeClip.tracksByVoiceId[voiceId];

    if (voice === undefined || track === undefined) {
      continue;
    }

    const channel =
      voiceIndex % MIDI_CONSTANTS.exportChannelCount;
    const notes = Object.values(track.notesById)
      .sort(compareNotesForMidiExport);
    const events: MidiEvent[] = [
      {
        kind: "track-name",
        absoluteTick: 0,
        text: voice.name,
      },
    ];
    let trackEndTick = projectEndTick;

    for (const note of notes) {
      if (!note.enabled) {
        continue;
      }

      let noteStartTick = convertProjectTickForMidi(
        note.startTick,
        sourcePpqn,
        outputPpqn,
      );
      let noteEndTick = convertProjectTickForMidi(
        note.startTick + note.durationTicks,
        sourcePpqn,
        outputPpqn,
      );

      if (noteEndTick <= noteStartTick) {
        if (noteEndTick > 0) {
          noteStartTick = noteEndTick - 1;
        } else {
          noteEndTick = noteStartTick + 1;
        }
      }

      const velocity =
        note.velocity > 0
          ? note.velocity
          : 1;

      if (note.velocity === 0) {
        zeroVelocityNoteCount += 1;
      }

      events.push(
        {
          kind: "note-on",
          absoluteTick: noteStartTick,
          channel,
          note: note.pitch,
          velocity,
        },
        {
          kind: "note-off",
          absoluteTick: noteEndTick,
          channel,
          note: note.pitch,
          velocity: 0,
        },
      );
      trackEndTick = Math.max(
        trackEndTick,
        noteEndTick,
      );
    }

    events.push({
      kind: "end-of-track",
      absoluteTick: trackEndTick,
    });
    tracks.push({
      events,
    });
  }

  if (zeroVelocityNoteCount > 0) {
    warnings.push(
      `${String(zeroVelocityNoteCount)} zero-velocity ${zeroVelocityNoteCount === 1 ? "note was" : "notes were"} exported with velocity 1.`,
    );
  }

  return {
    file: {
      format: MIDI_CONSTANTS.exportFormat,
      ticksPerQuarterNote: outputPpqn,
      tracks,
    },
    warnings,
  };
}

export function createMidiFileName(projectTitle: string): string {
  const sanitizedTitle = projectTitle
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/[.\s]+$/gu, "");
  const baseName =
    sanitizedTitle.length > 0
      ? sanitizedTitle
      : APPLICATION_CONSTANTS.defaultProjectTitle;

  return `${baseName}${MIDI_CONSTANTS.fileExtension}`;
}

function convertProjectTickForMidi(
  tick: number,
  sourcePpqn: number,
  outputPpqn: number,
): number {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError(
      "Project note ticks must be non-negative safe integers.",
    );
  }

  if (sourcePpqn === outputPpqn) {
    return tick;
  }

  const wholeQuarters = Math.floor(tick / sourcePpqn);
  const remainder = tick % sourcePpqn;
  const convertedTick =
    wholeQuarters * outputPpqn
    + Math.round(remainder * outputPpqn / sourcePpqn);

  if (
    !Number.isSafeInteger(convertedTick)
    || convertedTick < 0
  ) {
    throw new RangeError(
      "Project note timing cannot be represented safely in MIDI.",
    );
  }

  return convertedTick;
}

function bpmToMicrosecondsPerQuarterNote(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new RangeError(
      "Project tempo must be a positive finite number.",
    );
  }

  const microseconds = Math.round(60_000_000 / bpm);

  if (microseconds < 1 || microseconds > 0xff_ffff) {
    throw new RangeError(
      "Project tempo is outside the Standard MIDI File range.",
    );
  }

  return microseconds;
}

function compareNotesForMidiExport(
  left: Note,
  right: Note,
): number {
  return (
    left.startTick - right.startTick
    || left.pitch - right.pitch
    || left.id.localeCompare(right.id)
  );
}
