import { MidiCodecError } from "./errors";
import { decodeUtf8 } from "./text-codec";
import type {
  MidiEvent,
  MidiReadLimits,
  MidiReadSummary,
  MidiTrack,
  MidiTrackReadSummary,
  ParsedMidiFile,
} from "./types";
import {
  MIDI_MAXIMUM_VLQ_VALUE,
  resolveMidiReadLimits,
} from "./validation";

const HEADER_CHUNK_ID = "MThd";
const TRACK_CHUNK_ID = "MTrk";
const HEADER_DATA_LENGTH = 6;
const SUSTAIN_CONTROLLER_NUMBER = 64;

interface MutableTrackCounters {
  parsedEventCount: number;
  decodedEventCount: number;
  channelEventCount: number;
  noteEventCount: number;
  controlChangeCount: number;
  sustainControlChangeCount: number;
  skippedSystemExclusiveEventCount: number;
  skippedUnknownMetaEventCount: number;
  endedByEndOfTrackEvent: boolean;
}

interface MutableFileCounters {
  totalParsedEventCount: number;
}

/**
 * Decodes a bounded Standard MIDI File without interpreting musical semantics.
 *
 * Sustain events are preserved as ordinary control changes. SysEx and unknown
 * metadata are skipped and reported in the returned summary.
 */
export function readStandardMidiFile(
  bytes: Uint8Array,
  limitOverrides?: Partial<MidiReadLimits>,
): ParsedMidiFile {
  const limits = resolveMidiReadLimits(limitOverrides);
  if (!(bytes instanceof Uint8Array)) {
    throw new MidiCodecError(
      "INVALID_ARGUMENT",
      "MIDI input must be a Uint8Array.",
    );
  }
  if (bytes.byteLength > limits.maximumFileBytes) {
    throw new MidiCodecError(
      "FILE_TOO_LARGE",
      `The MIDI file exceeds the ${String(limits.maximumFileBytes)} byte limit.`,
    );
  }

  const reader = new ByteReader(bytes, 0, bytes.byteLength, null);
  const headerId = reader.readFourCharacterCode();
  if (headerId !== HEADER_CHUNK_ID) {
    throw new MidiCodecError(
      "INVALID_HEADER",
      "The MIDI header chunk is missing.",
      0,
    );
  }

  const headerLength = reader.readUint32();
  if (headerLength < HEADER_DATA_LENGTH) {
    throw new MidiCodecError(
      "INVALID_HEADER",
      "The MIDI header chunk is shorter than six bytes.",
      reader.position - 4,
    );
  }
  reader.assertRemaining(headerLength);
  const headerEnd = reader.position + headerLength;
  const formatValue = reader.readUint16();
  if (formatValue !== 0 && formatValue !== 1) {
    throw new MidiCodecError(
      "UNSUPPORTED_FORMAT",
      `MIDI format ${String(formatValue)} is not supported.`,
      reader.position - 2,
    );
  }

  const declaredTrackCount = reader.readUint16();
  if (declaredTrackCount < 1) {
    throw new MidiCodecError(
      "INVALID_HEADER",
      "The MIDI file does not declare any tracks.",
      reader.position - 2,
    );
  }
  if (formatValue === 0 && declaredTrackCount !== 1) {
    throw new MidiCodecError(
      "INVALID_HEADER",
      "A format 0 MIDI file must declare exactly one track.",
      reader.position - 2,
    );
  }
  if (declaredTrackCount > limits.maximumTrackCount) {
    throw new MidiCodecError(
      "LIMIT_EXCEEDED",
      `The MIDI file exceeds the ${String(limits.maximumTrackCount)} track limit.`,
      reader.position - 2,
    );
  }

  const division = reader.readUint16();
  if ((division & 0x8000) !== 0) {
    throw new MidiCodecError(
      "UNSUPPORTED_TIME_DIVISION",
      "SMPTE MIDI time division is not supported.",
      reader.position - 2,
    );
  }
  if (division === 0) {
    throw new MidiCodecError(
      "INVALID_HEADER",
      "MIDI PPQN division cannot be zero.",
      reader.position - 2,
    );
  }
  reader.moveTo(headerEnd);

  const tracks: MidiTrack[] = [];
  const trackSummaries: MidiTrackReadSummary[] = [];
  const fileCounters: MutableFileCounters = {
    totalParsedEventCount: 0,
  };

  for (
    let trackIndex = 0;
    trackIndex < declaredTrackCount;
    trackIndex += 1
  ) {
    const chunkOffset = reader.position;
    const chunkId = reader.readFourCharacterCode();
    if (chunkId !== TRACK_CHUNK_ID) {
      throw new MidiCodecError(
        "INVALID_TRACK",
        `Expected a track chunk at track index ${String(trackIndex)}.`,
        chunkOffset,
        trackIndex,
      );
    }

    const trackLength = reader.readUint32();
    if (trackLength > limits.maximumTrackBytes) {
      throw new MidiCodecError(
        "LIMIT_EXCEEDED",
        `Track ${String(trackIndex)} exceeds the ${String(limits.maximumTrackBytes)} byte limit.`,
        reader.position - 4,
        trackIndex,
      );
    }
    reader.assertRemaining(trackLength, trackIndex);
    const trackEnd = reader.position + trackLength;
    const trackReader = new ByteReader(
      bytes,
      reader.position,
      trackEnd,
      trackIndex,
    );
    const decoded = readTrack(
      trackReader,
      trackIndex,
      limits,
      fileCounters,
    );
    tracks.push({
      events: decoded.events,
    });
    trackSummaries.push(decoded.summary);
    reader.moveTo(trackEnd);
  }

  const summary = aggregateSummary(trackSummaries);
  return {
    format: formatValue,
    ticksPerQuarterNote: division,
    tracks,
    summary,
  };
}

