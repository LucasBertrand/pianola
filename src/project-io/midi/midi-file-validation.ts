import { MidiCodecError } from "./midi-codec-error";
import {
  MIDI_CONSTANTS,
} from "./midi-constants";
import type {
  MidiChannel,
  MidiDataByte,
  MidiEvent,
  MidiFile,
  MidiReadLimits,
  MidiWriteLimits,
} from "./standard-midi-file";

export const MIDI_MAXIMUM_VLQ_VALUE =
  MIDI_CONSTANTS.maximumVariableLengthQuantity;
export const MIDI_MAXIMUM_PPQN = MIDI_CONSTANTS.maximumPpqn;

export const DEFAULT_MIDI_READ_LIMITS: MidiReadLimits = Object.freeze({
  maximumFileBytes: MIDI_CONSTANTS.maximumFileBytes,
  maximumTrackCount: MIDI_CONSTANTS.maximumTrackCount,
  maximumTrackBytes: MIDI_CONSTANTS.maximumTrackBytes,
  maximumEventsPerTrack:
    MIDI_CONSTANTS.maximumReadEventsPerTrack,
  maximumTotalEvents:
    MIDI_CONSTANTS.maximumReadTotalEventCount,
  maximumEventPayloadBytes:
    MIDI_CONSTANTS.maximumMetaEventBytes,
  maximumTextBytes: MIDI_CONSTANTS.maximumTextBytes,
});

export const DEFAULT_MIDI_WRITE_LIMITS: MidiWriteLimits = Object.freeze({
  maximumTrackCount: MIDI_CONSTANTS.maximumTrackCount,
  maximumEventsPerTrack:
    MIDI_CONSTANTS.maximumWriteEventsPerTrack,
  maximumTotalEvents:
    MIDI_CONSTANTS.maximumWriteTotalEventCount,
  maximumTextBytes: MIDI_CONSTANTS.maximumTextBytes,
  maximumOutputBytes: MIDI_CONSTANTS.maximumOutputBytes,
});

export function resolveMidiReadLimits(
  overrides: Partial<MidiReadLimits> | undefined,
): MidiReadLimits {
  const resolved: MidiReadLimits = {
    ...DEFAULT_MIDI_READ_LIMITS,
    ...overrides,
  };

  validatePositiveInteger(
    resolved.maximumFileBytes,
    "maximumFileBytes",
  );
  validatePositiveInteger(
    resolved.maximumTrackCount,
    "maximumTrackCount",
  );
  validatePositiveInteger(
    resolved.maximumTrackBytes,
    "maximumTrackBytes",
  );
  validatePositiveInteger(
    resolved.maximumEventsPerTrack,
    "maximumEventsPerTrack",
  );
  validatePositiveInteger(
    resolved.maximumTotalEvents,
    "maximumTotalEvents",
  );
  validatePositiveInteger(
    resolved.maximumEventPayloadBytes,
    "maximumEventPayloadBytes",
  );
  validatePositiveInteger(
    resolved.maximumTextBytes,
    "maximumTextBytes",
  );

  return resolved;
}

export function resolveMidiWriteLimits(
  overrides: Partial<MidiWriteLimits> | undefined,
): MidiWriteLimits {
  const resolved: MidiWriteLimits = {
    ...DEFAULT_MIDI_WRITE_LIMITS,
    ...overrides,
  };

  validatePositiveInteger(
    resolved.maximumTrackCount,
    "maximumTrackCount",
  );
  validatePositiveInteger(
    resolved.maximumEventsPerTrack,
    "maximumEventsPerTrack",
  );
  validatePositiveInteger(
    resolved.maximumTotalEvents,
    "maximumTotalEvents",
  );
  validatePositiveInteger(
    resolved.maximumTextBytes,
    "maximumTextBytes",
  );
  validatePositiveInteger(
    resolved.maximumOutputBytes,
    "maximumOutputBytes",
  );

  return resolved;
}

