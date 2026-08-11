import type {
  EffectDescriptor,
  Clip,
  ClipId,
  ClipVoiceState,
  GenerativeRuleDescriptor,
  LoopRegion,
  Note,
  NoteId,
  ProjectState,
  Tick,
  TimeSignature,
  Track,
  TransportState,
  Voice,
  VoiceId,
  VoiceInterpretation,
} from "./model";
import {
  getActiveClip,
  getTicksPerMeasure,
  MAXIMUM_MEASURE_COUNT,
  MAXIMUM_CLIP_NAME_LENGTH,
  MAXIMUM_PROJECT_CLIP_COUNT,
  MAXIMUM_MASTER_GAIN,
  MAXIMUM_MASTER_TUNING_FREQUENCY_HZ,
  MINIMUM_MEASURE_COUNT,
  MINIMUM_MASTER_GAIN,
  MINIMUM_MASTER_TUNING_FREQUENCY_HZ,
  MAXIMUM_CLIP_NOTE_COUNT,
  MAXIMUM_PROJECT_TITLE_LENGTH,
  MAXIMUM_PROJECT_VOICE_COUNT,
} from "./model";
import {
  assertValidInstrumentConfig,
  assertValidNoteForTrack,
  assertValidProjectDuration,
  assertValidTransportState,
  assertValidVoice,
  DomainValidationError,
} from "./validation";

export interface AddVoiceCommand {
  readonly type: "AddVoice";
  readonly voice: Voice;
  readonly clipVoiceStatesById: Readonly<Record<ClipId, ClipVoiceState>>;
}

