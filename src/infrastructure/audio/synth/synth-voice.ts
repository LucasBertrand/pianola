import {
  SampleEnvelope,
} from "./envelope/sample-envelope";
import {
  StateVariableLowpass,
} from "./filter/state-variable-lowpass";
import {
  PolyBlepOscillator,
} from "./oscillator/polyblep-oscillator";
import {
  SmoothedParameter,
} from "./parameters/smoothed-parameter";
import {
  AUDIO_CONSTANTS,
} from "../audio-constants";
import type {
  SynthRuntimeConfig,
} from "./synth-runtime-config";

/** Reusable monophonic synth generator initialized from the fixed worklet pool. */
export class SynthVoice {
  private readonly amplitudeEnvelope = new SampleEnvelope();
  private readonly filterEnvelope = new SampleEnvelope();
  private readonly oscillator = new PolyBlepOscillator();
  private readonly lowpass: StateVariableLowpass;
  private readonly frequencyHz: SmoothedParameter;
  private readonly pulseWidth: SmoothedParameter;
  private baseFrequencyHz = 440;
  private oscillatorDetuneCents = 0;
  private pitch = 69;
  private waveform: SynthRuntimeConfig["oscillator"]["waveform"] = "sine";
  private released = false;

  public constructor(private readonly sampleRate: number) {
    this.frequencyHz = new SmoothedParameter(sampleRate, 440);
    this.pulseWidth = new SmoothedParameter(sampleRate, 0.5);
    this.lowpass = new StateVariableLowpass(sampleRate);
  }

  public start(
    pitch: number,
    config: SynthRuntimeConfig,
    tuningFrequencyHz: number,
    initialPhase: number,
    preserveContinuity = false,
  ): void {
    const amplitudeStartValue = preserveContinuity
      ? this.amplitudeEnvelope.currentValue
      : 0;
    const filterEnvelopeStartValue = preserveContinuity
      ? this.filterEnvelope.currentValue
      : 0;

    this.baseFrequencyHz = tuningFrequencyHz * 2 ** ((pitch - 69) / 12);
    this.pitch = pitch;
    this.waveform = config.oscillator.waveform;
    this.pulseWidth.reset(config.oscillator.pulseWidth);
    this.oscillatorDetuneCents = config.oscillator.detuneCents;
    this.frequencyHz.reset(
      this.baseFrequencyHz * 2 ** (config.oscillator.detuneCents / 1_200),
    );
    if (!preserveContinuity) {
      this.oscillator.reset(initialPhase);
    }
    this.lowpass.reset(config.filter, preserveContinuity);
    this.released = false;
    this.amplitudeEnvelope.reset(
      config.amplitudeEnvelope,
      this.sampleRate,
      amplitudeStartValue,
    );
    this.filterEnvelope.reset(
      config.filterEnvelope,
      this.sampleRate,
      filterEnvelopeStartValue,
    );
  }

  public reconcileTimelineEvent(
    pitch: number,
    tuningFrequencyHz: number,
  ): void {
    this.pitch = pitch;
    this.baseFrequencyHz = tuningFrequencyHz * 2 ** ((pitch - 69) / 12);
    this.frequencyHz.setTarget(
      this.baseFrequencyHz * 2 ** (this.oscillatorDetuneCents / 1_200),
    );
  }

  public get ended(): boolean {
    return this.amplitudeEnvelope.ended;
  }

  public get releasing(): boolean {
    return this.released;
  }

  public get level(): number {
    return this.amplitudeEnvelope.currentValue;
  }

  public preview(config: SynthRuntimeConfig): void {
    this.waveform = config.oscillator.waveform;
    this.oscillatorDetuneCents = config.oscillator.detuneCents;
    this.frequencyHz.setTarget(
      this.baseFrequencyHz * 2 ** (config.oscillator.detuneCents / 1_200),
    );
    this.pulseWidth.setTarget(config.oscillator.pulseWidth);
    this.lowpass.preview(config.filter);
    this.amplitudeEnvelope.previewSustainLevel(
      config.amplitudeEnvelope.sustainLevel,
    );
    this.filterEnvelope.previewSustainLevel(
      config.filterEnvelope.sustainLevel,
    );
    this.amplitudeEnvelope.previewCurve(config.amplitudeEnvelope.curve);
    this.filterEnvelope.previewCurve(config.filterEnvelope.curve);
  }

  public retune(tuningFrequencyHz: number): void {
    this.baseFrequencyHz = tuningFrequencyHz * 2 ** ((this.pitch - 69) / 12);
    this.frequencyHz.setTarget(
      this.baseFrequencyHz * 2 ** (this.oscillatorDetuneCents / 1_200),
    );
  }

  public release(releaseSeconds?: number): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.amplitudeEnvelope.release(releaseSeconds, this.sampleRate);
    this.filterEnvelope.release(releaseSeconds, this.sampleRate);
  }

  public render(): number {
    const frequencyHz = Math.min(this.sampleRate * 0.45, this.frequencyHz.next());
    const oscillatorSample = this.oscillator.render(
      this.waveform,
      frequencyHz / this.sampleRate,
      this.pulseWidth.next(),
    );
    const filteredSample = this.lowpass.process(
      oscillatorSample,
      this.filterEnvelope.next(),
      this.pitch,
    );
    return filteredSample
      * this.amplitudeEnvelope.next()
      * AUDIO_CONSTANTS.fixedNoteEnvelopePeakLevel;
  }
}
