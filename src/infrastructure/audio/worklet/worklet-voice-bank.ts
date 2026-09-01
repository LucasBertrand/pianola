import type {
  InstrumentId,
  NoteId,
} from "../../../domain/identifiers";
import type {
  SynthRuntimeConfig,
} from "../synth/synth-runtime-config";
import {
  WorkletVoiceSlot,
} from "./worklet-voice-slot";
import type {
  WorkletRuntimeInstrument,
} from "./worklet-runtime-instrument";
import {
  GLOBAL_VOICE_STORAGE_LIMIT,
  reserveWorkletVoice,
  VOICE_STEAL_RELEASE_SECONDS,
} from "./worklet-voice-allocation";

/** Owns the bounded set of DSP voices and their mix state. */
export class WorkletVoiceBank {
  private readonly voices: WorkletVoiceSlot[];
  private readonly availableVoices: WorkletVoiceSlot[];
  private voiceSequence = 0;
  private tuningFrequencyHz = 440;

  public constructor(sampleRate: number) {
    this.voices = new Array<WorkletVoiceSlot>(
      GLOBAL_VOICE_STORAGE_LIMIT,
    );
    this.voices.length = 0;
    this.availableVoices = new Array<WorkletVoiceSlot>(
      GLOBAL_VOICE_STORAGE_LIMIT,
    );

    for (
      let voiceIndex = 0;
      voiceIndex < GLOBAL_VOICE_STORAGE_LIMIT;
      voiceIndex += 1
    ) {
      this.availableVoices[voiceIndex] =
        new WorkletVoiceSlot(sampleRate);
    }
  }

  public setTuningFrequency(tuningFrequencyHz: number): void {
    this.tuningFrequencyHz = tuningFrequencyHz;

    for (const voice of this.voices) {
      if (!voice.ended) {
        voice.retune(tuningFrequencyHz);
      }
    }
  }

  public synchronizeMix(
    runtimesById: ReadonlyMap<InstrumentId, WorkletRuntimeInstrument>,
  ): void {
    for (const voice of this.voices) {
      const runtime = runtimesById.get(voice.instrumentId);

      if (runtime === undefined) {
        voice.configureMix(0, 0, false);
      } else {
        this.configureVoiceMix(voice, runtime);
      }
    }
  }

  public previewInstrument(
    instrumentId: InstrumentId,
    config: SynthRuntimeConfig,
  ): void {
    for (const voice of this.voices) {
      if (voice.instrumentId === instrumentId && !voice.ended) {
        voice.preview(config);
      }
    }
  }

  public previewInstrumentGain(runtime: WorkletRuntimeInstrument): void {
    for (const voice of this.voices) {
      if (voice.instrumentId === runtime.timeline.instrumentId) {
        this.configureVoiceMix(voice, runtime);
      }
    }
  }

  public startTimelineVoice(
    runtime: WorkletRuntimeInstrument,
    noteId: NoteId,
    pitch: number,
    endTick: number,
  ): void {
    const voice = this.startVoice(runtime, pitch, endTick, null);

    voice?.bindTimelineNote(noteId);
  }

  public hasActiveTimelineVoice(
    instrumentId: InstrumentId,
    noteId: NoteId,
  ): boolean {
    for (let voiceIndex = 0;
      voiceIndex < this.voices.length;
      voiceIndex += 1) {
      const voice = this.voices[voiceIndex];

      if (
        voice !== undefined
        && voice.instrumentId === instrumentId
        && voice.noteId === noteId
        && !voice.ended
        && !voice.releasing
      ) {
        return true;
      }
    }

    return false;
  }

  /** Preserves matching voices and releases only events no longer sounding. */
  public reconcileTimelineInstrument(
    runtime: WorkletRuntimeInstrument,
    currentTick: number,
    playbackBoundaryTick: number,
  ): void {
    const { timeline } = runtime;

    for (const voice of this.voices) {
      if (
        voice.instrumentId !== timeline.instrumentId
        || voice.noteId === null
        || voice.ended
        || voice.releasing
      ) {
        continue;
      }

      const noteIndex = timeline.noteIds.indexOf(voice.noteId);
      const startTick = timeline.startTicks[noteIndex];
      const durationTicks = timeline.durationTicks[noteIndex];
      const pitch = timeline.pitches[noteIndex];
      const noteEndTick = startTick === undefined || durationTicks === undefined
        ? Number.NEGATIVE_INFINITY
        : startTick + durationTicks;

      if (
        !runtime.audible
        || noteIndex < 0
        || startTick === undefined
        || pitch === undefined
        || startTick > currentTick
        || noteEndTick <= currentTick
      ) {
        voice.release(VOICE_STEAL_RELEASE_SECONDS);
        continue;
      }

      voice.reconcileTimelineEvent(
        pitch,
        this.tuningFrequencyHz,
        Math.min(playbackBoundaryTick, noteEndTick),
      );
    }
  }

