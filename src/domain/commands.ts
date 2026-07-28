import type {
  EffectDescriptor,
  GenerativeRuleDescriptor,
  InstrumentConfig,
  LoopRegion,
  Note,
  NoteId,
  ProjectState,
  Tick,
  TimeSignature,
  Track,
  Voice,
  VoiceId,
  VoiceInterpretation,
} from "./model";
import {
  assertValidNoteForTrack,
  assertValidTransportState,
} from "./validation";

export interface AddVoiceCommand {
  readonly type: "AddVoice";
  readonly voice: Voice;
}

export interface UpdateVoiceChanges {
  readonly name?: string;
  readonly color?: string;
  readonly muted?: boolean;
  readonly solo?: boolean;
  readonly gain?: number;
  readonly pan?: number;
  readonly instrument?: InstrumentConfig;
  readonly effects?: readonly EffectDescriptor[];
  readonly generativeRules?: readonly GenerativeRuleDescriptor[];
  readonly interpretation?: VoiceInterpretation;
}

export interface UpdateVoiceCommand {
  readonly type: "UpdateVoice";
  readonly voiceId: VoiceId;
  readonly changes: UpdateVoiceChanges;
}

export interface DeleteVoiceCommand {
  readonly type: "DeleteVoice";
  readonly voiceId: VoiceId;
}

export interface ReorderVoicesCommand {
  readonly type: "ReorderVoices";
  readonly voiceOrder: readonly VoiceId[];
}

export interface AddNotesCommand {
  readonly type: "AddNotes";
  readonly trackVoiceId: VoiceId;
  readonly notes: readonly Note[];
}

export interface MoveNotesCommand {
  readonly type: "MoveNotes";
  readonly sourceVoiceId: VoiceId;
  readonly targetVoiceId: VoiceId;
  readonly noteIds: readonly NoteId[];
  readonly deltaTicks: Tick;
  readonly deltaPitch: number;
}

export interface NoteDurationChange {
  readonly noteId: NoteId;
  readonly startTick?: Tick;
  readonly durationTicks: Tick;
}

export interface ResizeNotesCommand {
  readonly type: "ResizeNotes";
  readonly trackVoiceId: VoiceId;
  readonly changes: readonly NoteDurationChange[];
}

export interface DeleteNotesCommand {
  readonly type: "DeleteNotes";
  readonly trackVoiceId: VoiceId;
  readonly noteIds: readonly NoteId[];
}

export interface UpdateTempoCommand {
  readonly type: "UpdateTempo";
  readonly bpm: number;
}

export interface UpdateTimeSignatureCommand {
  readonly type: "UpdateTimeSignature";
  readonly timeSignature: TimeSignature;
}

export interface UpdateLoopCommand {
  readonly type: "UpdateLoop";
  readonly loop: LoopRegion | null;
}

export interface SetTransportAnchorCommand {
  readonly type: "SetTransportAnchor";
  readonly anchorTick: Tick;
  readonly anchorAudioTimeSeconds: number | null;
}

export type PianoRollCommand =
  | AddVoiceCommand
  | UpdateVoiceCommand
  | DeleteVoiceCommand
  | ReorderVoicesCommand
  | AddNotesCommand
  | MoveNotesCommand
  | ResizeNotesCommand
  | DeleteNotesCommand
  | UpdateTempoCommand
  | UpdateTimeSignatureCommand
  | UpdateLoopCommand
  | SetTransportAnchorCommand;

export interface Transaction {
  readonly transactionId: string;
  readonly label?: string;
  readonly createdAt: number;
  readonly commands: readonly PianoRollCommand[];
}

export type CommandErrorCode =
  | "INVALID_TRANSACTION"
  | "INVALID_COMMAND"
  | "VOICE_NOT_FOUND"
  | "VOICE_ALREADY_EXISTS"
  | "TRACK_NOT_FOUND"
  | "TRACK_ALREADY_EXISTS"
  | "NOTE_NOT_FOUND"
  | "NOTE_ALREADY_EXISTS"
  | "DUPLICATE_NOTE_ID"
  | "INVALID_VOICE_ORDER";

