import { MidiCodecError } from "./midi-codec-error";
import { encodeUtf8 } from "./text-codec";
import type {
  MidiEvent,
  MidiFile,
  MidiWriteLimits,
} from "./standard-midi-file";
import {
  MIDI_MAXIMUM_VLQ_VALUE,
  resolveMidiWriteLimits,
  validateMidiFileForWriting,
} from "./midi-file-validation";

const HEADER_CHUNK_ID = "MThd";
const TRACK_CHUNK_ID = "MTrk";

interface OrderedEvent {
  readonly event: MidiEvent;
  readonly originalIndex: number;
}

/**
 * Encodes format 0 or format 1 Standard MIDI File data.
 *
 * The writer deliberately emits complete channel statuses instead of running
 * status. Events at the same tick use a documented priority and their original
 * array order as a stable tie-breaker, producing byte-identical output.
 */
export function writeStandardMidiFile(
  file: MidiFile,
  limitOverrides?: Partial<MidiWriteLimits>,
): Uint8Array {
  const limits = resolveMidiWriteLimits(limitOverrides);
  validateMidiFileForWriting(file, limits);
  const writer = new ByteWriter(limits.maximumOutputBytes);
  writer.writeFourCharacterCode(HEADER_CHUNK_ID);
  writer.writeUint32(6);
  writer.writeUint16(file.format);
  writer.writeUint16(file.tracks.length);
  writer.writeUint16(file.ticksPerQuarterNote);

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
    const trackBytes =
      encodeTrack(track.events, trackIndex, limits);

    writer.writeFourCharacterCode(TRACK_CHUNK_ID);
    writer.writeUint32(trackBytes.byteLength);
    writer.writeBytes(trackBytes);
  }

  return writer.toUint8Array();
}

function encodeTrack(
  events: readonly MidiEvent[],
  trackIndex: number,
  limits: MidiWriteLimits,
): Uint8Array {
  const orderedEvents: OrderedEvent[] = [];
  let endTick = 0;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event === undefined) {
      throw new MidiCodecError(
        "INVALID_ARGUMENT",
        "A MIDI event is missing.",
        null,
        trackIndex,
      );
    }
    if (event.absoluteTick > endTick) {
      endTick = event.absoluteTick;
    }
    if (event.kind !== "end-of-track") {
      orderedEvents.push({
        event,
        originalIndex: index,
      });
    }
  }

  orderedEvents.sort(compareOrderedEvents);
  const writer = new ByteWriter(limits.maximumOutputBytes);
  let previousTick = 0;

  for (
    let index = 0;
    index < orderedEvents.length;
    index += 1
  ) {
    const ordered = orderedEvents[index];
    if (ordered === undefined) {
      continue;
    }
    const deltaTicks = ordered.event.absoluteTick - previousTick;
    writeDeltaTicks(writer, deltaTicks, trackIndex);
    writeEvent(writer, ordered.event, trackIndex, limits);
    previousTick = ordered.event.absoluteTick;
  }

  writeDeltaTicks(writer, endTick - previousTick, trackIndex);
  writer.writeUint8(0xff);
  writer.writeUint8(0x2f);
  writer.writeUint8(0);
  return writer.toUint8Array();
}

function compareOrderedEvents(
  left: OrderedEvent,
  right: OrderedEvent,
): number {
  if (left.event.absoluteTick !== right.event.absoluteTick) {
    return left.event.absoluteTick - right.event.absoluteTick;
  }

  const priorityDifference =
    getEventPriority(left.event) - getEventPriority(right.event);
  if (priorityDifference !== 0) {
    return priorityDifference;
  }
  return left.originalIndex - right.originalIndex;
}

function getEventPriority(event: MidiEvent): number {
  switch (event.kind) {
    case "track-name":
      return 0;
    case "tempo":
      return 1;
    case "time-signature":
      return 2;
    case "note-off":
      return 10;
    case "note-on":
      return event.velocity === 0 ? 10 : 30;
    case "program-change":
    case "control-change":
    case "pitch-bend":
    case "polyphonic-key-pressure":
    case "channel-pressure":
      return 20;
    case "end-of-track":
      return 40;
    default:
      return assertNever(event);
  }
}