function readTrack(
  reader: ByteReader,
  trackIndex: number,
  limits: MidiReadLimits,
  fileCounters: MutableFileCounters,
): {
  readonly events: readonly MidiEvent[];
  readonly summary: MidiTrackReadSummary;
} {
  const events: MidiEvent[] = [];
  const counters: MutableTrackCounters = {
    parsedEventCount: 0,
    decodedEventCount: 0,
    channelEventCount: 0,
    noteEventCount: 0,
    controlChangeCount: 0,
    sustainControlChangeCount: 0,
    skippedSystemExclusiveEventCount: 0,
    skippedUnknownMetaEventCount: 0,
    endedByEndOfTrackEvent: false,
  };
  let absoluteTick = 0;
  let runningStatus: number | null = null;

  while (reader.remaining > 0) {
    incrementEventCounters(
      counters,
      fileCounters,
      limits,
      trackIndex,
      reader.position,
    );

    const deltaTicks = reader.readVlq();
    if (absoluteTick > Number.MAX_SAFE_INTEGER - deltaTicks) {
      throw new MidiCodecError(
        "INVALID_EVENT",
        "MIDI event time exceeds the safe integer range.",
        reader.position,
        trackIndex,
      );
    }
    absoluteTick += deltaTicks;

    const statusOffset = reader.position;
    const statusOrData = reader.readUint8();
    let status: number;
    let firstDataByte: number | null = null;
    if (statusOrData < 0x80) {
      if (runningStatus === null) {
        throw new MidiCodecError(
          "INVALID_RUNNING_STATUS",
          "A MIDI data byte appears without a running channel status.",
          statusOffset,
          trackIndex,
        );
      }
      status = runningStatus;
      firstDataByte = statusOrData;
    } else {
      status = statusOrData;
      runningStatus =
        status >= 0x80 && status <= 0xef
          ? status
          : null;
    }

    if (status >= 0x80 && status <= 0xef) {
      const event = readChannelEvent(
        reader,
        status,
        firstDataByte,
        absoluteTick,
        trackIndex,
        counters,
      );
      events.push(event);
      counters.decodedEventCount += 1;
      counters.channelEventCount += 1;
      continue;
    }

    if (status === 0xff) {
      const didReachEnd = readMetaEvent(
        reader,
        absoluteTick,
        trackIndex,
        limits,
        counters,
        events,
      );
      if (didReachEnd) {
        reader.moveToEnd();
      }
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      const payloadLength = reader.readVlq();
      assertPayloadLength(
        reader,
        payloadLength,
        limits,
        trackIndex,
      );
      reader.skip(payloadLength);
      counters.skippedSystemExclusiveEventCount += 1;
      continue;
    }

    throw new MidiCodecError(
      "INVALID_EVENT",
      `Unsupported system status 0x${status.toString(16).padStart(2, "0")}.`,
      statusOffset,
      trackIndex,
    );
  }

  return {
    events,
    summary: {
      parsedEventCount: counters.parsedEventCount,
      decodedEventCount: counters.decodedEventCount,
      channelEventCount: counters.channelEventCount,
      noteEventCount: counters.noteEventCount,
      controlChangeCount: counters.controlChangeCount,
      sustainControlChangeCount:
        counters.sustainControlChangeCount,
      skippedSystemExclusiveEventCount:
        counters.skippedSystemExclusiveEventCount,
      skippedUnknownMetaEventCount:
        counters.skippedUnknownMetaEventCount,
      endedByEndOfTrackEvent:
        counters.endedByEndOfTrackEvent,
    },
  };
}