export function validateMidiFileForWriting(
  file: MidiFile,
  limits: MidiWriteLimits,
): void {
  if (file.format !== 0 && file.format !== 1) {
    throw new MidiCodecError(
      "UNSUPPORTED_FORMAT",
      `MIDI format ${String(file.format)} is not supported.`,
    );
  }
  if (
    !Number.isInteger(file.ticksPerQuarterNote) ||
    file.ticksPerQuarterNote < 1 ||
    file.ticksPerQuarterNote > MIDI_MAXIMUM_PPQN
  ) {
    throw new MidiCodecError(
      "INVALID_ARGUMENT",
      `ticksPerQuarterNote must be an integer between 1 and ${String(MIDI_MAXIMUM_PPQN)}.`,
    );
  }
  if (file.tracks.length < 1) {
    throw new MidiCodecError(
      "INVALID_ARGUMENT",
      "A MIDI file must contain at least one track.",
    );
  }
  if (file.format === 0 && file.tracks.length !== 1) {
    throw new MidiCodecError(
      "INVALID_ARGUMENT",
      "A format 0 MIDI file must contain exactly one track.",
    );
  }
  if (file.tracks.length > limits.maximumTrackCount) {
    throw new MidiCodecError(
      "LIMIT_EXCEEDED",
      `The MIDI file exceeds the ${String(limits.maximumTrackCount)} track limit.`,
    );
  }

  let totalEventCount = 0;
  for (
    let trackIndex = 0;
    trackIndex < file.tracks.length;
    trackIndex += 1
  ) {
    const track = file.tracks[trackIndex];
    if (track === undefined) {
      throw new MidiCodecError(
        "INVALID_ARGUMENT",
        "A MIDI track is missing.",
        null,
        trackIndex,
      );
    }
    if (track.events.length > limits.maximumEventsPerTrack) {
      throw new MidiCodecError(
        "LIMIT_EXCEEDED",
        `Track ${String(trackIndex)} exceeds the event limit.`,
        null,
        trackIndex,
      );
    }

    totalEventCount += track.events.length;
    if (totalEventCount > limits.maximumTotalEvents) {
      throw new MidiCodecError(
        "LIMIT_EXCEEDED",
        "The MIDI file exceeds the total event limit.",
      );
    }

    for (
      let eventIndex = 0;
      eventIndex < track.events.length;
      eventIndex += 1
    ) {
      const event = track.events[eventIndex];
      if (event === undefined) {
        throw new MidiCodecError(
          "INVALID_ARGUMENT",
          "A MIDI event is missing.",
          null,
          trackIndex,
        );
      }
      validateMidiEvent(event, trackIndex);
    }
  }
}

export function assertMidiChannel(
  value: number,
  fieldName: string,
  trackIndex: number | null = null,
): asserts value is MidiChannel {
  if (!Number.isInteger(value) || value < 0 || value > 15) {
    throw new MidiCodecError(
      "INVALID_EVENT",
      `${fieldName} must be an integer between 0 and 15.`,
      null,
      trackIndex,
    );
  }
}

export function assertMidiDataByte(
  value: number,
  fieldName: string,
  trackIndex: number | null = null,
): asserts value is MidiDataByte {
  if (!Number.isInteger(value) || value < 0 || value > 127) {
    throw new MidiCodecError(
      "INVALID_EVENT",
      `${fieldName} must be an integer between 0 and 127.`,
      null,
      trackIndex,
    );
  }
}