  public startAuditionVoice(
    runtime: WorkletRuntimeInstrument,
    auditionId: number,
    pitch: number,
  ): void {
    this.startVoice(runtime, pitch, null, auditionId);
  }

  public releaseAuditionVoice(auditionId: number): void {
    for (const voice of this.voices) {
      if (voice.auditionId === auditionId && !voice.ended) {
        voice.release();
      }
    }
  }

  public renderFrame(
    left: Float32Array,
    right: Float32Array,
    frameIndex: number,
  ): void {
    let leftSample = 0;
    let rightSample = 0;

    for (let voiceIndex = 0;
      voiceIndex < this.voices.length;
      voiceIndex += 1) {
      const voice = this.voices[voiceIndex];
      if (voice === undefined) continue;
      if (voice.ended) {
        continue;
      }

      const monoSample = voice.render();

      leftSample += monoSample * voice.leftMixLevel;
      rightSample += monoSample * voice.rightMixLevel;
    }

    left[frameIndex] = sanitizeSample(leftSample);
    right[frameIndex] = sanitizeSample(rightSample);
  }

  public releaseDueTimelineVoices(currentTick: number): void {
    for (let voiceIndex = 0;
      voiceIndex < this.voices.length;
      voiceIndex += 1) {
      const voice = this.voices[voiceIndex];
      if (voice === undefined) continue;
      if (
        !voice.ended
        && !voice.releasing
        && voice.endTick !== null
        && currentTick >= voice.endTick
      ) {
        voice.release();
      }
    }
  }

  public releaseTimelineVoices(): void {
    for (let voiceIndex = 0;
      voiceIndex < this.voices.length;
      voiceIndex += 1) {
      const voice = this.voices[voiceIndex];
      if (voice === undefined) continue;
      if (voice.endTick !== null && !voice.ended) {
        voice.release(VOICE_STEAL_RELEASE_SECONDS);
      }
    }
  }

  public pruneEndedVoices(): void {
    let writeIndex = 0;

    for (let voiceIndex = 0;
      voiceIndex < this.voices.length;
      voiceIndex += 1) {
      const voice = this.voices[voiceIndex];
      if (voice === undefined) continue;
      if (voice.ended) {
        this.availableVoices.push(voice);
      } else {
        this.voices[writeIndex] = voice;
        writeIndex += 1;
      }
    }

    this.voices.length = writeIndex;
  }

  private startVoice(
    runtime: WorkletRuntimeInstrument,
    pitch: number,
    endTick: number | null,
    auditionId: number | null,
  ): WorkletVoiceSlot | undefined {
    const displacedVoice = reserveWorkletVoice(
      this.voices,
      runtime.timeline.instrumentId,
      runtime.config.polyphony,
    );

    const voice = displacedVoice ?? this.availableVoices.pop();

    if (voice === undefined) {
      return undefined;
    }

    this.voiceSequence += 1;
    voice.start(
      runtime.timeline.instrumentId,
      pitch,
      runtime.config,
      this.tuningFrequencyHz,
      this.voiceSequence,
      endTick,
      auditionId,
      runtime.config.oscillator.freePhase
        ? deterministicVoicePhase(this.voiceSequence)
        : 0,
      displacedVoice?.instrumentId === runtime.timeline.instrumentId,
    );

    this.configureVoiceMix(voice, runtime);
    this.voices.push(voice);
    return voice;
  }

  private configureVoiceMix(
    voice: WorkletVoiceSlot,
    runtime: WorkletRuntimeInstrument,
  ): void {
    voice.configureMix(
      runtime.gain,
      runtime.pan,
      runtime.audible,
    );
  }
}

function deterministicVoicePhase(sequence: number): number {
  return (sequence * 0.618_033_988_749_894_9) % 1;
}

function sanitizeSample(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