function readChannelEvent(
  reader: ByteReader,
  status: number,
  firstDataByte: number | null,
  absoluteTick: number,
  trackIndex: number,
  counters: MutableTrackCounters,
): Extract<MidiEvent, { readonly channel: number }> {
  const eventType = status & 0xf0;
  const channel = status & 0x0f;
  const first =
    firstDataByte ?? reader.readMidiDataByte();

  switch (eventType) {
    case 0x80: {
      const velocity = reader.readMidiDataByte();
      counters.noteEventCount += 1;
      return {
        kind: "note-off",
        absoluteTick,
        channel,
        note: first,
        velocity,
      };
    }
    case 0x90: {
      const velocity = reader.readMidiDataByte();
      counters.noteEventCount += 1;
      return {
        kind: "note-on",
        absoluteTick,
        channel,
        note: first,
        velocity,
      };
    }
    case 0xa0:
      return {
        kind: "polyphonic-key-pressure",
        absoluteTick,
        channel,
        note: first,
        pressure: reader.readMidiDataByte(),
      };
    case 0xb0: {
      const value = reader.readMidiDataByte();
      counters.controlChangeCount += 1;
      if (first === SUSTAIN_CONTROLLER_NUMBER) {
        counters.sustainControlChangeCount += 1;
      }
      return {
        kind: "control-change",
        absoluteTick,
        channel,
        controller: first,
        value,
      };
    }
    case 0xc0:
      return {
        kind: "program-change",
        absoluteTick,
        channel,
        program: first,
      };
    case 0xd0:
      return {
        kind: "channel-pressure",
        absoluteTick,
        channel,
        pressure: first,
      };
    case 0xe0: {
      const mostSignificant = reader.readMidiDataByte();
      return {
        kind: "pitch-bend",
        absoluteTick,
        channel,
        value: first | (mostSignificant << 7),
      };
    }
    default:
      throw new MidiCodecError(
        "INVALID_EVENT",
        `Unsupported channel status 0x${status.toString(16)}.`,
        reader.position,
        trackIndex,
      );
  }
}