export class CommandRejectedError extends Error {
  public readonly code: CommandErrorCode;
  public readonly commandType: PianoRollCommand["type"] | null;

  public constructor(
    code: CommandErrorCode,
    message: string,
    commandType: PianoRollCommand["type"] | null,
  ) {
    super(message);
    this.name = "CommandRejectedError";
    this.code = code;
    this.commandType = commandType;
  }
}

export interface ProjectCommandBus {
  execute(state: ProjectState, transaction: Transaction): ProjectState;
}

export function projectReducer(
  state: ProjectState,
  transaction: Transaction,
): ProjectState {
  assertValidTransaction(transaction);

  let nextState = state;

  for (const command of transaction.commands) {
    nextState = applyCommand(nextState, command);
  }

  if (nextState === state) {
    return state;
  }

  return {
    ...nextState,
    revision: state.revision + 1,
  };
}

export const projectCommandBus: ProjectCommandBus = Object.freeze({
  execute: projectReducer,
});

function applyCommand(
  state: ProjectState,
  command: PianoRollCommand,
): ProjectState {
  switch (command.type) {
    case "AddVoice":
      return applyAddVoice(state, command);
    case "UpdateVoice":
      return applyUpdateVoice(state, command);
    case "DeleteVoice":
      return applyDeleteVoice(state, command);
    case "ReorderVoices":
      return applyReorderVoices(state, command);
    case "AddNotes":
      return applyAddNotes(state, command);
    case "MoveNotes":
      return applyMoveNotes(state, command);
    case "ResizeNotes":
      return applyResizeNotes(state, command);
    case "DeleteNotes":
      return applyDeleteNotes(state, command);
    case "UpdateTempo":
      return applyUpdateTempo(state, command);
    case "UpdateTimeSignature":
      return applyUpdateTimeSignature(state, command);
    case "UpdateLoop":
      return applyUpdateLoop(state, command);
    case "SetTransportAnchor":
      return applySetTransportAnchor(state, command);
    default:
      return assertNever(command);
  }
}

function applyAddVoice(
  state: ProjectState,
  command: AddVoiceCommand,
): ProjectState {
  assertNonEmptyId(command.voice.id, command.type);

  if (hasOwn(state.voicesById, command.voice.id)) {
    reject(
      "VOICE_ALREADY_EXISTS",
      `Voice "${command.voice.id}" already exists.`,
      command.type,
    );
  }

  if (hasOwn(state.tracksByVoiceId, command.voice.id)) {
    reject(
      "TRACK_ALREADY_EXISTS",
      `Track "${command.voice.id}" already exists.`,
      command.type,
    );
  }

  const track: Track = {
    voiceId: command.voice.id,
    notesById: {},
  };

  return {
    ...state,
    voicesById: {
      ...state.voicesById,
      [command.voice.id]: command.voice,
    },
    voiceOrder: [...state.voiceOrder, command.voice.id],
    tracksByVoiceId: {
      ...state.tracksByVoiceId,
      [command.voice.id]: track,
    },
  };
}

function applyUpdateVoice(
  state: ProjectState,
  command: UpdateVoiceCommand,
): ProjectState {
  const voice = requireVoice(state, command.voiceId, command.type);
  const updatedVoice: Voice = {
    ...voice,
    ...command.changes,
  };

  return {
    ...state,
    voicesById: {
      ...state.voicesById,
      [command.voiceId]: updatedVoice,
    },
  };
}

