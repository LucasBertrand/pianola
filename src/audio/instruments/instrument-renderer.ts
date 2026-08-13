import {
  type AudioEngineConfig,
} from "../audio-engine-config";
import {
  type InstrumentId,
} from "../../domain/identifiers";
import type {
  PlaybackInstrumentSnapshot,
  ScheduledNoteEvent,
} from "../playback-model";
import type {
  VoiceAllocationWindow,
} from "../voice-allocation";

/** A scheduled source whose lifecycle is owned by one instrument renderer. */
export interface ActiveInstrumentVoice extends VoiceAllocationWindow {
  readonly occurrenceId: string;
  readonly instrumentId: InstrumentId;
  readonly ended: boolean;
  previewInstrumentSettings(
    instrument: PlaybackInstrumentSnapshot,
    atAudioTimeSeconds: number,
  ): void;
  stop(atAudioTimeSeconds: number): void;
  cancelBeforeStart(atAudioTimeSeconds: number): void;
}

export interface InstrumentScheduleRequest<
  TInstrument extends PlaybackInstrumentSnapshot = PlaybackInstrumentSnapshot,
> {
  readonly context: AudioContext;
  readonly destination: AudioNode;
  readonly event: ScheduledNoteEvent<TInstrument>;
  readonly startAudioTimeSeconds: number;
  readonly noteEndAudioTimeSeconds: number;
  readonly tuningFrequencyHz: number;
  readonly releaseTailSeconds: number;
  readonly onEnded: (occurrenceId: string) => void;
}

/**
 * Converts an instrument-neutral scheduled event into a Web Audio source.
 * Renderers never own the AudioContext, master graph, or instrument buses.
 */
export interface InstrumentRenderer<
  TInstrument extends PlaybackInstrumentSnapshot = PlaybackInstrumentSnapshot,
> {
  readonly kind: TInstrument["instrument"]["kind"];
  getMaximumPolyphony(
    instrument: TInstrument,
    engineConfig: AudioEngineConfig,
  ): number;
  schedule(
    request: InstrumentScheduleRequest<TInstrument>,
  ): ActiveInstrumentVoice;
}