function readMetaEvent(
  reader: ByteReader,
  absoluteTick: number,
  trackIndex: number,
  limits: MidiReadLimits,
  counters: MutableTrackCounters,
  events: MidiEvent[],
): boolean {
  const metaType = reader.readUint8();
  const payloadLength = reader.readVlq();
  assertPayloadLength(
    reader,
    payloadLength,
    limits,
    trackIndex,
  );
  const payloadStart = reader.position;

  switch (metaType) {
    case 0x03: {
      if (payloadLength > limits.maximumTextBytes) {
        throw new MidiCodecError(
          "LIMIT_EXCEEDED",
          `A track name exceeds the ${String(limits.maximumTextBytes)} byte limit.`,
          payloadStart,
          trackIndex,
        );
      }

      const text = decodeUtf8(
        reader.readBytes(payloadLength),
      );
      events.push({
        kind: "track-name",
        absoluteTick,
        text,
      });
      counters.decodedEventCount += 1;
      return false;
    }
    case 0x2f:
      assertMetaPayloadLength(
        payloadLength,
        0,
        "end-of-track",
        payloadStart,
        trackIndex,
      );
      events.push({
        kind: "end-of-track",
        absoluteTick,
      });
      counters.decodedEventCount += 1;
      counters.endedByEndOfTrackEvent = true;
      return true;
    case 0x51: {
      assertMetaPayloadLength(
        payloadLength,
        3,
        "tempo",
        payloadStart,
        trackIndex,
      );
      const microsecondsPerQuarterNote =
        (reader.readUint8() << 16) |
        (reader.readUint8() << 8) |
        reader.readUint8();
      if (microsecondsPerQuarterNote === 0) {
        throw new MidiCodecError(
          "INVALID_EVENT",
          "A MIDI tempo value cannot be zero.",
          payloadStart,
          trackIndex,
        );
      }
      events.push({
        kind: "tempo",
        absoluteTick,
        microsecondsPerQuarterNote,
      });
      counters.decodedEventCount += 1;
      return false;
    }
    case 0x58: {
      assertMetaPayloadLength(
        payloadLength,
        4,
        "time-signature",
        payloadStart,
        trackIndex,
      );
      const numerator = reader.readUint8();
      const denominatorPower = reader.readUint8();
      if (numerator === 0 || denominatorPower > 52) {
        throw new MidiCodecError(
          "INVALID_EVENT",
          "The MIDI time signature is outside the supported numeric range.",
          payloadStart,
          trackIndex,
        );
      }
      events.push({
        kind: "time-signature",
        absoluteTick,
        numerator,
        denominator: 2 ** denominatorPower,
        midiClocksPerMetronome: reader.readUint8(),
        thirtySecondNotesPerQuarter: reader.readUint8(),
      });
      counters.decodedEventCount += 1;
      return false;
    }
    default:
      reader.skip(payloadLength);
      counters.skippedUnknownMetaEventCount += 1;
      return false;
  }
}

function incrementEventCounters(
  trackCounters: MutableTrackCounters,
  fileCounters: MutableFileCounters,
  limits: MidiReadLimits,
  trackIndex: number,
  byteOffset: number,
): void {
  trackCounters.parsedEventCount += 1;
  fileCounters.totalParsedEventCount += 1;
  if (
    trackCounters.parsedEventCount >
    limits.maximumEventsPerTrack
  ) {
    throw new MidiCodecError(
      "LIMIT_EXCEEDED",
      `Track ${String(trackIndex)} exceeds the event limit.`,
      byteOffset,
      trackIndex,
    );
  }
  if (
    fileCounters.totalParsedEventCount >
    limits.maximumTotalEvents
  ) {
    throw new MidiCodecError(
      "LIMIT_EXCEEDED",
      "The MIDI file exceeds the total event limit.",
      byteOffset,
      trackIndex,
    );
  }
}

function assertPayloadLength(
  reader: ByteReader,
  payloadLength: number,
  limits: MidiReadLimits,
  trackIndex: number,
): void {
  if (payloadLength > limits.maximumEventPayloadBytes) {
    throw new MidiCodecError(
      "LIMIT_EXCEEDED",
      `An event payload exceeds the ${String(limits.maximumEventPayloadBytes)} byte limit.`,
      reader.position,
      trackIndex,
    );
  }
  reader.assertRemaining(payloadLength, trackIndex);
}

function assertMetaPayloadLength(
  actual: number,
  expected: number,
  eventName: string,
  byteOffset: number,
  trackIndex: number,
): void {
  if (actual !== expected) {
    throw new MidiCodecError(
      "INVALID_EVENT",
      `The ${eventName} event must contain ${String(expected)} payload bytes.`,
      byteOffset,
      trackIndex,
    );
  }
}

