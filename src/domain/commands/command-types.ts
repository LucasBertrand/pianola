import {
  type Clip,
  type ClipInstrumentState,
} from "../clips/clip";
import {
  type ClipId,
  type InstrumentId,
  type NoteId,
  type Tick,
} from "../identifiers";
import {
  type EffectDescriptor,
  type GenerativeRuleDescriptor,
  type InstrumentConfig,
  type ProjectInstrument,
  type ProjectInstrumentInterpretation,
} from "../instruments/instrument";
import {
  type LoopRegion,
  type TimeSignature,
} from "../transport/transport";
import {
  type Note,
} from "../notes/note";

export interface AddProjectInstrumentCommand {
  readonly type: "AddProjectInstrument";
  readonly instrument: ProjectInstrument;
  readonly clipInstrumentStatesById: Readonly<Record<ClipId, ClipInstrumentState>>;
}

export interface UpdateProjectInstrumentChanges {
  readonly name?: string;
  readonly color?: string;
  readonly instrument?: InstrumentConfig;
  readonly gain?: number;
  readonly muted?: boolean;
  readonly solo?: boolean;
  readonly pan?: number;
  readonly effects?: readonly EffectDescriptor[];
  readonly generativeRules?: readonly GenerativeRuleDescriptor[];
  readonly interpretation?: ProjectInstrumentInterpretation;
}

export interface UpdateProjectInstrumentCommand {
  readonly type: "UpdateProjectInstrument";
  readonly instrumentId: InstrumentId;
  readonly changes: UpdateProjectInstrumentChanges;
}

export interface DeleteProjectInstrumentCommand {
  readonly type: "DeleteProjectInstrument";
  readonly instrumentId: InstrumentId;
}

export interface ReorderProjectInstrumentsCommand {
  readonly type: "ReorderProjectInstruments";
  readonly instrumentOrder: readonly InstrumentId[];
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
  readonly clipId: ClipId;
  readonly measureIndex: number;
}

export interface RemoveMeasureCommand {
  readonly type: "RemoveMeasure";
  readonly clipId: ClipId;
  readonly measureIndex: number;
}

export interface UpdateClipInstrumentStateCommand {
  readonly type: "UpdateClipInstrumentState";
  readonly clipId: ClipId;
  readonly instrumentId: InstrumentId;
  readonly changes: Partial<ClipInstrumentState>;
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

export interface AppendMeasuresCommand {
  readonly type: "AppendMeasures";
  readonly clipId: ClipId;
  readonly count: number;
}

export interface AddNotesCommand {
  readonly type: "AddNotes";
  readonly clipId: ClipId;
  readonly trackInstrumentId: InstrumentId;
  readonly notes: readonly Note[];
}

export interface MoveNotesCommand {
  readonly type: "MoveNotes";
  readonly clipId: ClipId;
  readonly sourceInstrumentId: InstrumentId;
  readonly targetInstrumentId: InstrumentId;
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
  readonly clipId: ClipId;
  readonly trackInstrumentId: InstrumentId;
  readonly changes: readonly NotePositionChange[];
}

export interface NoteDurationChange {
  readonly noteId: NoteId;
  readonly startTick?: Tick;
  readonly durationTicks: Tick;
}

export interface ResizeNotesCommand {
  readonly type: "ResizeNotes";
  readonly clipId: ClipId;
  readonly trackInstrumentId: InstrumentId;
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
  readonly clipId: ClipId;
  readonly trackInstrumentId: InstrumentId;
  readonly changes: readonly NoteTransformChange[];
}

export interface NoteSliceDescriptor {
  readonly noteId: NoteId;
  readonly rightNoteId: NoteId;
}

export interface SliceNotesCommand {
  readonly type: "SliceNotes";
  readonly clipId: ClipId;
  readonly trackInstrumentId: InstrumentId;
  readonly sliceTick: Tick;
  readonly slices: readonly NoteSliceDescriptor[];
}

export interface DeleteNotesCommand {
  readonly type: "DeleteNotes";
  readonly clipId: ClipId;
  readonly trackInstrumentId: InstrumentId;
  readonly noteIds: readonly NoteId[];
}

export interface SetNotesEnabledCommand {
  readonly type: "SetNotesEnabled";
  readonly clipId: ClipId;
  readonly trackInstrumentId: InstrumentId;
  readonly noteIds: readonly NoteId[];
  readonly enabled: boolean;
}

export interface UpdateTempoCommand {
  readonly type: "UpdateTempo";
  readonly bpm: number;
}

export interface UpdateTimeSignatureCommand {
  readonly type: "UpdateTimeSignature";
  readonly clipId: ClipId;
  readonly timeSignature: TimeSignature;
}

export interface UpdateLoopCommand {
  readonly type: "UpdateLoop";
  readonly clipId: ClipId;
  readonly loop: LoopRegion;
}

export interface SetLoopEnabledCommand {
  readonly type: "SetLoopEnabled";
  readonly clipId: ClipId;
  readonly enabled: boolean;
}

export type PianoRollCommand =
  | AddClipCommand
  | DeleteClipCommand
  | ReorderClipsCommand
  | RenameClipCommand
  | AddProjectInstrumentCommand
  | UpdateProjectInstrumentCommand
  | UpdateClipInstrumentStateCommand
  | DeleteProjectInstrumentCommand
  | ReorderProjectInstrumentsCommand
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
