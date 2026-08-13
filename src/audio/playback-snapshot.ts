import {
  type InstrumentConfig,
  type ProjectInstrument,
} from "../domain/instruments/instrument";
import {
  type Note,
} from "../domain/notes/note";
import {
  type ProjectDocument,
} from "../domain/project/project-document";
import {
  type MeterMapSegment,
} from "../domain/transport/transport";
import {
  type InstrumentId,
} from "../domain/identifiers";
import {
  getClipDurationTicks,
} from "../domain/clips/clip";
import {
  MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
  MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
} from "../domain/instruments/instrument";
import {
  MAXIMUM_MASTER_GAIN,
  MAXIMUM_MASTER_TUNING_FREQUENCY_HZ,
  MINIMUM_MASTER_GAIN,
  MINIMUM_MASTER_TUNING_FREQUENCY_HZ,
} from "../domain/master-bus";
import {
  validateProjectInstrument,
} from "../domain/validation/instrument-validation";
import type {
  PackedInstrumentEvents,
  PlaybackSnapshot,
  PlaybackPlan,
  PlaybackInstrumentSnapshot,
  SubtractivePlaybackPresetSnapshot,
  TempoMapSnapshot,
} from "./playback-model";
import type {
  PlaybackSource,
} from "./playback-source";

export class PlaybackSnapshotCompilationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PlaybackSnapshotCompilationError";
  }
}

export function compilePlaybackPlan(
  projectState: ProjectDocument,
  source: PlaybackSource,
): PlaybackPlan {
  const clip = source.clip;

  assertPositiveSafeInteger(projectState.clock.ppqn, "Project PPQN");
  assertPositiveFiniteNumber(projectState.clock.tempoBpm, "Project BPM");

  const durationTicks = getClipDurationTicks(clip);

  if (
    !Number.isFinite(projectState.masterBus.gain)
    || projectState.masterBus.gain < MINIMUM_MASTER_GAIN
    || projectState.masterBus.gain > MAXIMUM_MASTER_GAIN
  ) {
    throw new PlaybackSnapshotCompilationError(
      "Master gain is outside the supported range.",
    );
  }

  if (typeof projectState.masterBus.muted !== "boolean") {
    throw new PlaybackSnapshotCompilationError(
      "Master mute state must be a boolean.",
    );
  }

  if (
    !Number.isFinite(projectState.masterBus.tuningFrequencyHz)
    || projectState.masterBus.tuningFrequencyHz
      < MINIMUM_MASTER_TUNING_FREQUENCY_HZ
    || projectState.masterBus.tuningFrequencyHz
      > MAXIMUM_MASTER_TUNING_FREQUENCY_HZ
  ) {
    throw new PlaybackSnapshotCompilationError(
      "Master tuning is outside the supported range.",
    );
  }

  if (!Number.isSafeInteger(durationTicks) || durationTicks <= 0) {
    throw new PlaybackSnapshotCompilationError(
      "Project duration must be a positive safe integer.",
    );
  }

  const instruments: PlaybackInstrumentSnapshot[] = [];
  const compiledInstrumentIds = new Set<InstrumentId>();

  for (
    let instrumentIndex = 0;
    instrumentIndex < projectState.instrumentOrder.length;
    instrumentIndex += 1
  ) {
    const instrumentId = projectState.instrumentOrder[instrumentIndex];

    if (instrumentId === undefined) {
      continue;
    }

    if (compiledInstrumentIds.has(instrumentId)) {
      throw new PlaybackSnapshotCompilationError(
        `Project instrument "${instrumentId}" appears more than once in instrumentOrder.`,
      );
    }

    const projectInstrument = projectState.projectInstrumentsById[instrumentId];
    const track = clip.tracksByInstrumentId[instrumentId];
    const instrumentState = clip.instrumentStatesById[instrumentId];

    if (projectInstrument === undefined) {
      throw new PlaybackSnapshotCompilationError(
        `Project instrument "${instrumentId}" is missing from projectInstrumentsById.`,
      );
    }

    if (track === undefined || track.instrumentId !== instrumentId) {
      throw new PlaybackSnapshotCompilationError(
        `Track "${instrumentId}" is missing or belongs to another instrument.`,
      );
    }

    if (instrumentState === undefined) {
      throw new PlaybackSnapshotCompilationError(
        `Project instrument state "${instrumentId}" is missing from playback source "${source.sourceId}".`,
      );
    }

    compiledInstrumentIds.add(instrumentId);
    instruments.push(
      compileInstrumentSnapshot(
        source.sourceId,
        projectInstrument,
        projectInstrument.instrument,
        track.notesById,
        durationTicks,
      ),
    );
  }

  const snapshot: PlaybackSnapshot = {
    sourceId: source.sourceId,
    projectRevision: projectState.revision,
    ppqn: projectState.clock.ppqn,
    durationTicks,
    masterGain: projectState.masterBus.gain,
    masterMuted: projectState.masterBus.muted,
    masterTuningFrequencyHz:
      projectState.masterBus.tuningFrequencyHz,
    tempoMap: createTempoMapSnapshot(
      projectState.clock.tempoBpm,
      projectState.clock.ppqn,
      clip.timeline.meterMap.segments,
    ),
    instruments: Object.freeze(instruments),
  };

  return Object.freeze(snapshot);
}

