/**
 * Standard MIDI File data kept independent from the application domain.
 *
 * Events use absolute ticks. This keeps import analysis straightforward and
 * lets the writer establish deterministic ordering before encoding deltas.
 */

export type MidiFileFormat = 0 | 1;
export type MidiChannel = number;
export type MidiDataByte = number;

export interface MidiEventBase {
  readonly absoluteTick: number;
}

export interface MidiNoteOffEvent extends MidiEventBase {
  readonly kind: "note-off";
  readonly channel: MidiChannel;
  readonly note: MidiDataByte;
  readonly velocity: MidiDataByte;
}

export interface MidiNoteOnEvent extends MidiEventBase {
  readonly kind: "note-on";
  readonly channel: MidiChannel;
  readonly note: MidiDataByte;
  readonly velocity: MidiDataByte;
}

export interface MidiPolyphonicKeyPressureEvent extends MidiEventBase {
  readonly kind: "polyphonic-key-pressure";
  readonly channel: MidiChannel;
  readonly note: MidiDataByte;
  readonly pressure: MidiDataByte;
}

export interface MidiControlChangeEvent extends MidiEventBase {
  readonly kind: "control-change";
  readonly channel: MidiChannel;
  readonly controller: MidiDataByte;
  readonly value: MidiDataByte;
}

export interface MidiProgramChangeEvent extends MidiEventBase {
  readonly kind: "program-change";
  readonly channel: MidiChannel;
  readonly program: MidiDataByte;
}

export interface MidiChannelPressureEvent extends MidiEventBase {
  readonly kind: "channel-pressure";
  readonly channel: MidiChannel;
  readonly pressure: MidiDataByte;
}

export interface MidiPitchBendEvent extends MidiEventBase {
  readonly kind: "pitch-bend";
  readonly channel: MidiChannel;
  /**
   * Unsigned fourteen-bit MIDI value. The centered position is 8192.
   */
  readonly value: number;
}

export interface MidiTempoEvent extends MidiEventBase {
  readonly kind: "tempo";
  readonly microsecondsPerQuarterNote: number;
}

export interface MidiTimeSignatureEvent extends MidiEventBase {
  readonly kind: "time-signature";
  readonly numerator: number;
  readonly denominator: number;
  readonly midiClocksPerMetronome: number;
  readonly thirtySecondNotesPerQuarter: number;
}

export interface MidiTrackNameEvent extends MidiEventBase {
  readonly kind: "track-name";
  readonly text: string;
}

export interface MidiEndOfTrackEvent extends MidiEventBase {
  readonly kind: "end-of-track";
}

export type MidiChannelEvent =
  | MidiNoteOffEvent
  | MidiNoteOnEvent
  | MidiPolyphonicKeyPressureEvent
  | MidiControlChangeEvent
  | MidiProgramChangeEvent
  | MidiChannelPressureEvent
  | MidiPitchBendEvent;

export type MidiMetaEvent =
  | MidiTempoEvent
  | MidiTimeSignatureEvent
  | MidiTrackNameEvent
  | MidiEndOfTrackEvent;

export type MidiEvent = MidiChannelEvent | MidiMetaEvent;

export interface MidiTrack {
  readonly events: readonly MidiEvent[];
}

export interface MidiFile {
  readonly format: MidiFileFormat;
  readonly ticksPerQuarterNote: number;
  readonly tracks: readonly MidiTrack[];
}

export interface MidiTrackReadSummary {
  /** All decoded, skipped, and end-of-track events encountered in the chunk. */
  readonly parsedEventCount: number;
  readonly decodedEventCount: number;
  readonly channelEventCount: number;
  readonly noteEventCount: number;
  readonly controlChangeCount: number;
  readonly sustainControlChangeCount: number;
  readonly skippedSystemExclusiveEventCount: number;
  readonly skippedUnknownMetaEventCount: number;
  readonly endedByEndOfTrackEvent: boolean;
}

export interface MidiReadSummary {
  readonly parsedEventCount: number;
  readonly decodedEventCount: number;
  readonly channelEventCount: number;
  readonly noteEventCount: number;
  readonly controlChangeCount: number;
  readonly sustainControlChangeCount: number;
  readonly skippedSystemExclusiveEventCount: number;
  readonly skippedUnknownMetaEventCount: number;
  readonly tracks: readonly MidiTrackReadSummary[];
}

export interface ParsedMidiFile extends MidiFile {
  readonly summary: MidiReadSummary;
}

export interface MidiReadLimits {
  readonly maximumFileBytes: number;
  readonly maximumTrackCount: number;
  readonly maximumTrackBytes: number;
  readonly maximumEventsPerTrack: number;
  readonly maximumTotalEvents: number;
  readonly maximumEventPayloadBytes: number;
  readonly maximumTextBytes: number;
}

export interface MidiWriteLimits {
  readonly maximumTrackCount: number;
  readonly maximumEventsPerTrack: number;
  readonly maximumTotalEvents: number;
  readonly maximumTextBytes: number;
  readonly maximumOutputBytes: number;
}