function writeEvent(
  writer: ByteWriter,
  event: MidiEvent,
  trackIndex: number,
  limits: MidiWriteLimits,
): void {
  switch (event.kind) {
    case "note-off":
      writeTwoByteChannelEvent(
        writer,
        0x80,
        event.channel,
        event.note,
        event.velocity,
      );
      break;
    case "note-on":
      writeTwoByteChannelEvent(
        writer,
        0x90,
        event.channel,
        event.note,
        event.velocity,
      );
      break;
    case "polyphonic-key-pressure":
      writeTwoByteChannelEvent(
        writer,
        0xa0,
        event.channel,
        event.note,
        event.pressure,
      );
      break;
    case "control-change":
      writeTwoByteChannelEvent(
        writer,
        0xb0,
        event.channel,
        event.controller,
        event.value,
      );
      break;
    case "program-change":
      writeOneByteChannelEvent(
        writer,
        0xc0,
        event.channel,
        event.program,
      );
      break;
    case "channel-pressure":
      writeOneByteChannelEvent(
        writer,
        0xd0,
        event.channel,
        event.pressure,
      );
      break;
    case "pitch-bend":
      writeTwoByteChannelEvent(
        writer,
        0xe0,
        event.channel,
        event.value & 0x7f,
        (event.value >> 7) & 0x7f,
      );
      break;
    case "tempo":
      writer.writeUint8(0xff);
      writer.writeUint8(0x51);
      writer.writeUint8(3);
      writer.writeUint8(
        (event.microsecondsPerQuarterNote >> 16) & 0xff,
      );
      writer.writeUint8(
        (event.microsecondsPerQuarterNote >> 8) & 0xff,
      );
      writer.writeUint8(
        event.microsecondsPerQuarterNote & 0xff,
      );
      break;
    case "time-signature":
      writer.writeUint8(0xff);
      writer.writeUint8(0x58);
      writer.writeUint8(4);
      writer.writeUint8(event.numerator);
      writer.writeUint8(Math.log2(event.denominator));
      writer.writeUint8(event.midiClocksPerMetronome);
      writer.writeUint8(event.thirtySecondNotesPerQuarter);
      break;
    case "track-name": {
      const textBytes = encodeUtf8(event.text);
      if (textBytes.byteLength > limits.maximumTextBytes) {
        throw new MidiCodecError(
          "LIMIT_EXCEEDED",
          `A track name exceeds the ${String(limits.maximumTextBytes)} byte limit.`,
          null,
          trackIndex,
        );
      }
      writer.writeUint8(0xff);
      writer.writeUint8(0x03);
      writer.writeVlq(textBytes.byteLength);
      writer.writeBytes(textBytes);
      break;
    }
    case "end-of-track":
      throw new MidiCodecError(
        "INVALID_EVENT",
        "End-of-track events are emitted by the writer.",
        null,
        trackIndex,
      );
    default:
      assertNever(event);
  }
}

function writeOneByteChannelEvent(
  writer: ByteWriter,
  status: number,
  channel: number,
  data: number,
): void {
  writer.writeUint8(status | channel);
  writer.writeUint8(data);
}

function writeTwoByteChannelEvent(
  writer: ByteWriter,
  status: number,
  channel: number,
  firstData: number,
  secondData: number,
): void {
  writer.writeUint8(status | channel);
  writer.writeUint8(firstData);
  writer.writeUint8(secondData);
}

function writeDeltaTicks(
  writer: ByteWriter,
  deltaTicks: number,
  trackIndex: number,
): void {
  if (
    !Number.isInteger(deltaTicks) ||
    deltaTicks < 0 ||
    deltaTicks > MIDI_MAXIMUM_VLQ_VALUE
  ) {
    throw new MidiCodecError(
      "INVALID_EVENT",
      `A MIDI event delta must be between 0 and ${String(MIDI_MAXIMUM_VLQ_VALUE)} ticks.`,
      null,
      trackIndex,
    );
  }
  writer.writeVlq(deltaTicks);
}