export interface UpdateVoiceChanges {
  readonly name?: string;
  readonly color?: string;
  readonly pan?: number;
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

export interface UpdateProjectTitleCommand {
  readonly type: "UpdateProjectTitle";
  readonly title: string;
}

export interface UpdateMasterGainCommand {
  readonly type: "UpdateMasterGain";
  readonly gain: number;
}

export interface SetMasterMutedCommand {
  readonly type: "SetMasterMuted";
  readonly muted: boolean;
}

export interface UpdateMasterTuningCommand {
  readonly type: "UpdateMasterTuning";
  readonly tuningFrequencyHz: number;
}

export interface InsertMeasureCommand {
  readonly type: "InsertMeasure";
  readonly measureIndex: number;
}

export interface RemoveMeasureCommand {
  readonly type: "RemoveMeasure";
  readonly measureIndex: number;
}

export interface UpdateClipVoiceStateCommand {
  readonly type: "UpdateClipVoiceState";
  readonly voiceId: VoiceId;
  readonly changes: Partial<ClipVoiceState>;
}

export interface AddClipCommand {
  readonly type: "AddClip";
  readonly clip: Clip;
}

export interface DeleteClipCommand {
  readonly type: "DeleteClip";
  readonly clipId: ClipId;
}

export interface ReorderClipsCommand {
  readonly type: "ReorderClips";
  readonly clipOrder: readonly ClipId[];
}

export interface RenameClipCommand {
  readonly type: "RenameClip";
  readonly clipId: ClipId;
  readonly name: string;
}

export interface ActivateClipCommand {
  readonly type: "ActivateClip";
  readonly clipId: ClipId;
}

export interface AppendMeasuresCommand {
  readonly type: "AppendMeasures";
  readonly count: number;
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

export interface NotePositionChange {
  readonly noteId: NoteId;
  readonly startTick: Tick;
  readonly pitch: number;
}

export interface RepositionNotesCommand {
  readonly type: "RepositionNotes";
  readonly trackVoiceId: VoiceId;
  readonly changes: readonly NotePositionChange[];
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

export interface NoteTransformChange {
  readonly noteId: NoteId;
  readonly startTick: Tick;
  readonly durationTicks: Tick;
  readonly pitch: number;
}

export interface TransformNotesCommand {
  readonly type: "TransformNotes";
  readonly trackVoiceId: VoiceId;
  readonly changes: readonly NoteTransformChange[];
}

export interface NoteSliceDescriptor {
  readonly noteId: NoteId;
  readonly rightNoteId: NoteId;
}

export interface SliceNotesCommand {
  readonly type: "SliceNotes";
  readonly trackVoiceId: VoiceId;
  readonly sliceTick: Tick;
  readonly slices: readonly NoteSliceDescriptor[];
}

export interface DeleteNotesCommand {
  readonly type: "DeleteNotes";
  readonly trackVoiceId: VoiceId;
  readonly noteIds: readonly NoteId[];
}

export interface SetNotesEnabledCommand {
  readonly type: "SetNotesEnabled";
  readonly trackVoiceId: VoiceId;
  readonly noteIds: readonly NoteId[];
  readonly enabled: boolean;
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
  readonly loop: LoopRegion;
}

export interface SetLoopEnabledCommand {
  readonly type: "SetLoopEnabled";
  readonly enabled: boolean;
}

export type PianoRollCommand =
  | AddClipCommand
  | DeleteClipCommand
  | ReorderClipsCommand
  | RenameClipCommand
  | ActivateClipCommand
  | AddVoiceCommand
  | UpdateVoiceCommand
  | UpdateClipVoiceStateCommand
  | DeleteVoiceCommand
  | ReorderVoicesCommand
  | UpdateProjectTitleCommand
  | UpdateMasterGainCommand
  | SetMasterMutedCommand
  | UpdateMasterTuningCommand
  | InsertMeasureCommand
  | RemoveMeasureCommand
  | AppendMeasuresCommand
  | AddNotesCommand
  | MoveNotesCommand
  | RepositionNotesCommand
  | ResizeNotesCommand
  | TransformNotesCommand
  | SliceNotesCommand
  | DeleteNotesCommand
  | SetNotesEnabledCommand
  | UpdateTempoCommand
  | UpdateTimeSignatureCommand
  | UpdateLoopCommand
  | SetLoopEnabledCommand;

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
  | "VOICE_LOCKED"
  | "TRACK_NOT_FOUND"
  | "TRACK_ALREADY_EXISTS"
  | "NOTE_NOT_FOUND"
  | "NOTE_ALREADY_EXISTS"
  | "NOTE_OVERLAP"
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

export function projectReducer(
  state: ProjectState,
  transaction: Transaction,
): ProjectState {
  assertValidTransaction(transaction);

  let nextState = state;

  for (const command of transaction.commands) {
    try {
      nextState = applyCommand(nextState, command);
    } catch (error: unknown) {
      if (error instanceof DomainValidationError) {
        throw new CommandRejectedError(
          "INVALID_COMMAND",
          error.message,
          command.type,
        );
      }

      throw error;
    }
  }

  if (nextState === state) {
    return state;
  }

  return {
    ...nextState,
    revision: state.revision + 1,
  };
}

function applyCommand(
  state: ProjectState,
  command: PianoRollCommand,
): ProjectState {
  switch (command.type) {
    case "AddClip":
      return applyAddClip(state, command);
    case "DeleteClip":
      return applyDeleteClip(state, command);
    case "ReorderClips":
      return applyReorderClips(state, command);
    case "RenameClip":
      return applyRenameClip(state, command);
    case "ActivateClip":
      return applyActivateClip(state, command);
    case "AddVoice":
      return applyAddVoice(state, command);
    case "UpdateVoice":
      return applyUpdateVoice(state, command);
    case "DeleteVoice":
      return applyDeleteVoice(state, command);
    case "ReorderVoices":
      return applyReorderVoices(state, command);
    case "UpdateProjectTitle":
      return applyUpdateProjectTitle(state, command);
    case "UpdateMasterGain":
      return applyUpdateMasterGain(state, command);
    case "SetMasterMuted":
      return applySetMasterMuted(state, command);
    case "UpdateMasterTuning":
      return applyUpdateMasterTuning(state, command);
    default:
      return applyActiveClipCommand(state, command);
  }
}

type ActiveClipCommand = Exclude<
  PianoRollCommand,
  | AddClipCommand
  | DeleteClipCommand
  | ReorderClipsCommand
  | RenameClipCommand
  | ActivateClipCommand
  | AddVoiceCommand
  | UpdateVoiceCommand
  | DeleteVoiceCommand
  | ReorderVoicesCommand
  | UpdateProjectTitleCommand
  | UpdateMasterGainCommand
  | SetMasterMutedCommand
  | UpdateMasterTuningCommand
>;

type ActiveClipProjectState = Pick<
  ProjectState,
  "voicesById" | "voiceOrder"
> & Pick<
  Clip,
  | "measureCount"
  | "tracksByVoiceId"
  | "voiceStatesById"
  | "transportSettings"
>;

function applyActiveClipCommand(
  state: ProjectState,
  command: ActiveClipCommand,
): ProjectState {
  const clip = getActiveClip(state);
  const context: ActiveClipProjectState = {
    voicesById: state.voicesById,
    voiceOrder: state.voiceOrder,
    measureCount: clip.measureCount,
    tracksByVoiceId: clip.tracksByVoiceId,
    voiceStatesById: clip.voiceStatesById,
    transportSettings: clip.transportSettings,
  };
  let nextContext: ActiveClipProjectState;

  switch (command.type) {
    case "UpdateClipVoiceState":
      nextContext = applyUpdateClipVoiceState(context, command);
      break;
    case "InsertMeasure":
      nextContext = applyInsertMeasure(context, command);
      break;
    case "RemoveMeasure":
      nextContext = applyRemoveMeasure(context, command);
      break;
    case "AppendMeasures":
      nextContext = applyAppendMeasures(context, command);
      break;
    case "AddNotes":
      nextContext = applyAddNotes(context, command);
      break;
    case "MoveNotes":
      nextContext = applyMoveNotes(context, command);
      break;
    case "RepositionNotes":
      nextContext = applyRepositionNotes(context, command);
      break;
    case "ResizeNotes":
      nextContext = applyResizeNotes(context, command);
      break;
    case "TransformNotes":
      nextContext = applyTransformNotes(context, command);
      break;
    case "SliceNotes":
      nextContext = applySliceNotes(context, command);
      break;
    case "DeleteNotes":
      nextContext = applyDeleteNotes(context, command);
      break;
    case "SetNotesEnabled":
      nextContext = applySetNotesEnabled(context, command);
      break;
    case "UpdateTempo":
      nextContext = applyUpdateTempo(context, command);
      break;
    case "UpdateTimeSignature":
      nextContext = applyUpdateTimeSignature(context, command);
      break;
    case "UpdateLoop":
      nextContext = applyUpdateLoop(context, command);
      break;
    case "SetLoopEnabled":
      nextContext = applySetLoopEnabled(context, command);
      break;
    default:
      return assertNever(command);
  }

  if (nextContext === context) {
    return state;
  }

  const nextClip: Clip = {
    ...clip,
    measureCount: nextContext.measureCount,
    tracksByVoiceId: nextContext.tracksByVoiceId,
    voiceStatesById: nextContext.voiceStatesById,
    transportSettings: nextContext.transportSettings,
  };

  return {
    ...state,
    clipsById: {
      ...state.clipsById,
      [clip.id]: nextClip,
    },
  };
}

function applyAddClip(
  state: ProjectState,
  command: AddClipCommand,
): ProjectState {
  if (state.clipOrder.length >= MAXIMUM_PROJECT_CLIP_COUNT) {
    reject(
      "INVALID_COMMAND",
      `A project cannot contain more than ${MAXIMUM_PROJECT_CLIP_COUNT} clips.`,
      command.type,
    );
  }

  if (hasOwn(state.clipsById, command.clip.id)) {
    reject(
      "INVALID_COMMAND",
      `Clip "${command.clip.id}" already exists.`,
      command.type,
    );
  }

  assertValidClip(state, command.clip, command.type);

  return {
    ...state,
    clipsById: {
      ...state.clipsById,
      [command.clip.id]: command.clip,
    },
    clipOrder: [...state.clipOrder, command.clip.id],
    activeClipId: command.clip.id,
  };
}

function applyDeleteClip(
  state: ProjectState,
  command: DeleteClipCommand,
): ProjectState {
  if (state.clipsById[command.clipId] === undefined) {
    reject(
      "INVALID_COMMAND",
      `Clip "${command.clipId}" does not exist.`,
      command.type,
    );
  }

  if (state.clipOrder.length <= 1) {
    reject(
      "INVALID_COMMAND",
      "A project must contain at least one clip.",
      command.type,
    );
  }

  const removedIndex = state.clipOrder.indexOf(command.clipId);
  const clipOrder = state.clipOrder.filter(
    (clipId) => clipId !== command.clipId,
  );
  const clipsById = omitRecordKey(state.clipsById, command.clipId);
  const fallbackIndex = Math.min(removedIndex, clipOrder.length - 1);
  const activeClipId =
    state.activeClipId === command.clipId
      ? clipOrder[fallbackIndex]
      : state.activeClipId;

  if (activeClipId === undefined) {
    reject("INVALID_COMMAND", "A clip must remain active.", command.type);
  }

  return {
    ...state,
    clipsById,
    clipOrder,
    activeClipId,
  };
}

function applyReorderClips(
  state: ProjectState,
  command: ReorderClipsCommand,
): ProjectState {
  const currentIds = new Set(state.clipOrder);
  const requestedIds = new Set(command.clipOrder);

  if (
    requestedIds.size !== command.clipOrder.length
    || requestedIds.size !== currentIds.size
    || [...currentIds].some((clipId) => !requestedIds.has(clipId))
  ) {
    reject(
      "INVALID_COMMAND",
      "Clip order must contain every clip exactly once.",
      command.type,
    );
  }

  return {
    ...state,
    clipOrder: [...command.clipOrder],
  };
}

function applyRenameClip(
  state: ProjectState,
  command: RenameClipCommand,
): ProjectState {
  const clip = state.clipsById[command.clipId];
  const name = command.name.trim();

  if (clip === undefined) {
    reject(
      "INVALID_COMMAND",
      `Clip "${command.clipId}" does not exist.`,
      command.type,
    );
  }

  if (name.length === 0 || name.length > MAXIMUM_CLIP_NAME_LENGTH) {
    reject(
      "INVALID_COMMAND",
      `Clip name must contain between 1 and ${MAXIMUM_CLIP_NAME_LENGTH} characters.`,
      command.type,
    );
  }

  if (name === clip.name) {
    return state;
  }

  return {
    ...state,
    clipsById: {
      ...state.clipsById,
      [clip.id]: {
        ...clip,
        name,
      },
    },
  };
}

function applyActivateClip(
  state: ProjectState,
  command: ActivateClipCommand,
): ProjectState {
  if (state.clipsById[command.clipId] === undefined) {
    reject(
      "INVALID_COMMAND",
      `Clip "${command.clipId}" does not exist.`,
      command.type,
    );
  }

  return command.clipId === state.activeClipId
    ? state
    : {
        ...state,
        activeClipId: command.clipId,
      };
}

function assertValidClip(
  state: ProjectState,
  clip: Clip,
  commandType: PianoRollCommand["type"],
): void {
  if (
    clip.id.length === 0
    || clip.name.trim().length === 0
    || clip.name.length > MAXIMUM_CLIP_NAME_LENGTH
  ) {
    reject("INVALID_COMMAND", "Clip identity is invalid.", commandType);
  }

  assertValidProjectDuration(clip.measureCount, clip.transportSettings);
  assertValidTransportState(clip.transportSettings);
  const durationTicks =
    clip.measureCount * getTicksPerMeasure(clip.transportSettings);
  if (
    clip.voiceStatesById === null
    || typeof clip.voiceStatesById !== "object"
  ) {
    reject(
      "INVALID_COMMAND",
      `Clip "${clip.id}" must contain voice state data.`,
      commandType,
    );
  }

  const trackIds = Object.keys(clip.tracksByVoiceId);
  const voiceStateIds = Object.keys(clip.voiceStatesById);

  if (
    trackIds.length !== state.voiceOrder.length
    || voiceStateIds.length !== state.voiceOrder.length
    || trackIds.some(
      (voiceId) => state.voicesById[voiceId] === undefined,
    )
    || voiceStateIds.some(
      (voiceId) => state.voicesById[voiceId] === undefined,
    )
  ) {
    reject(
      "INVALID_COMMAND",
      `Clip "${clip.id}" must contain exactly one track per project voice.`,
      commandType,
    );
  }

  if (
    clip.transportSettings.anchorTick > durationTicks
    || clip.transportSettings.loop.endTick > durationTicks
  ) {
    reject(
      "INVALID_COMMAND",
      `Clip "${clip.id}" transport exceeds its duration.`,
      commandType,
    );
  }

  const noteIds = new Set<NoteId>();
  let noteCount = 0;

  for (const voiceId of state.voiceOrder) {
    const track = clip.tracksByVoiceId[voiceId];
    const voiceState = clip.voiceStatesById[voiceId];

    if (
      track === undefined
      || track.voiceId !== voiceId
      || voiceState === undefined
    ) {
      reject(
        "INVALID_COMMAND",
        `Clip "${clip.id}" must contain a track and state for voice "${voiceId}".`,
        commandType,
      );
    }

    assertValidClipVoiceState(
      voiceState,
      commandType,
      `Clip "${clip.id}" voice "${voiceId}"`,
    );

    const notes = Object.values(track.notesById);
    noteCount += notes.length;
    notes.sort(compareNotesForOverlapValidation);

    for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
      const note = notes[noteIndex];

      if (note === undefined) {
        continue;
      }

      assertValidNoteForTrack(note, voiceId);

      if (
        track.notesById[note.id] !== note
        || noteIds.has(note.id)
        || note.startTick + note.durationTicks > durationTicks
      ) {
        reject(
          "INVALID_COMMAND",
          `Clip "${clip.id}" contains an invalid or duplicate note.`,
          commandType,
        );
      }

      const previousNote = notes[noteIndex - 1];

      if (
        previousNote !== undefined
        && notesOverlapInVoice(previousNote, note)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Clip "${clip.id}" contains overlapping notes.`,
          commandType,
        );
      }

      noteIds.add(note.id);
    }
  }

  if (noteCount > MAXIMUM_CLIP_NOTE_COUNT) {
    reject(
      "INVALID_COMMAND",
      `Clip "${clip.id}" exceeds the note limit.`,
      commandType,
    );
  }
}

function compareNotesForOverlapValidation(left: Note, right: Note): number {
  return (
    left.pitch - right.pitch
    || left.startTick - right.startTick
    || left.durationTicks - right.durationTicks
    || left.id.localeCompare(right.id)
  );
}

function applyAddVoice(
  state: ProjectState,
  command: AddVoiceCommand,
): ProjectState {
  assertValidVoice(command.voice);

  if (state.voiceOrder.length >= MAXIMUM_PROJECT_VOICE_COUNT) {
    reject(
      "INVALID_COMMAND",
      `A project cannot contain more than ${MAXIMUM_PROJECT_VOICE_COUNT} voices.`,
      command.type,
    );
  }

  if (hasOwn(state.voicesById, command.voice.id)) {
    reject(
      "VOICE_ALREADY_EXISTS",
      `Voice "${command.voice.id}" already exists.`,
      command.type,
    );
  }

  const requestedClipIds = Object.keys(command.clipVoiceStatesById);

  if (
    requestedClipIds.length !== state.clipOrder.length
    || requestedClipIds.some(
      (clipId) => state.clipsById[clipId] === undefined,
    )
  ) {
    reject(
      "INVALID_COMMAND",
      "Adding a voice requires exactly one initial state per clip.",
      command.type,
    );
  }

  const track: Track = {
    voiceId: command.voice.id,
    notesById: {},
  };
  const clipsById: Record<ClipId, Clip> = {};

  for (const clipId of state.clipOrder) {
    const clip = state.clipsById[clipId];

    if (clip === undefined) {
      continue;
    }

    if (hasOwn(clip.tracksByVoiceId, command.voice.id)) {
      reject(
        "TRACK_ALREADY_EXISTS",
        `Track "${command.voice.id}" already exists in clip "${clip.id}".`,
        command.type,
      );
    }

    const clipVoiceState = command.clipVoiceStatesById[clipId];

    if (clipVoiceState === undefined) {
      reject(
        "INVALID_COMMAND",
        `Initial voice state is missing for clip "${clipId}".`,
        command.type,
      );
    }

    assertValidClipVoiceState(
      clipVoiceState,
      command.type,
      `Clip "${clipId}" voice "${command.voice.id}"`,
    );

    clipsById[clipId] = {
      ...clip,
      tracksByVoiceId: {
        ...clip.tracksByVoiceId,
        [command.voice.id]: track,
      },
      voiceStatesById: {
        ...clip.voiceStatesById,
        [command.voice.id]: clipVoiceState,
      },
    };
  }

  return {
    ...state,
    voicesById: {
      ...state.voicesById,
      [command.voice.id]: command.voice,
    },
    voiceOrder: [...state.voiceOrder, command.voice.id],
    clipsById,
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

  assertValidVoice(updatedVoice);

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

  const voicesById = omitRecordKey(state.voicesById, command.voiceId);
  const clipsById: Record<ClipId, Clip> = {};

  for (const clipId of state.clipOrder) {
    const clip = state.clipsById[clipId];

    if (clip !== undefined) {
      clipsById[clipId] = {
        ...clip,
        tracksByVoiceId: omitRecordKey(
          clip.tracksByVoiceId,
          command.voiceId,
        ),
        voiceStatesById: omitRecordKey(
          clip.voiceStatesById,
          command.voiceId,
        ),
      };
    }
  }

  return {
    ...state,
    voicesById,
    voiceOrder: state.voiceOrder.filter(
      (voiceId) => voiceId !== command.voiceId,
    ),
    clipsById,
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

function applyUpdateProjectTitle(
  state: ProjectState,
  command: UpdateProjectTitleCommand,
): ProjectState {
  const title = command.title.trim();

  if (
    title.length === 0
    || title.length > MAXIMUM_PROJECT_TITLE_LENGTH
  ) {
    reject(
      "INVALID_COMMAND",
      `Project title must contain between 1 and ${MAXIMUM_PROJECT_TITLE_LENGTH} characters.`,
      command.type,
    );
  }

  if (title === state.title) {
    return state;
  }

  return {
    ...state,
    title,
  };
}

function applyUpdateMasterGain(
  state: ProjectState,
  command: UpdateMasterGainCommand,
): ProjectState {
  if (
    !Number.isFinite(command.gain)
    || command.gain < MINIMUM_MASTER_GAIN
    || command.gain > MAXIMUM_MASTER_GAIN
  ) {
    reject(
      "INVALID_COMMAND",
      `Master gain must be between ${MINIMUM_MASTER_GAIN} and ${MAXIMUM_MASTER_GAIN}.`,
      command.type,
    );
  }

  if (command.gain === state.masterBus.gain) {
    return state;
  }

  return {
    ...state,
    masterBus: {
      ...state.masterBus,
      gain: command.gain,
    },
  };
}

function applySetMasterMuted(
  state: ProjectState,
  command: SetMasterMutedCommand,
): ProjectState {
  if (typeof command.muted !== "boolean") {
    reject(
      "INVALID_COMMAND",
      "Master mute state must be a boolean.",
      command.type,
    );
  }

  if (command.muted === state.masterBus.muted) {
    return state;
  }

  return {
    ...state,
    masterBus: {
      ...state.masterBus,
      muted: command.muted,
    },
  };
}

function applyUpdateMasterTuning(
  state: ProjectState,
  command: UpdateMasterTuningCommand,
): ProjectState {
  if (
    !Number.isFinite(command.tuningFrequencyHz)
    || command.tuningFrequencyHz
      < MINIMUM_MASTER_TUNING_FREQUENCY_HZ
    || command.tuningFrequencyHz
      > MAXIMUM_MASTER_TUNING_FREQUENCY_HZ
  ) {
    reject(
      "INVALID_COMMAND",
      `Master tuning must be between ${MINIMUM_MASTER_TUNING_FREQUENCY_HZ} and ${MAXIMUM_MASTER_TUNING_FREQUENCY_HZ} Hz.`,
      command.type,
    );
  }

  if (
    command.tuningFrequencyHz
    === state.masterBus.tuningFrequencyHz
  ) {
    return state;
  }

  return {
    ...state,
    masterBus: {
      ...state.masterBus,
      tuningFrequencyHz: command.tuningFrequencyHz,
    },
  };
}

function applyUpdateClipVoiceState(
  state: ActiveClipProjectState,
  command: UpdateClipVoiceStateCommand,
): ActiveClipProjectState {
  requireVoice(state, command.voiceId, command.type);
  const current = state.voiceStatesById[command.voiceId];

  if (current === undefined) {
    reject(
      "VOICE_NOT_FOUND",
      `Voice state "${command.voiceId}" does not exist in the active clip.`,
      command.type,
    );
  }

  const updated: ClipVoiceState = {
    ...current,
    ...command.changes,
  };

  assertValidClipVoiceState(
    updated,
    command.type,
    `Active clip voice "${command.voiceId}"`,
  );

  if (
    updated.gain === current.gain
    && updated.muted === current.muted
    && updated.locked === current.locked
    && updated.solo === current.solo
    && updated.instrument === current.instrument
  ) {
    return state;
  }

  return {
    ...state,
    voiceStatesById: {
      ...state.voiceStatesById,
      [command.voiceId]: updated,
    },
  };
}

function assertValidClipVoiceState(
  state: ClipVoiceState,
  commandType: PianoRollCommand["type"],
  context: string,
): void {
  if (
    !Number.isFinite(state.gain)
    || state.gain < MINIMUM_MASTER_GAIN
    || state.gain > MAXIMUM_MASTER_GAIN
    || typeof state.muted !== "boolean"
    || typeof state.locked !== "boolean"
    || typeof state.solo !== "boolean"
  ) {
    reject(
      "INVALID_COMMAND",
      `${context} has invalid volume, mute, lock, or solo state.`,
      commandType,
    );
  }

  assertValidInstrumentConfig(state.instrument);
}

function applyInsertMeasure(
  state: ActiveClipProjectState,
  command: InsertMeasureCommand,
): ActiveClipProjectState {
  assertMeasureIndex(
    command.measureIndex,
    state.measureCount,
    command.type,
  );

  if (state.measureCount >= MAXIMUM_MEASURE_COUNT) {
    reject(
      "INVALID_COMMAND",
      `A project cannot contain more than ${MAXIMUM_MEASURE_COUNT} measures.`,
      command.type,
    );
  }

  assertValidProjectDuration(
    state.measureCount + 1,
    state.transportSettings,
  );

  const measureTicks = getTicksPerMeasure(
    state.transportSettings,
  );
  const insertionTick =
    command.measureIndex * measureTicks;
  const tracksByVoiceId = transformTracksForInsertedTime(
    state,
    insertionTick,
    measureTicks,
  );
  const transportSettings = insertTimeIntoTransport(
    state.transportSettings,
    insertionTick,
    measureTicks,
  );

  assertValidTransportState(transportSettings);

  return {
    ...state,
    measureCount: state.measureCount + 1,
    tracksByVoiceId,
    transportSettings,
  };
}

function applyRemoveMeasure(
  state: ActiveClipProjectState,
  command: RemoveMeasureCommand,
): ActiveClipProjectState {
  assertMeasureIndex(
    command.measureIndex,
    state.measureCount,
    command.type,
  );

  if (state.measureCount <= MINIMUM_MEASURE_COUNT) {
    reject(
      "INVALID_COMMAND",
      `A project must contain at least ${MINIMUM_MEASURE_COUNT} measure.`,
      command.type,
    );
  }

  const measureTicks = getTicksPerMeasure(
    state.transportSettings,
  );
  const removalStartTick = command.measureIndex * measureTicks;
  const removalEndTick = removalStartTick + measureTicks;
  const tracksByVoiceId = transformTracksForRemovedTime(
    state,
    removalStartTick,
    removalEndTick,
  );
  const transportSettings = removeTimeFromTransport(
    state.transportSettings,
    removalStartTick,
    removalEndTick,
    (state.measureCount - 1) * measureTicks,
  );

  assertValidTransportState(transportSettings);

  return {
    ...state,
    measureCount: state.measureCount - 1,
    tracksByVoiceId,
    transportSettings,
  };
}

function applyAppendMeasures(
  state: ActiveClipProjectState,
  command: AppendMeasuresCommand,
): ActiveClipProjectState {
  if (!Number.isSafeInteger(command.count) || command.count <= 0) {
    reject(
      "INVALID_COMMAND",
      "The appended measure count must be a positive safe integer.",
      command.type,
    );
  }

  const measureCount = state.measureCount + command.count;

  if (measureCount > MAXIMUM_MEASURE_COUNT) {
    reject(
      "INVALID_COMMAND",
      `A project cannot contain more than ${MAXIMUM_MEASURE_COUNT} measures.`,
      command.type,
    );
  }

  assertValidProjectDuration(measureCount, state.transportSettings);

  return {
    ...state,
    measureCount,
  };
}

function applyAddNotes(
  state: ActiveClipProjectState,
  command: AddNotesCommand,
): ActiveClipProjectState {
  const track = requireTrack(state, command.trackVoiceId, command.type);
  assertVoiceEditable(state, command.trackVoiceId, command.type);
  const commandNoteIds = new Set<NoteId>();
  const acceptedNotes: Note[] = [];

  if (
    command.notes.length
    > MAXIMUM_CLIP_NOTE_COUNT - countClipNotes(state)
  ) {
    reject(
      "INVALID_COMMAND",
      `A clip cannot contain more than ${MAXIMUM_CLIP_NOTE_COUNT} notes.`,
      command.type,
    );
  }

  for (const note of command.notes) {
    assertValidNoteForTrack(note, command.trackVoiceId);
    assertNoteWithinProject(state, note, command.type);

    if (commandNoteIds.has(note.id)) {
      reject(
        "DUPLICATE_NOTE_ID",
        `Note "${note.id}" appears more than once in the command.`,
        command.type,
      );
    }

    const existingVoiceId = findNoteVoiceId(state, note.id);

    if (existingVoiceId !== undefined) {
      reject(
        "NOTE_ALREADY_EXISTS",
        `Note "${note.id}" already exists in voice "${existingVoiceId}".`,
        command.type,
      );
    }

    for (const candidateId in track.notesById) {
      const candidate = track.notesById[candidateId];

      if (
        candidate !== undefined
        && notesOverlapInVoice(note, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Note "${note.id}" overlaps note "${candidate.id}" in voice "${command.trackVoiceId}".`,
          command.type,
        );
      }
    }