function applyDeleteVoice(
  state: ProjectState,
  command: DeleteVoiceCommand,
): ProjectState {
  requireVoice(state, command.voiceId, command.type);
  requireTrack(state, command.voiceId, command.type);

  const voicesById = omitRecordKey(state.voicesById, command.voiceId);
  const tracksByVoiceId = omitRecordKey(
    state.tracksByVoiceId,
    command.voiceId,
  );

  return {
    ...state,
    voicesById,
    voiceOrder: state.voiceOrder.filter(
      (voiceId) => voiceId !== command.voiceId,
    ),
    tracksByVoiceId,
  };
}

function applyReorderVoices(
  state: ProjectState,
  command: ReorderVoicesCommand,
): ProjectState {
  const currentIds = new Set(state.voiceOrder);
  const requestedIds = new Set(command.voiceOrder);

  if (
    requestedIds.size !== command.voiceOrder.length
    || requestedIds.size !== currentIds.size
    || [...currentIds].some((voiceId) => !requestedIds.has(voiceId))
  ) {
    reject(
      "INVALID_VOICE_ORDER",
      "Voice order must contain every voice exactly once.",
      command.type,
    );
  }

  if (
    command.voiceOrder.every(
      (voiceId, index) => voiceId === state.voiceOrder[index],
    )
  ) {
    return state;
  }

  return {
    ...state,
    voiceOrder: [...command.voiceOrder],
  };
}

function applyAddNotes(
  state: ProjectState,
  command: AddNotesCommand,
): ProjectState {
  const track = requireTrack(state, command.trackVoiceId, command.type);
  const commandNoteIds = new Set<NoteId>();

  for (const note of command.notes) {
    assertValidNoteForTrack(note, command.trackVoiceId);

    if (commandNoteIds.has(note.id)) {
      reject(
        "DUPLICATE_NOTE_ID",
        `Note "${note.id}" appears more than once in the command.`,
        command.type,
      );
    }

    if (hasOwn(track.notesById, note.id)) {
      reject(
        "NOTE_ALREADY_EXISTS",
        `Note "${note.id}" already exists in track "${track.voiceId}".`,
        command.type,
      );
    }

    commandNoteIds.add(note.id);
  }

  if (command.notes.length === 0) {
    return state;
  }

  const notesById: Record<NoteId, Note> = {
    ...track.notesById,
  };

  for (const note of command.notes) {
    notesById[note.id] = note;
  }

  return replaceTrack(state, {
    ...track,
    notesById,
  });
}

function applyMoveNotes(
  state: ProjectState,
  command: MoveNotesCommand,
): ProjectState {
  if (
    !Number.isSafeInteger(command.deltaTicks)
    || !Number.isInteger(command.deltaPitch)
  ) {
    reject(
      "INVALID_COMMAND",
      "Move deltas must be integers.",
      command.type,
    );
  }

  const sourceTrack = requireTrack(
    state,
    command.sourceVoiceId,
    command.type,
  );
  const targetTrack = requireTrack(
    state,
    command.targetVoiceId,
    command.type,
  );
  assertUniqueNoteIds(command.noteIds, command.type);

  const movedNotes: Note[] = [];

  for (const noteId of command.noteIds) {
    const note = requireNote(sourceTrack, noteId, command.type);
    const movedNote: Note = {
      ...note,
      pitch: note.pitch + command.deltaPitch,
      startTick: note.startTick + command.deltaTicks,
      voiceId: command.targetVoiceId,
    };

    assertValidNoteForTrack(movedNote, command.targetVoiceId);

    if (
      command.sourceVoiceId !== command.targetVoiceId
      && hasOwn(targetTrack.notesById, noteId)
    ) {
      reject(
        "NOTE_ALREADY_EXISTS",
        `Note "${noteId}" already exists in track "${targetTrack.voiceId}".`,
        command.type,
      );
    }

    movedNotes.push(movedNote);
  }

  if (
    movedNotes.length === 0
    || (
      command.sourceVoiceId === command.targetVoiceId
      && command.deltaTicks === 0
      && command.deltaPitch === 0
    )
  ) {
    return state;
  }

  if (command.sourceVoiceId === command.targetVoiceId) {
    const notesById: Record<NoteId, Note> = {
      ...sourceTrack.notesById,
    };

    for (const note of movedNotes) {
      notesById[note.id] = note;
    }

    return replaceTrack(state, {
      ...sourceTrack,
      notesById,
    });
  }

  const sourceNotesById: Record<NoteId, Note> = {
    ...sourceTrack.notesById,
  };
  const targetNotesById: Record<NoteId, Note> = {
    ...targetTrack.notesById,
  };

  for (const note of movedNotes) {
    delete sourceNotesById[note.id];
    targetNotesById[note.id] = note;
  }

  return {
    ...state,
    tracksByVoiceId: {
      ...state.tracksByVoiceId,
      [sourceTrack.voiceId]: {
        ...sourceTrack,
        notesById: sourceNotesById,
      },
      [targetTrack.voiceId]: {
        ...targetTrack,
        notesById: targetNotesById,
      },
    },
  };
}