function aggregateSummary(
  tracks: readonly MidiTrackReadSummary[],
): MidiReadSummary {
  let parsedEventCount = 0;
  let decodedEventCount = 0;
  let channelEventCount = 0;
  let noteEventCount = 0;
  let controlChangeCount = 0;
  let sustainControlChangeCount = 0;
  let skippedSystemExclusiveEventCount = 0;
  let skippedUnknownMetaEventCount = 0;

  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    if (track === undefined) {
      continue;
    }
    parsedEventCount += track.parsedEventCount;
    decodedEventCount += track.decodedEventCount;
    channelEventCount += track.channelEventCount;
    noteEventCount += track.noteEventCount;
    controlChangeCount += track.controlChangeCount;
    sustainControlChangeCount +=
      track.sustainControlChangeCount;
    skippedSystemExclusiveEventCount +=
      track.skippedSystemExclusiveEventCount;
    skippedUnknownMetaEventCount +=
      track.skippedUnknownMetaEventCount;
  }

  return {
    parsedEventCount,
    decodedEventCount,
    channelEventCount,
    noteEventCount,
    controlChangeCount,
    sustainControlChangeCount,
    skippedSystemExclusiveEventCount,
    skippedUnknownMetaEventCount,
    tracks,
  };
}

class ByteReader {
  private readonly bytes: Uint8Array;
  private readonly end: number;
  private readonly trackIndex: number | null;
  private cursor: number;

  public constructor(
    bytes: Uint8Array,
    start: number,
    end: number,
    trackIndex: number | null,
  ) {
    this.bytes = bytes;
    this.cursor = start;
    this.end = end;
    this.trackIndex = trackIndex;
  }

  public get position(): number {
    return this.cursor;
  }

  public get remaining(): number {
    return this.end - this.cursor;
  }

  public readUint8(): number {
    this.assertRemaining(1);
    const value = this.bytes[this.cursor];
    if (value === undefined) {
      throw this.truncatedError();
    }
    this.cursor += 1;
    return value;
  }

  public readUint16(): number {
    const high = this.readUint8();
    const low = this.readUint8();
    return (high << 8) | low;
  }

  public readUint32(): number {
    const first = this.readUint8();
    const second = this.readUint8();
    const third = this.readUint8();
    const fourth = this.readUint8();
    return (
      first * 0x1_000000 +
      second * 0x1_0000 +
      third * 0x100 +
      fourth
    );
  }

  public readFourCharacterCode(): string {
    return String.fromCharCode(
      this.readUint8(),
      this.readUint8(),
      this.readUint8(),
      this.readUint8(),
    );
  }

  public readMidiDataByte(): number {
    const offset = this.cursor;
    const value = this.readUint8();
    if (value >= 0x80) {
      throw new MidiCodecError(
        "INVALID_EVENT",
        "A MIDI channel data byte cannot set the status bit.",
        offset,
        this.trackIndex,
      );
    }
    return value;
  }

  public readVlq(): number {
    const start = this.cursor;
    let value = 0;
    for (let index = 0; index < 4; index += 1) {
      const byte = this.readUint8();
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) {
        return value;
      }
    }

    throw new MidiCodecError(
      "INVALID_VLQ",
      `A MIDI variable-length quantity cannot exceed ${String(MIDI_MAXIMUM_VLQ_VALUE)}.`,
      start,
      this.trackIndex,
    );
  }

  public readBytes(length: number): Uint8Array {
    this.assertRemaining(length);
    const result = this.bytes.subarray(
      this.cursor,
      this.cursor + length,
    );
    this.cursor += length;
    return result;
  }

  public skip(length: number): void {
    this.assertRemaining(length);
    this.cursor += length;
  }

  public moveTo(position: number): void {
    if (position < this.cursor || position > this.end) {
      throw new MidiCodecError(
        "TRUNCATED_FILE",
        "A MIDI chunk points outside the available data.",
        this.cursor,
        this.trackIndex,
      );
    }
    this.cursor = position;
  }

  public moveToEnd(): void {
    this.cursor = this.end;
  }

  public assertRemaining(
    length: number,
    trackIndex: number | null = this.trackIndex,
  ): void {
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > this.end - this.cursor
    ) {
      throw new MidiCodecError(
        "TRUNCATED_FILE",
        "The MIDI file ends before the declared data length.",
        this.cursor,
        trackIndex,
      );
    }
  }

  private truncatedError(): MidiCodecError {
    return new MidiCodecError(
      "TRUNCATED_FILE",
      "The MIDI file ends unexpectedly.",
      this.cursor,
      this.trackIndex,
    );
  }
}