    for (
      let candidateIndex = 0;
      candidateIndex < acceptedNotes.length;
      candidateIndex += 1
    ) {
      const candidate = acceptedNotes[candidateIndex];

      if (
        candidate !== undefined
        && notesOverlapInVoice(note, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Added notes "${note.id}" and "${candidate.id}" overlap.`,
          command.type,
        );
      }
    }

    commandNoteIds.add(note.id);
    acceptedNotes.push(note);
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
  state: ActiveClipProjectState,
  command: MoveNotesCommand,
): ActiveClipProjectState {
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
  assertVoiceEditable(state, command.sourceVoiceId, command.type);

  if (command.targetVoiceId !== command.sourceVoiceId) {
    assertVoiceEditable(state, command.targetVoiceId, command.type);
  }

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
    assertNoteWithinProject(state, movedNote, command.type);

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

  const movedNoteIds = new Set(command.noteIds);

  for (
    let movedIndex = 0;
    movedIndex < movedNotes.length;
    movedIndex += 1
  ) {
    const movedNote = movedNotes[movedIndex];

    if (movedNote === undefined) {
      continue;
    }

    for (const candidateId in targetTrack.notesById) {
      const candidate = targetTrack.notesById[candidateId];

      if (
        candidate !== undefined
        && !(
          command.sourceVoiceId === command.targetVoiceId
          && movedNoteIds.has(candidate.id)
        )
        && notesOverlapInVoice(movedNote, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Note "${movedNote.id}" overlaps note "${candidate.id}" in voice "${command.targetVoiceId}".`,
          command.type,
        );
      }
    }