function compileInstrumentSnapshot(
  sourceId: PlaybackSource["sourceId"],
  projectInstrument: ProjectInstrument,
  instrument: InstrumentConfig,
  notesById: Readonly<Record<string, Note>>,
  projectDurationTicks: number,
): PlaybackInstrumentSnapshot {
  if (instrument.kind !== "subtractive") {
    throw new PlaybackSnapshotCompilationError(
      `Project instrument "${projectInstrument.id}" uses unsupported instrument kind`
        + ` "${instrument.kind}".`,
    );
  }

  const instrumentValidation = validateProjectInstrument(projectInstrument);

  if (!instrumentValidation.valid) {
    const firstIssue = instrumentValidation.issues[0];

    throw new PlaybackSnapshotCompilationError(
      firstIssue === undefined
        ? `Project instrument "${projectInstrument.id}" is invalid.`
        : `Project instrument "${projectInstrument.id}" is invalid at ${firstIssue.path}: ${firstIssue.message}`,
    );
  }

  if (
    !Number.isSafeInteger(instrument.polyphony)
    || instrument.polyphony
      < MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY
    || instrument.polyphony
      > MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY
  ) {
    throw new PlaybackSnapshotCompilationError(
      `Project instrument "${projectInstrument.id}" subtractive synth polyphony must be between ${MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY} and ${MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY}.`,
    );
  }

  assertFiniteNumber(
    projectInstrument.gain,
    `Project instrument "${projectInstrument.id}" gain`,
  );

  if (!Number.isFinite(projectInstrument.pan) || projectInstrument.pan < -1 || projectInstrument.pan > 1) {
    throw new PlaybackSnapshotCompilationError(
      `Project instrument "${projectInstrument.id}" pan must be between -1 and 1.`,
    );
  }

  const notes: Note[] = [];

  for (const noteId in notesById) {
    const note = notesById[noteId];

    if (note === undefined) {
      continue;
    }

    assertCompilableNote(
      note,
      noteId,
      projectInstrument.id,
      projectDurationTicks,
    );

    if (!note.enabled) {
      continue;
    }

    notes.push(note);
  }

  notes.sort(compareNotesForPlayback);

  const events = packInstrumentEvents(sourceId, projectInstrument.id, notes);
  const snapshot: PlaybackInstrumentSnapshot = {
    ...events,
    gain: projectInstrument.gain,
    pan: projectInstrument.pan,
    muted: projectInstrument.muted,
    solo: projectInstrument.solo,
    instrument: cloneInstrument(projectInstrument.id, instrument),
  };

  return Object.freeze(snapshot);
}

function packInstrumentEvents(
  sourceId: PlaybackSource["sourceId"],
  instrumentId: InstrumentId,
  notes: readonly Note[],
): PackedInstrumentEvents {
  const noteCount = notes.length;
  const noteIds = new Array<string>(noteCount);
  const pitches = new Uint8Array(noteCount);
  const velocities = new Uint8Array(noteCount);
  const startTicks = new Float64Array(noteCount);
  const durationTicks = new Float64Array(noteCount);

  for (
    let noteIndex = 0;
    noteIndex < noteCount;
    noteIndex += 1
  ) {
    const note = notes[noteIndex];

    if (note === undefined) {
      continue;
    }

    noteIds[noteIndex] = note.id;
    pitches[noteIndex] = note.pitch;
    velocities[noteIndex] = note.velocity;
    startTicks[noteIndex] = note.startTick;
    durationTicks[noteIndex] = note.durationTicks;
  }

  return Object.freeze({
    sourceId,
    instrumentId,
    noteIds: Object.freeze(noteIds),
    pitches,
    velocities,
    startTicks,
    durationTicks,
  });
}