function applyResizeNotes(
  state: ProjectState,
  command: ResizeNotesCommand,
): ProjectState {
  const track = requireTrack(state, command.trackVoiceId, command.type);
  const changedNoteIds = new Set<NoteId>();
  const updatedNotes: Note[] = [];

  for (const change of command.changes) {
    if (changedNoteIds.has(change.noteId)) {
      reject(
        "DUPLICATE_NOTE_ID",
        `Note "${change.noteId}" appears more than once in the command.`,
        command.type,
      );
    }

    const note = requireNote(track, change.noteId, command.type);
    const updatedNote: Note = {
      ...note,
      startTick: change.startTick ?? note.startTick,
      durationTicks: change.durationTicks,
    };

    assertValidNoteForTrack(updatedNote, track.voiceId);
    changedNoteIds.add(change.noteId);
    updatedNotes.push(updatedNote);
  }

  if (updatedNotes.length === 0) {
    return state;
  }

  const notesById: Record<NoteId, Note> = {
    ...track.notesById,
  };

  for (const note of updatedNotes) {
    notesById[note.id] = note;
  }

  return replaceTrack(state, {
    ...track,
    notesById,
  });
}

function applyDeleteNotes(
  state: ProjectState,
  command: DeleteNotesCommand,
): ProjectState {
  const track = requireTrack(state, command.trackVoiceId, command.type);
  assertUniqueNoteIds(command.noteIds, command.type);

  for (const noteId of command.noteIds) {
    requireNote(track, noteId, command.type);
  }

  if (command.noteIds.length === 0) {
    return state;
  }

  const notesById: Record<NoteId, Note> = {
    ...track.notesById,
  };

  for (const noteId of command.noteIds) {
    delete notesById[noteId];
  }

  return replaceTrack(state, {
    ...track,
    notesById,
  });
}

function applyUpdateTempo(
  state: ProjectState,
  command: UpdateTempoCommand,
): ProjectState {
  const transportSettings = {
    ...state.transportSettings,
    bpm: command.bpm,
  };

  assertValidTransportState(transportSettings);

  if (transportSettings.bpm === state.transportSettings.bpm) {
    return state;
  }

  return {
    ...state,
    transportSettings,
  };
}

function applyUpdateTimeSignature(
  state: ProjectState,
  command: UpdateTimeSignatureCommand,
): ProjectState {
  const transportSettings = {
    ...state.transportSettings,
    timeSignature: command.timeSignature,
  };

  assertValidTransportState(transportSettings);

  if (
    command.timeSignature.numerator
      === state.transportSettings.timeSignature.numerator
    && command.timeSignature.denominator
      === state.transportSettings.timeSignature.denominator
  ) {
    return state;
  }

  return {
    ...state,
    transportSettings,
  };
}

