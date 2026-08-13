import type { Note, ProjectInstrument, TimeSignature } from "../../domain/model";
import type { MidiEvent } from "./standard-midi-file";

export type MidiImportCollisionStrategy = "merge" | "slice";

export interface MidiImportInstrumentCandidate {
  readonly projectInstrument: ProjectInstrument;
  readonly notes: readonly Note[];
}

export interface MidiImportAnalysis {
  readonly title: string;
  readonly sourceFormat: 0 | 1;
  readonly sourceTicksPerQuarterNote: number;
  readonly tempoBpm: number;
  readonly timeSignature: TimeSignature;
  readonly timelineEndTick: number;
  readonly instrumentCandidates: readonly MidiImportInstrumentCandidate[];
  readonly noteCount: number;
  readonly collisionCount: number;
  readonly ignoredControlChangeCount: number;
  readonly ignoredSustainControlChangeCount: number;
  readonly warnings: readonly string[];
}

export interface ActiveMidiNote {
  readonly startTick: number;
  readonly velocity: number;
  readonly sourceOrder: number;
}

export interface ActiveMidiNoteQueue {
  readonly notes: ActiveMidiNote[];
  headIndex: number;
}

export interface ImportedSourceNote {
  readonly pitch: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly velocity: number;
  readonly sourceOrder: number;
}

export interface MutableInstrumentGroup {
  readonly trackIndex: number;
  readonly channel: number;
  readonly activeNotesByPitch: Map<number, ActiveMidiNoteQueue>;
  readonly sourceNotes: ImportedSourceNote[];
  trackName: string;
  maximumTrackTick: number;
}

export interface TempoCandidate {
  readonly event: Extract<MidiEvent, { readonly kind: "tempo" }>;
  readonly trackIndex: number;
  readonly eventIndex: number;
}

export interface TimeSignatureCandidate {
  readonly event: Extract<
    MidiEvent,
    { readonly kind: "time-signature" }
  >;
  readonly trackIndex: number;
  readonly eventIndex: number;
}

export interface SliceHeapEntry {
  readonly note: Note;
  readonly endTick: number;
}

export interface ResolvedFragment {
  readonly note: Note;
  readonly sourceNoteId: string;
}