    if (command.sourceVoiceId !== command.targetVoiceId) {
      for (
        let candidateIndex = 0;
        candidateIndex < movedIndex;
        candidateIndex += 1
      ) {
        const candidate = movedNotes[candidateIndex];

        if (
          candidate !== undefined
          && notesOverlapInVoice(movedNote, candidate)
        ) {
          reject(
            "NOTE_OVERLAP",
            `Transferred notes "${movedNote.id}" and "${candidate.id}" overlap.`,
            command.type,
          );
        }
      }
    }
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

function applyRepositionNotes(
  state: ActiveClipProjectState,
  command: RepositionNotesCommand,
): ActiveClipProjectState {
  const track = requireTrack(
    state,
    command.trackVoiceId,
    command.type,
  );

  assertVoiceEditable(
    state,
    command.trackVoiceId,
    command.type,
  );

  const changedNoteIds = new Set<NoteId>();
  const updatedNotes: Note[] = [];
  let hasChanges = false;

  for (const change of command.changes) {
    if (changedNoteIds.has(change.noteId)) {
      reject(
        "DUPLICATE_NOTE_ID",
        `Note "${change.noteId}" appears more than once in the command.`,
        command.type,
      );
    }

    if (
      !Number.isSafeInteger(change.startTick)
      || !Number.isInteger(change.pitch)
    ) {
      reject(
        "INVALID_COMMAND",
        "Repositioned note coordinates must be integers.",
        command.type,
      );
    }

    const note = requireNote(
      track,
      change.noteId,
      command.type,
    );
    const updatedNote: Note = {
      ...note,
      startTick: change.startTick,
      pitch: change.pitch,
    };

    assertValidNoteForTrack(updatedNote, track.voiceId);
    assertNoteWithinProject(state, updatedNote, command.type);
    changedNoteIds.add(change.noteId);
    updatedNotes.push(updatedNote);

    if (
      updatedNote.startTick !== note.startTick
      || updatedNote.pitch !== note.pitch
    ) {
      hasChanges = true;
    }
  }

  if (updatedNotes.length === 0 || !hasChanges) {
    return state;
  }

  for (
    let updatedIndex = 0;
    updatedIndex < updatedNotes.length;
    updatedIndex += 1
  ) {
    const updatedNote = updatedNotes[updatedIndex];

    if (updatedNote === undefined) {
      continue;
    }

    for (const candidateId in track.notesById) {
      const candidate = track.notesById[candidateId];

      if (
        candidate !== undefined
        && !changedNoteIds.has(candidate.id)
        && notesOverlapInVoice(updatedNote, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Note "${updatedNote.id}" overlaps note "${candidate.id}" in voice "${command.trackVoiceId}".`,
          command.type,
        );
      }
    }

    for (
      let candidateIndex = 0;
      candidateIndex < updatedIndex;
      candidateIndex += 1
    ) {
      const candidate = updatedNotes[candidateIndex];

      if (
        candidate !== undefined
        && notesOverlapInVoice(updatedNote, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Repositioned notes "${updatedNote.id}" and "${candidate.id}" overlap.`,
          command.type,
        );
      }
    }
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

function applyResizeNotes(
  state: ActiveClipProjectState,
  command: ResizeNotesCommand,
): ActiveClipProjectState {
  const track = requireTrack(state, command.trackVoiceId, command.type);
  assertVoiceEditable(state, command.trackVoiceId, command.type);
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
    assertNoteWithinProject(state, updatedNote, command.type);
    changedNoteIds.add(change.noteId);
    updatedNotes.push(updatedNote);
  }

  if (updatedNotes.length === 0) {
    return state;
  }

  for (
    let updatedIndex = 0;
    updatedIndex < updatedNotes.length;
    updatedIndex += 1
  ) {
    const updatedNote = updatedNotes[updatedIndex];

    if (updatedNote === undefined) {
      continue;
    }

    for (const candidateId in track.notesById) {
      const candidate = track.notesById[candidateId];

      if (
        candidate !== undefined
        && !changedNoteIds.has(candidate.id)
        && notesOverlapInVoice(updatedNote, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Note "${updatedNote.id}" overlaps note "${candidate.id}" in voice "${command.trackVoiceId}".`,
          command.type,
        );
      }
    }

    for (
      let candidateIndex = 0;
      candidateIndex < updatedIndex;
      candidateIndex += 1
    ) {
      const candidate = updatedNotes[candidateIndex];

      if (
        candidate !== undefined
        && notesOverlapInVoice(updatedNote, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Resized notes "${updatedNote.id}" and "${candidate.id}" overlap.`,
          command.type,
        );
      }
    }
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

function applyTransformNotes(
  state: ActiveClipProjectState,
  command: TransformNotesCommand,
): ActiveClipProjectState {
  const track = requireTrack(state, command.trackVoiceId, command.type);
  assertVoiceEditable(state, command.trackVoiceId, command.type);
  const changedNoteIds = new Set<NoteId>();
  const updatedNotes: Note[] = [];
  let hasChanges = false;

  for (const change of command.changes) {
    if (changedNoteIds.has(change.noteId)) {
      reject(
        "DUPLICATE_NOTE_ID",
        `Note "${change.noteId}" appears more than once in the command.`,
        command.type,
      );
    }

    if (
      !Number.isSafeInteger(change.startTick)
      || !Number.isSafeInteger(change.durationTicks)
      || !Number.isInteger(change.pitch)
    ) {
      reject(
        "INVALID_COMMAND",
        "Transformed note coordinates and durations must be integers.",
        command.type,
      );
    }

    const note = requireNote(track, change.noteId, command.type);
    const updatedNote: Note = {
      ...note,
      startTick: change.startTick,
      durationTicks: change.durationTicks,
      pitch: change.pitch,
    };

    assertValidNoteForTrack(updatedNote, track.voiceId);
    assertNoteWithinProject(state, updatedNote, command.type);
    changedNoteIds.add(change.noteId);
    updatedNotes.push(updatedNote);

    if (
      updatedNote.startTick !== note.startTick
      || updatedNote.durationTicks !== note.durationTicks
      || updatedNote.pitch !== note.pitch
    ) {
      hasChanges = true;
    }
  }

  if (updatedNotes.length === 0 || !hasChanges) {
    return state;
  }

  for (
    let updatedIndex = 0;
    updatedIndex < updatedNotes.length;
    updatedIndex += 1
  ) {
    const updatedNote = updatedNotes[updatedIndex];

    if (updatedNote === undefined) {
      continue;
    }

    for (const candidateId in track.notesById) {
      const candidate = track.notesById[candidateId];

      if (
        candidate !== undefined
        && !changedNoteIds.has(candidate.id)
        && notesOverlapInVoice(updatedNote, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Note "${updatedNote.id}" overlaps note "${candidate.id}" in voice "${command.trackVoiceId}".`,
          command.type,
        );
      }
    }

    for (
      let candidateIndex = 0;
      candidateIndex < updatedIndex;
      candidateIndex += 1
    ) {
      const candidate = updatedNotes[candidateIndex];

      if (
        candidate !== undefined
        && notesOverlapInVoice(updatedNote, candidate)
      ) {
        reject(
          "NOTE_OVERLAP",
          `Transformed notes "${updatedNote.id}" and "${candidate.id}" overlap.`,
          command.type,
        );
      }
    }
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

function applySliceNotes(
  state: ActiveClipProjectState,
  command: SliceNotesCommand,
): ActiveClipProjectState {
  const track = requireTrack(state, command.trackVoiceId, command.type);
  assertVoiceEditable(state, command.trackVoiceId, command.type);

  if (!Number.isSafeInteger(command.sliceTick)) {
    reject(
      "INVALID_COMMAND",
      "The note slice tick must be an integer.",
      command.type,
    );
  }

  if (
    command.slices.length
    > MAXIMUM_CLIP_NOTE_COUNT - countClipNotes(state)
  ) {
    reject(
      "INVALID_COMMAND",
      `A clip cannot contain more than ${MAXIMUM_CLIP_NOTE_COUNT} notes.`,
      command.type,
    );
  }

  const sourceNoteIds = new Set<NoteId>();
  const rightNoteIds = new Set<NoteId>();
  const leftNotes: Note[] = [];
  const rightNotes: Note[] = [];

  for (const slice of command.slices) {
    if (sourceNoteIds.has(slice.noteId)) {
      reject(
        "DUPLICATE_NOTE_ID",
        `Note "${slice.noteId}" appears more than once in the command.`,
        command.type,
      );
    }

    if (
      slice.rightNoteId === slice.noteId
      || rightNoteIds.has(slice.rightNoteId)
      || findNoteVoiceId(state, slice.rightNoteId) !== undefined
    ) {
      reject(
        "NOTE_ALREADY_EXISTS",
        `Right-hand note ID "${slice.rightNoteId}" is already in use.`,
        command.type,
      );
    }

    const note = requireNote(track, slice.noteId, command.type);
    const noteEndTick = note.startTick + note.durationTicks;

    if (
      command.sliceTick <= note.startTick
      || command.sliceTick >= noteEndTick
    ) {
      reject(
        "INVALID_COMMAND",
        `Note "${note.id}" does not cross the slice tick.`,
        command.type,
      );
    }

    const leftNote: Note = {
      ...note,
      durationTicks: command.sliceTick - note.startTick,
    };
    const rightNote: Note = {
      ...note,
      id: slice.rightNoteId,
      startTick: command.sliceTick,
      durationTicks: noteEndTick - command.sliceTick,
    };

    assertValidNoteForTrack(leftNote, track.voiceId);
    assertValidNoteForTrack(rightNote, track.voiceId);
    sourceNoteIds.add(slice.noteId);
    rightNoteIds.add(slice.rightNoteId);
    leftNotes.push(leftNote);
    rightNotes.push(rightNote);
  }

  if (leftNotes.length === 0) {
    return state;
  }

  const notesById: Record<NoteId, Note> = {
    ...track.notesById,
  };

  for (
    let noteIndex = 0;
    noteIndex < leftNotes.length;
    noteIndex += 1
  ) {
    const leftNote = leftNotes[noteIndex];
    const rightNote = rightNotes[noteIndex];

    if (leftNote !== undefined && rightNote !== undefined) {
      notesById[leftNote.id] = leftNote;
      notesById[rightNote.id] = rightNote;
    }
  }

  return replaceTrack(state, {
    ...track,
    notesById,
  });
}

function applyDeleteNotes(
  state: ActiveClipProjectState,
  command: DeleteNotesCommand,
): ActiveClipProjectState {
  const track = requireTrack(state, command.trackVoiceId, command.type);
  assertVoiceEditable(state, command.trackVoiceId, command.type);
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

function applySetNotesEnabled(
  state: ActiveClipProjectState,
  command: SetNotesEnabledCommand,
): ActiveClipProjectState {
  const track = requireTrack(state, command.trackVoiceId, command.type);

  assertVoiceEditable(state, command.trackVoiceId, command.type);
  assertUniqueNoteIds(command.noteIds, command.type);

  if (typeof command.enabled !== "boolean") {
    reject(
      "INVALID_COMMAND",
      "Note enabled state must be a boolean.",
      command.type,
    );
  }

  let notesById: Record<NoteId, Note> | null = null;

  for (const noteId of command.noteIds) {
    const note = requireNote(track, noteId, command.type);

    if (note.enabled === command.enabled) {
      continue;
    }

    if (notesById === null) {
      notesById = {
        ...track.notesById,
      };
    }

    notesById[noteId] = {
      ...note,
      enabled: command.enabled,
    };
  }

  if (notesById === null) {
    return state;
  }

  return replaceTrack(state, {
    ...track,
    notesById,
  });
}

function applyUpdateTempo(
  state: ActiveClipProjectState,
  command: UpdateTempoCommand,
): ActiveClipProjectState {
  const transportSettings = {
    ...state.transportSettings,
    bpm: command.bpm,
  };

  assertValidTransportState(transportSettings);
  assertValidProjectDuration(state.measureCount, transportSettings);

  if (transportSettings.bpm === state.transportSettings.bpm) {
    return state;
  }

  return {
    ...state,
    transportSettings,
  };
}

function applyUpdateTimeSignature(
  state: ActiveClipProjectState,
  command: UpdateTimeSignatureCommand,
): ActiveClipProjectState {
  const transportSettings = {
    ...state.transportSettings,
    timeSignature: command.timeSignature,
  };

  assertValidTransportState(transportSettings);
  assertValidProjectDuration(state.measureCount, transportSettings);

  if (
    command.timeSignature.numerator
      === state.transportSettings.timeSignature.numerator
    && command.timeSignature.denominator
      === state.transportSettings.timeSignature.denominator
  ) {
    return state;
  }

  return trimProjectToDuration({
    ...state,
    transportSettings,
  });
}

function applyUpdateLoop(
  state: ActiveClipProjectState,
  command: UpdateLoopCommand,
): ActiveClipProjectState {
  const transportSettings = {
    ...state.transportSettings,
    loop: command.loop,
  };

  assertValidTransportState(transportSettings);
  assertTransportWithinProjectDuration(
    state,
    transportSettings,
    command.type,
  );

  if (
    command.loop.startTick === state.transportSettings.loop.startTick
    && command.loop.endTick === state.transportSettings.loop.endTick
  ) {
    return state;
  }

  return {
    ...state,
    transportSettings,
  };
}

function applySetLoopEnabled(
  state: ActiveClipProjectState,
  command: SetLoopEnabledCommand,
): ActiveClipProjectState {
  if (typeof command.enabled !== "boolean") {
    reject(
      "INVALID_COMMAND",
      "Loop enabled state must be a boolean.",
      command.type,
    );
  }

  if (command.enabled === state.transportSettings.loopEnabled) {
    return state;
  }

  return {
    ...state,
    transportSettings: {
      ...state.transportSettings,
      loopEnabled: command.enabled,
    },
  };
}

function transformTracksForInsertedTime(
  state: ActiveClipProjectState,
  insertionTick: number,
  insertedTicks: number,
): Clip["tracksByVoiceId"] {
  let tracksByVoiceId = state.tracksByVoiceId;

  for (
    let voiceIndex = 0;
    voiceIndex < state.voiceOrder.length;
    voiceIndex += 1
  ) {
    const voiceId = state.voiceOrder[voiceIndex];
    const track =
      voiceId === undefined
        ? undefined
        : state.tracksByVoiceId[voiceId];

    if (voiceId === undefined || track === undefined) {
      continue;
    }

    let notesById: Record<NoteId, Note> | null = null;

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];

      if (note === undefined) {
        continue;
      }

      let updatedNote: Note | null = null;

      if (note.startTick >= insertionTick) {
        updatedNote = {
          ...note,
          startTick: note.startTick + insertedTicks,
        };
      } else if (
        note.startTick + note.durationTicks > insertionTick
      ) {
        updatedNote = {
          ...note,
          durationTicks: note.durationTicks + insertedTicks,
        };
      }

      if (updatedNote === null) {
        continue;
      }

      if (notesById === null) {
        notesById = {
          ...track.notesById,
        };
      }

      notesById[noteId] = updatedNote;
    }

    if (notesById === null) {
      continue;
    }

    if (tracksByVoiceId === state.tracksByVoiceId) {
      tracksByVoiceId = {
        ...state.tracksByVoiceId,
      };
    }

    tracksByVoiceId = {
      ...tracksByVoiceId,
      [voiceId]: {
        ...track,
        notesById,
      },
    };
  }

  return tracksByVoiceId;
}

function transformTracksForRemovedTime(
  state: ActiveClipProjectState,
  removalStartTick: number,
  removalEndTick: number,
): Clip["tracksByVoiceId"] {
  let tracksByVoiceId = state.tracksByVoiceId;

  for (
    let voiceIndex = 0;
    voiceIndex < state.voiceOrder.length;
    voiceIndex += 1
  ) {
    const voiceId = state.voiceOrder[voiceIndex];
    const track =
      voiceId === undefined
        ? undefined
        : state.tracksByVoiceId[voiceId];

    if (voiceId === undefined || track === undefined) {
      continue;
    }

    let notesById: Record<NoteId, Note> | null = null;

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];

      if (note === undefined) {
        continue;
      }

      const originalEndTick =
        note.startTick + note.durationTicks;
      const startTick = collapseTickForRemovedTime(
        note.startTick,
        removalStartTick,
        removalEndTick,
      );
      const endTick = collapseTickForRemovedTime(
        originalEndTick,
        removalStartTick,
        removalEndTick,
      );

      if (
        startTick === note.startTick
        && endTick === originalEndTick
      ) {
        continue;
      }

      if (notesById === null) {
        notesById = {
          ...track.notesById,
        };
      }

      if (endTick <= startTick) {
        delete notesById[noteId];
      } else {
        notesById[noteId] = {
          ...note,
          startTick,
          durationTicks: endTick - startTick,
        };
      }
    }

    if (notesById === null) {
      continue;
    }

    if (tracksByVoiceId === state.tracksByVoiceId) {
      tracksByVoiceId = {
        ...state.tracksByVoiceId,
      };
    }

    tracksByVoiceId = {
      ...tracksByVoiceId,
      [voiceId]: {
        ...track,
        notesById,
      },
    };
  }

  return tracksByVoiceId;
}

function insertTimeIntoTransport(
  transport: TransportState,
  insertionTick: number,
  insertedTicks: number,
): TransportState {
  const anchorTick =
    transport.anchorTick >= insertionTick
      ? transport.anchorTick + insertedTicks
      : transport.anchorTick;

  if (anchorTick === transport.anchorTick) {
    return transport;
  }

  return {
    ...transport,
    anchorTick,
  };
}

function removeTimeFromTransport(
  transport: TransportState,
  removalStartTick: number,
  removalEndTick: number,
  projectDurationTicks: number,
): TransportState {
  const anchorTick = collapseTickForRemovedTime(
    transport.anchorTick,
    removalStartTick,
    removalEndTick,
  );
  const loop = fitLoopRegionToProject(
    transport.loop,
    projectDurationTicks,
  );

  if (
    anchorTick === transport.anchorTick
    && loop.startTick === transport.loop.startTick
    && loop.endTick === transport.loop.endTick
  ) {
    return transport;
  }

  return {
    ...transport,
    anchorTick,
    loop,
  };
}

function collapseTickForRemovedTime(
  tick: number,
  removalStartTick: number,
  removalEndTick: number,
): number {
  if (tick <= removalStartTick) {
    return tick;
  }

  if (tick >= removalEndTick) {
    return tick - removalEndTick + removalStartTick;
  }

  return removalStartTick;
}

function createFallbackLoopRegion(
  preferredStartTick: number,
  preferredDurationTicks: number,
  projectDurationTicks: number,
): LoopRegion {
  const durationTicks = Math.max(
    1,
    Math.min(preferredDurationTicks, projectDurationTicks),
  );
  const startTick = Math.min(
    preferredStartTick,
    projectDurationTicks - durationTicks,
  );

  return {
    startTick,
    endTick: startTick + durationTicks,
  };
}

function fitLoopRegionToProject(
  loop: LoopRegion,
  projectDurationTicks: number,
): LoopRegion {
  if (loop.endTick <= projectDurationTicks) {
    return loop;
  }

  if (loop.startTick < projectDurationTicks) {
    return {
      startTick: loop.startTick,
      endTick: projectDurationTicks,
    };
  }

  return createFallbackLoopRegion(
    projectDurationTicks,
    loop.endTick - loop.startTick,
    projectDurationTicks,
  );
}

function assertMeasureIndex(
  measureIndex: number,
  measureCount: number,
  commandType: PianoRollCommand["type"],
): void {
  if (
    !Number.isSafeInteger(measureIndex)
    || measureIndex < 0
    || measureIndex >= measureCount
  ) {
    reject(
      "INVALID_COMMAND",
      `Measure index must be between 0 and ${measureCount - 1}.`,
      commandType,
    );
  }
}

function replaceTrack(
  state: ActiveClipProjectState,
  track: Track,
): ActiveClipProjectState {
  return {
    ...state,
    tracksByVoiceId: {
      ...state.tracksByVoiceId,
      [track.voiceId]: track,
    },
  };
}

function assertNoteWithinProject(
  state: ActiveClipProjectState,
  note: Note,
  commandType: PianoRollCommand["type"],
): void {
  const projectDurationTicks = getClipContextDurationTicks(state);

  if (
    note.startTick + note.durationTicks
      > projectDurationTicks
  ) {
    reject(
      "INVALID_COMMAND",
      `Note "${note.id}" exceeds the clip duration.`,
      commandType,
    );
  }
}

function notesOverlapInVoice(left: Note, right: Note): boolean {
  return (
    left.voiceId === right.voiceId
    && left.pitch === right.pitch
    && left.startTick
      < right.startTick + right.durationTicks
    && right.startTick
      < left.startTick + left.durationTicks
  );
}

function getClipContextDurationTicks(
  state: ActiveClipProjectState,
): number {
  return state.measureCount * getTicksPerMeasure(state.transportSettings);
}

function trimProjectToDuration(
  state: ActiveClipProjectState,
): ActiveClipProjectState {
  const projectDurationTicks = getClipContextDurationTicks(state);
  let tracksByVoiceId = state.tracksByVoiceId;
  let tracksChanged = false;

  for (
    let voiceIndex = 0;
    voiceIndex < state.voiceOrder.length;
    voiceIndex += 1
  ) {
    const voiceId = state.voiceOrder[voiceIndex];

    if (voiceId === undefined) {
      continue;
    }

    const track = state.tracksByVoiceId[voiceId];

    if (track === undefined) {
      continue;
    }

    let notesChanged = false;
    const notesById: Record<NoteId, Note> = {};

    for (const noteId in track.notesById) {
      const note = track.notesById[noteId];

      if (note === undefined) {
        continue;
      }

      if (
        note.startTick + note.durationTicks
        <= projectDurationTicks
      ) {
        notesById[note.id] = note;
      } else {
        notesChanged = true;
      }
    }

    if (!notesChanged) {
      continue;
    }

    if (!tracksChanged) {
      tracksByVoiceId = {
        ...state.tracksByVoiceId,
      };
      tracksChanged = true;
    }

    tracksByVoiceId = {
      ...tracksByVoiceId,
      [voiceId]: {
        ...track,
        notesById,
      },
    };
  }

  const transport = state.transportSettings;
  const anchorTick = Math.min(
    transport.anchorTick,
    projectDurationTicks,
  );
  const loop = fitLoopRegionToProject(
    transport.loop,
    projectDurationTicks,
  );
  const transportChanged =
    anchorTick !== transport.anchorTick
    || loop.startTick !== transport.loop.startTick
    || loop.endTick !== transport.loop.endTick;

  if (!tracksChanged && !transportChanged) {
    return state;
  }

  return {
    ...state,
    tracksByVoiceId,
    transportSettings: transportChanged
      ? {
          ...transport,
          anchorTick,
          loop,
        }
      : transport,
  };
}

function requireVoice(
  state: Pick<ProjectState, "voicesById">,
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
  state: ActiveClipProjectState,
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

function assertVoiceEditable(
  state: Pick<ProjectState, "voicesById"> & Pick<Clip, "voiceStatesById">,
  voiceId: VoiceId,
  commandType: PianoRollCommand["type"],
): void {
  requireVoice(state, voiceId, commandType);

  if (state.voiceStatesById[voiceId]?.locked !== false) {
    reject(
      "VOICE_LOCKED",
      `Voice "${voiceId}" is locked.`,
      commandType,
    );
  }
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

function findNoteVoiceId(
  state: ActiveClipProjectState,
  noteId: NoteId,
): VoiceId | undefined {
  for (const voiceId in state.tracksByVoiceId) {
    const track = state.tracksByVoiceId[voiceId];

    if (
      track !== undefined
      && hasOwn(track.notesById, noteId)
    ) {
      return voiceId;
    }
  }

  return undefined;
}

function countClipNotes(state: ActiveClipProjectState): number {
  let noteCount = 0;

  for (const voiceId in state.tracksByVoiceId) {
    const track = state.tracksByVoiceId[voiceId];

    if (track !== undefined) {
      noteCount += Object.keys(track.notesById).length;
    }
  }

  return noteCount;
}

function assertTransportWithinProjectDuration(
  state: ActiveClipProjectState,
  transport: TransportState,
  commandType: PianoRollCommand["type"],
): void {
  assertValidProjectDuration(state.measureCount, transport);
  const projectDurationTicks =
    state.measureCount * getTicksPerMeasure(transport);

  if (transport.anchorTick > projectDurationTicks) {
    reject(
      "INVALID_COMMAND",
      "Transport anchor cannot exceed the clip duration.",
      commandType,
    );
  }

  if (transport.loop.endTick > projectDurationTicks) {
    reject(
      "INVALID_COMMAND",
      "Loop region cannot exceed the clip duration.",
      commandType,
    );
  }
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