function applyUpdateLoop(
  state: ProjectState,
  command: UpdateLoopCommand,
): ProjectState {
  const transportSettings = {
    ...state.transportSettings,
    loop: command.loop,
  };

  assertValidTransportState(transportSettings);

  if (
    command.loop?.startTick === state.transportSettings.loop?.startTick
    && command.loop?.endTick === state.transportSettings.loop?.endTick
  ) {
    return state;
  }

  return {
    ...state,
    transportSettings,
  };
}

function applySetTransportAnchor(
  state: ProjectState,
  command: SetTransportAnchorCommand,
): ProjectState {
  const transportSettings = {
    ...state.transportSettings,
    anchorTick: command.anchorTick,
    anchorAudioTimeSeconds: command.anchorAudioTimeSeconds,
  };

  assertValidTransportState(transportSettings);

  if (
    command.anchorTick === state.transportSettings.anchorTick
    && command.anchorAudioTimeSeconds
      === state.transportSettings.anchorAudioTimeSeconds
  ) {
    return state;
  }

  return {
    ...state,
    transportSettings,
  };
}

function replaceTrack(state: ProjectState, track: Track): ProjectState {
  return {
    ...state,
    tracksByVoiceId: {
      ...state.tracksByVoiceId,
      [track.voiceId]: track,
    },
  };
}

function requireVoice(
  state: ProjectState,
  voiceId: VoiceId,
  commandType: PianoRollCommand["type"],
): Voice {
  const voice = state.voicesById[voiceId];

  if (voice === undefined) {
    reject(
      "VOICE_NOT_FOUND",
      `Voice "${voiceId}" does not exist.`,
      commandType,
    );
  }

  return voice;
}

function requireTrack(
  state: ProjectState,
  voiceId: VoiceId,
  commandType: PianoRollCommand["type"],
): Track {
  const track = state.tracksByVoiceId[voiceId];

  if (track === undefined) {
    reject(
      "TRACK_NOT_FOUND",
      `Track "${voiceId}" does not exist.`,
      commandType,
    );
  }

  return track;
}

function requireNote(
  track: Track,
  noteId: NoteId,
  commandType: PianoRollCommand["type"],
): Note {
  const note = track.notesById[noteId];

  if (note === undefined) {
    reject(
      "NOTE_NOT_FOUND",
      `Note "${noteId}" does not exist in track "${track.voiceId}".`,
      commandType,
    );
  }

  return note;
}

function assertUniqueNoteIds(
  noteIds: readonly NoteId[],
  commandType: PianoRollCommand["type"],
): void {
  const uniqueIds = new Set(noteIds);

  if (uniqueIds.size !== noteIds.length) {
    reject(
      "DUPLICATE_NOTE_ID",
      "A note ID appears more than once in the command.",
      commandType,
    );
  }
}

function assertValidTransaction(transaction: Transaction): void {
  if (
    transaction.transactionId.trim().length === 0
    || !Number.isFinite(transaction.createdAt)
  ) {
    throw new CommandRejectedError(
      "INVALID_TRANSACTION",
      "Transaction ID must not be empty and creation time must be finite.",
      null,
    );
  }
}

function assertNonEmptyId(
  id: string,
  commandType: PianoRollCommand["type"],
): void {
  if (id.trim().length === 0) {
    reject(
      "INVALID_COMMAND",
      "ID must not be empty.",
      commandType,
    );
  }
}

function omitRecordKey<T>(
  source: Readonly<Record<string, T>>,
  keyToOmit: string,
): Readonly<Record<string, T>> {
  const result: Record<string, T> = {};

  for (const [key, value] of Object.entries(source)) {
    if (key !== keyToOmit) {
      result[key] = value;
    }
  }

  return result;
}

function hasOwn<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function reject(
  code: CommandErrorCode,
  message: string,
  commandType: PianoRollCommand["type"],
): never {
  throw new CommandRejectedError(code, message, commandType);
}

function assertNever(value: never): never {
  throw new CommandRejectedError(
    "INVALID_COMMAND",
    `Unsupported command: ${String(value)}`,
    null,
  );
}