function cloneInstrument(
  instrumentId: InstrumentId,
  instrument: InstrumentConfig,
): SubtractivePlaybackPresetSnapshot {
  if (instrument.kind !== "subtractive") {
    throw new PlaybackSnapshotCompilationError(
      `Project instrument "${instrumentId}" does not contain a subtractive instrument.`,
    );
  }

  const envelope = Object.freeze({
    attackSeconds: instrument.envelope.attackSeconds,
    decaySeconds: instrument.envelope.decaySeconds,
    sustainLevel: instrument.envelope.sustainLevel,
    releaseSeconds: instrument.envelope.releaseSeconds,
  });

  return Object.freeze({
    kind: "subtractive",
    oscillatorWaveform: instrument.oscillatorWaveform,
    polyphony: instrument.polyphony,
    oscillatorDetuneCents: instrument.oscillatorDetuneCents,
    pulseWidth: instrument.pulseWidth,
    envelope,
    filterCutoffHz: instrument.filterCutoffHz,
    filterResonance: instrument.filterResonance,
    filterEnvelopeAmountOctaves:
      instrument.filterEnvelopeAmountOctaves,
    filterEnvelope: Object.freeze({
      attackSeconds: instrument.filterEnvelope.attackSeconds,
      decaySeconds: instrument.filterEnvelope.decaySeconds,
      sustainLevel: instrument.filterEnvelope.sustainLevel,
      releaseSeconds: instrument.filterEnvelope.releaseSeconds,
    }),
  });
}

function createTempoMapSnapshot(
  bpm: number,
  ppqn: number,
  segments: readonly MeterMapSegment[],
): TempoMapSnapshot {
  if (segments.length === 0 || segments[0]?.startTick !== 0) {
    throw new PlaybackSnapshotCompilationError(
      "A playback meter map must start at tick 0.",
    );
  }

  const startTicks = new Float64Array(segments.length);
  const startSeconds = new Float64Array(segments.length);
  const bpms = new Float64Array(segments.length);
  const timeSignatures = segments.map((segment, index) => {
    startTicks[index] = segment.startTick;
    startSeconds[index] = segment.startTick * 60 / (bpm * ppqn);
    bpms[index] = bpm;

    return Object.freeze({
      numerator: segment.timeSignature.numerator,
      denominator: segment.timeSignature.denominator,
    });
  });

  return Object.freeze({
    startTicks,
    startSeconds,
    bpms,
    timeSignatures: Object.freeze(timeSignatures),
  });
}

function assertCompilableNote(
  note: Note,
  recordKey: string,
  instrumentId: InstrumentId,
  projectDurationTicks: number,
): void {
  const endTick = note.startTick + note.durationTicks;

  if (note.id !== recordKey) {
    throw new PlaybackSnapshotCompilationError(
      `Note "${note.id}" does not match record key "${recordKey}".`,
    );
  }

  if (note.instrumentId !== instrumentId) {
    throw new PlaybackSnapshotCompilationError(
      `Note "${note.id}" belongs to instrument "${note.instrumentId}" instead of "${instrumentId}".`,
    );
  }

  if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127) {
    throw new PlaybackSnapshotCompilationError(
      `Note "${note.id}" pitch must be an integer between 0 and 127.`,
    );
  }

  if (
    !Number.isInteger(note.velocity)
    || note.velocity < 0
    || note.velocity > 127
  ) {
    throw new PlaybackSnapshotCompilationError(
      `Note "${note.id}" velocity must be an integer between 0 and 127.`,
    );
  }

  if (typeof note.enabled !== "boolean") {
    throw new PlaybackSnapshotCompilationError(
      `Note "${note.id}" enabled state must be a boolean.`,
    );
  }

  if (
    !Number.isSafeInteger(note.startTick)
    || note.startTick < 0
    || !Number.isSafeInteger(note.durationTicks)
    || note.durationTicks <= 0
    || !Number.isSafeInteger(endTick)
    || endTick > projectDurationTicks
  ) {
    throw new PlaybackSnapshotCompilationError(
      `Note "${note.id}" has invalid or out-of-project timing.`,
    );
  }
}

function compareNotesForPlayback(left: Note, right: Note): number {
  const startDifference = left.startTick - right.startTick;

  if (startDifference !== 0) {
    return startDifference;
  }

  const pitchDifference = left.pitch - right.pitch;

  if (pitchDifference !== 0) {
    return pitchDifference;
  }

  const durationDifference = left.durationTicks - right.durationTicks;

  if (durationDifference !== 0) {
    return durationDifference;
  }

  if (left.id < right.id) {
    return -1;
  }

  if (left.id > right.id) {
    return 1;
  }

  return 0;
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new PlaybackSnapshotCompilationError(
      `${label} must be finite.`,
    );
  }
}

function assertPositiveFiniteNumber(
  value: number,
  label: string,
): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PlaybackSnapshotCompilationError(
      `${label} must be positive and finite.`,
    );
  }
}

function assertPositiveSafeInteger(
  value: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PlaybackSnapshotCompilationError(
      `${label} must be a positive safe integer.`,
    );
  }
}