function validateMidiEvent(
  event: MidiEvent,
  trackIndex: number,
): void {
  if (
    !Number.isSafeInteger(event.absoluteTick) ||
    event.absoluteTick < 0
  ) {
    throw new MidiCodecError(
      "INVALID_EVENT",
      "MIDI event ticks must be non-negative safe integers.",
      null,
      trackIndex,
    );
  }

  switch (event.kind) {
    case "note-off":
    case "note-on":
      assertMidiChannel(event.channel, "channel", trackIndex);
      assertMidiDataByte(event.note, "note", trackIndex);
      assertMidiDataByte(event.velocity, "velocity", trackIndex);
      break;
    case "polyphonic-key-pressure":
      assertMidiChannel(event.channel, "channel", trackIndex);
      assertMidiDataByte(event.note, "note", trackIndex);
      assertMidiDataByte(event.pressure, "pressure", trackIndex);
      break;
    case "control-change":
      assertMidiChannel(event.channel, "channel", trackIndex);
      assertMidiDataByte(event.controller, "controller", trackIndex);
      assertMidiDataByte(event.value, "value", trackIndex);
      break;
    case "program-change":
      assertMidiChannel(event.channel, "channel", trackIndex);
      assertMidiDataByte(event.program, "program", trackIndex);
      break;
    case "channel-pressure":
      assertMidiChannel(event.channel, "channel", trackIndex);
      assertMidiDataByte(event.pressure, "pressure", trackIndex);
      break;
    case "pitch-bend":
      assertMidiChannel(event.channel, "channel", trackIndex);
      if (
        !Number.isInteger(event.value) ||
        event.value < 0 ||
        event.value > 0x3fff
      ) {
        throw new MidiCodecError(
          "INVALID_EVENT",
          "Pitch bend must be an integer between 0 and 16383.",
          null,
          trackIndex,
        );
      }
      break;
    case "tempo":
      if (
        !Number.isInteger(event.microsecondsPerQuarterNote) ||
        event.microsecondsPerQuarterNote < 1 ||
        event.microsecondsPerQuarterNote > 0xff_ffff
      ) {
        throw new MidiCodecError(
          "INVALID_EVENT",
          "Tempo must be an integer between 1 and 16777215 microseconds.",
          null,
          trackIndex,
        );
      }
      break;
    case "time-signature":
      validateTimeSignature(event, trackIndex);
      break;
    case "track-name":
      break;
    case "end-of-track":
      break;
    default:
      assertNever(event);
  }
}

function validateTimeSignature(
  event: Extract<MidiEvent, { readonly kind: "time-signature" }>,
  trackIndex: number,
): void {
  assertUnsignedByte(event.numerator, "numerator", trackIndex);
  if (event.numerator === 0) {
    throw new MidiCodecError(
      "INVALID_EVENT",
      "A time-signature numerator cannot be zero.",
      null,
      trackIndex,
    );
  }
  if (
    !Number.isSafeInteger(event.denominator) ||
    event.denominator < 1 ||
    !isPowerOfTwo(event.denominator)
  ) {
    throw new MidiCodecError(
      "INVALID_EVENT",
      "A time-signature denominator must be a positive power of two.",
      null,
      trackIndex,
    );
  }
  const denominatorPower = Math.log2(event.denominator);
  if (denominatorPower > 127) {
    throw new MidiCodecError(
      "INVALID_EVENT",
      "The time-signature denominator is too large for MIDI.",
      null,
      trackIndex,
    );
  }
  assertUnsignedByte(
    event.midiClocksPerMetronome,
    "midiClocksPerMetronome",
    trackIndex,
  );
  assertUnsignedByte(
    event.thirtySecondNotesPerQuarter,
    "thirtySecondNotesPerQuarter",
    trackIndex,
  );
}

function assertUnsignedByte(
  value: number,
  fieldName: string,
  trackIndex: number,
): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new MidiCodecError(
      "INVALID_EVENT",
      `${fieldName} must be an integer between 0 and 255.`,
      null,
      trackIndex,
    );
  }
}

function validatePositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new MidiCodecError(
      "INVALID_ARGUMENT",
      `${fieldName} must be a positive safe integer.`,
    );
  }
}

function isPowerOfTwo(value: number): boolean {
  const exponent = Math.log2(value);
  return Number.isInteger(exponent);
}

function assertNever(value: never): never {
  throw new MidiCodecError(
    "INVALID_EVENT",
    `Unsupported MIDI event ${String(value)}.`,
  );
}
