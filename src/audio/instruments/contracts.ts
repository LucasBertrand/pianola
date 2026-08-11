import type {
  AudioEngineConfig,
  VoiceId,
} from "../../domain/model";
import type {
  PlaybackVoiceSnapshot,
  ScheduledNoteEvent,
} from "../contracts";
import type {
  VoiceAllocationWindow,
} from "../voice-allocation";

/** A scheduled source whose lifecycle is owned by one instrument renderer. */
export interface ActiveInstrumentVoice extends VoiceAllocationWindow {
  readonly occurrenceId: string;
  readonly voiceId: VoiceId;
  readonly ended: boolean;
  stop(atAudioTimeSeconds: number): void;
  cancelBeforeStart(atAudioTimeSeconds: number): void;
}

export interface InstrumentScheduleRequest<
  TVoice extends PlaybackVoiceSnapshot = PlaybackVoiceSnapshot,
> {
  readonly context: AudioContext;
  readonly destination: AudioNode;
  readonly event: ScheduledNoteEvent<TVoice>;
  readonly startAudioTimeSeconds: number;
  readonly noteEndAudioTimeSeconds: number;
  readonly tuningFrequencyHz: number;
  readonly releaseTailSeconds: number;
  readonly onEnded: (occurrenceId: string) => void;
}

/**
 * Converts an instrument-neutral scheduled event into a Web Audio source.
 * Renderers never own the AudioContext, master graph, or voice buses.
 */
export interface InstrumentRenderer<
  TVoice extends PlaybackVoiceSnapshot = PlaybackVoiceSnapshot,
> {
  readonly kind: TVoice["instrument"]["kind"];
  getMaximumPolyphony(
    voice: TVoice,
    engineConfig: AudioEngineConfig,
  ): number;
  schedule(
    request: InstrumentScheduleRequest<TVoice>,
  ): ActiveInstrumentVoice;
}
