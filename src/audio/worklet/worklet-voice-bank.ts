import type {
  InstrumentId,
} from "../../domain/identifiers";
import type {
  SubtractivePlaybackPresetSnapshot,
} from "../playback-model";
import {
  SubtractiveWorkletVoice,
} from "./subtractive-worklet-voice";
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
  private readonly voices: SubtractiveWorkletVoice[];
  private readonly availableVoices: SubtractiveWorkletVoice[];
  private voiceSequence = 0;
  private tuningFrequencyHz = 440;

  public constructor(private readonly sampleRate: number) {
    this.voices = new Array<SubtractiveWorkletVoice>(
      GLOBAL_VOICE_STORAGE_LIMIT,
    );
    this.voices.length = 0;
    this.availableVoices = new Array<SubtractiveWorkletVoice>(
      GLOBAL_VOICE_STORAGE_LIMIT,
    );

    for (
      let voiceIndex = 0;
      voiceIndex < GLOBAL_VOICE_STORAGE_LIMIT;
      voiceIndex += 1
    ) {
      this.availableVoices[voiceIndex] =
        new SubtractiveWorkletVoice(sampleRate);
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
    config: SubtractivePlaybackPresetSnapshot,
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
    pitch: number,
    endTick: number,
  ): void {
    this.startVoice(runtime, pitch, endTick, null);
  }

  public startAuditionVoice(
    runtime: WorkletRuntimeInstrument,
    pitch: number,
    durationSeconds: number,
  ): void {
    this.startVoice(
      runtime,
      pitch,
      null,
      Math.max(1, Math.round(durationSeconds * this.sampleRate)),
    );
  }

  public renderFrame(
    left: Float32Array,
    right: Float32Array,
    frameIndex: number,
  ): void {
    let leftSample = 0;
    let rightSample = 0;

    for (const voice of this.voices) {
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
    for (const voice of this.voices) {
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
    for (const voice of this.voices) {
      if (voice.endTick !== null && !voice.ended) {
        voice.release(VOICE_STEAL_RELEASE_SECONDS);
      }
    }
  }

  public pruneEndedVoices(): void {
    let writeIndex = 0;

    for (const voice of this.voices) {
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
    auditionSamples: number | null,
  ): void {
    const displacedVoice = reserveWorkletVoice(
      this.voices,
      runtime.timeline.instrumentId,
      runtime.config.polyphony,
    );

    const voice = displacedVoice ?? this.availableVoices.pop();

    if (voice === undefined) {
      return;
    }

    this.voiceSequence += 1;
    voice.start(
      runtime.timeline.instrumentId,
      pitch,
      runtime.config,
      this.tuningFrequencyHz,
      this.voiceSequence,
      endTick,
      auditionSamples,
      displacedVoice?.instrumentId === runtime.timeline.instrumentId,
    );

    this.configureVoiceMix(voice, runtime);
    this.voices.push(voice);
  }

  private configureVoiceMix(
    voice: SubtractiveWorkletVoice,
    runtime: WorkletRuntimeInstrument,
  ): void {
    voice.configureMix(
      runtime.gain,
      runtime.timeline.pan,
      runtime.audible,
    );
  }
}

function sanitizeSample(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