class ByteWriter {
  private readonly maximumBytes: number;
  private bytes: Uint8Array;
  private length = 0;

  public constructor(maximumBytes: number) {
    this.maximumBytes = maximumBytes;
    this.bytes = new Uint8Array(
      Math.min(1_024, maximumBytes),
    );
  }

  public writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.bytes[this.length] = value & 0xff;
    this.length += 1;
  }

  public writeUint16(value: number): void {
    this.ensureCapacity(2);
    this.bytes[this.length] = (value >> 8) & 0xff;
    this.bytes[this.length + 1] = value & 0xff;
    this.length += 2;
  }

  public writeUint32(value: number): void {
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 0xffff_ffff
    ) {
      throw new MidiCodecError(
        "LIMIT_EXCEEDED",
        "A MIDI chunk is too large to encode.",
      );
    }
    this.ensureCapacity(4);
    this.bytes[this.length] =
      Math.floor(value / 0x1_000000) & 0xff;
    this.bytes[this.length + 1] =
      Math.floor(value / 0x1_0000) & 0xff;
    this.bytes[this.length + 2] =
      Math.floor(value / 0x100) & 0xff;
    this.bytes[this.length + 3] = value & 0xff;
    this.length += 4;
  }

  public writeFourCharacterCode(value: string): void {
    if (value.length !== 4) {
      throw new MidiCodecError(
        "INVALID_ARGUMENT",
        "A MIDI chunk identifier must contain four characters.",
      );
    }
    this.ensureCapacity(4);
    for (let index = 0; index < 4; index += 1) {
      this.bytes[this.length + index] =
        value.charCodeAt(index) & 0xff;
    }
    this.length += 4;
  }

  public writeVlq(value: number): void {
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > MIDI_MAXIMUM_VLQ_VALUE
    ) {
      throw new MidiCodecError(
        "INVALID_VLQ",
        `A MIDI variable-length quantity must be between 0 and ${String(MIDI_MAXIMUM_VLQ_VALUE)}.`,
      );
    }

    const encodedByteCount =
      value >= 0x20_0000
        ? 4
        : value >= 0x4000
          ? 3
          : value >= 0x80
            ? 2
            : 1;

    this.ensureCapacity(encodedByteCount);

    if (encodedByteCount === 4) {
      this.bytes[this.length] =
        ((value >>> 21) & 0x7f) | 0x80;
      this.length += 1;
    }

    if (encodedByteCount >= 3) {
      this.bytes[this.length] =
        ((value >>> 14) & 0x7f) | 0x80;
      this.length += 1;
    }

    if (encodedByteCount >= 2) {
      this.bytes[this.length] =
        ((value >>> 7) & 0x7f) | 0x80;
      this.length += 1;
    }

    this.bytes[this.length] = value & 0x7f;
    this.length += 1;
  }

  public writeBytes(bytes: Uint8Array): void {
    this.ensureCapacity(bytes.byteLength);
    this.bytes.set(bytes, this.length);
    this.length += bytes.byteLength;
  }

  public toUint8Array(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }

  private ensureCapacity(additionalBytes: number): void {
    if (
      this.length >
      this.maximumBytes - additionalBytes
    ) {
      throw new MidiCodecError(
        "LIMIT_EXCEEDED",
        `Encoded MIDI data exceeds the ${String(this.maximumBytes)} byte limit.`,
      );
    }

    const requiredLength = this.length + additionalBytes;

    if (requiredLength <= this.bytes.byteLength) {
      return;
    }

    const nextCapacity = Math.min(
      this.maximumBytes,
      Math.max(
        requiredLength,
        Math.max(1, this.bytes.byteLength * 2),
      ),
    );
    const nextBytes = new Uint8Array(nextCapacity);

    nextBytes.set(this.bytes);
    this.bytes = nextBytes;
  }
}

function assertNever(value: never): never {
  throw new MidiCodecError(
    "INVALID_EVENT",
    `Unsupported MIDI event ${String(value)}.`,
  );
}
