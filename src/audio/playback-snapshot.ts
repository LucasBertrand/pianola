import type {
  Note,
  ProjectState,
  TimeSignature,
  Voice,
  VoiceId,
} from "../domain/model";
import {
  getProjectDurationTicks,
  MAXIMUM_MASTER_GAIN,
  MINIMUM_MASTER_GAIN,
} from "../domain/model";
import type {
  PackedVoiceEvents,
  PlaybackSnapshot,
  PlaybackVoiceSnapshot,
  SubtractivePlaybackInstrument,
  TempoMapSnapshot,
} from "./contracts";

export class PlaybackSnapshotCompilationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PlaybackSnapshotCompilationError";
  }
}

export function compilePlaybackSnapshot(
  projectState: ProjectState,
): PlaybackSnapshot {
  const transport = projectState.transportSettings;

  assertPositiveSafeInteger(transport.ppqn, "Project PPQN");
  assertPositiveFiniteNumber(transport.bpm, "Project BPM");

  const durationTicks = getProjectDurationTicks(projectState);

  if (
    !Number.isFinite(projectState.masterBus.gain)
    || projectState.masterBus.gain < MINIMUM_MASTER_GAIN
    || projectState.masterBus.gain > MAXIMUM_MASTER_GAIN
  ) {
    throw new PlaybackSnapshotCompilationError(
      "Master gain is outside the supported range.",
    );
  }

  if (!Number.isSafeInteger(durationTicks) || durationTicks <= 0) {
    throw new PlaybackSnapshotCompilationError(
      "Project duration must be a positive safe integer.",
    );
  }

  const voices: PlaybackVoiceSnapshot[] = [];
  const compiledVoiceIds = new Set<VoiceId>();

  for (
    let voiceIndex = 0;
    voiceIndex < projectState.voiceOrder.length;
    voiceIndex += 1
  ) {
    const voiceId = projectState.voiceOrder[voiceIndex];

    if (voiceId === undefined) {
      continue;
    }

    if (compiledVoiceIds.has(voiceId)) {
      throw new PlaybackSnapshotCompilationError(
        `Voice "${voiceId}" appears more than once in voiceOrder.`,
      );
    }

    const voice = projectState.voicesById[voiceId];
    const track = projectState.tracksByVoiceId[voiceId];

    if (voice === undefined) {
      throw new PlaybackSnapshotCompilationError(
        `Voice "${voiceId}" is missing from voicesById.`,
      );
    }

    if (track === undefined || track.voiceId !== voiceId) {
      throw new PlaybackSnapshotCompilationError(
        `Track "${voiceId}" is missing or belongs to another voice.`,
      );
    }

    compiledVoiceIds.add(voiceId);
    voices.push(
      compileVoiceSnapshot(
        voice,
        track.notesById,
        durationTicks,
      ),
    );
  }

  const snapshot: PlaybackSnapshot = {
    projectRevision: projectState.revision,
    ppqn: transport.ppqn,
    durationTicks,
    masterGain: projectState.masterBus.gain,
    tempoMap: createSingleTempoMapSnapshot(
      transport.bpm,
      transport.timeSignature,
    ),
    voices: Object.freeze(voices),
  };

  return Object.freeze(snapshot);
}

function compileVoiceSnapshot(
  voice: Voice,
  notesById: Readonly<Record<string, Note>>,
  projectDurationTicks: number,
): PlaybackVoiceSnapshot {
  if (voice.instrument.kind !== "subtractive") {
    throw new PlaybackSnapshotCompilationError(
      `Voice "${voice.id}" uses unsupported instrument kind`
        + ` "${voice.instrument.kind}".`,
    );
  }

  assertFiniteNumber(voice.gain, `Voice "${voice.id}" gain`);

  if (!Number.isFinite(voice.pan) || voice.pan < -1 || voice.pan > 1) {
    throw new PlaybackSnapshotCompilationError(
      `Voice "${voice.id}" pan must be between -1 and 1.`,
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
      voice.id,
      projectDurationTicks,
    );
    notes.push(note);
  }

  notes.sort(compareNotesForPlayback);

  const events = packVoiceEvents(voice.id, notes);
  const snapshot: PlaybackVoiceSnapshot = {
    ...events,
    gain: voice.gain,
    pan: voice.pan,
    muted: voice.muted,
    solo: voice.solo,
    instrument: cloneInstrument(voice),
  };

  return Object.freeze(snapshot);
}

function packVoiceEvents(
  voiceId: VoiceId,
  notes: readonly Note[],
): PackedVoiceEvents {
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
    voiceId,
    noteIds: Object.freeze(noteIds),
    pitches,
    velocities,
    startTicks,
    durationTicks,
  });
}

function cloneInstrument(
  voice: Voice,
): SubtractivePlaybackInstrument {
  const instrument = voice.instrument;

  if (instrument.kind !== "subtractive") {
    throw new PlaybackSnapshotCompilationError(
      `Voice "${voice.id}" does not contain a subtractive instrument.`,
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
    oscillatorDetuneCents: instrument.oscillatorDetuneCents,
    envelope,
    filterCutoffHz: instrument.filterCutoffHz,
    filterResonance: instrument.filterResonance,
  });
}

function createSingleTempoMapSnapshot(
  bpm: number,
  timeSignature: TimeSignature,
): TempoMapSnapshot {
  const immutableTimeSignature = Object.freeze({
    numerator: timeSignature.numerator,
    denominator: timeSignature.denominator,
  });

  return Object.freeze({
    startTicks: new Float64Array([0]),
    startSeconds: new Float64Array([0]),
    bpms: new Float64Array([bpm]),
    timeSignatures: Object.freeze([immutableTimeSignature]),
  });
}

function assertCompilableNote(
  note: Note,
  recordKey: string,
  voiceId: VoiceId,
  projectDurationTicks: number,
): void {
  const endTick = note.startTick + note.durationTicks;

  if (note.id !== recordKey) {
    throw new PlaybackSnapshotCompilationError(
      `Note "${note.id}" does not match record key "${recordKey}".`,
    );
  }

  if (note.voiceId !== voiceId) {
    throw new PlaybackSnapshotCompilationError(
      `Note "${note.id}" belongs to voice "${note.voiceId}" instead of "${voiceId}".`,
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
