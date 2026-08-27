import type {
  InstrumentId,
  NoteId,
} from "../../domain/identifiers";
import type {
  SubtractivePlaybackPresetSnapshot,
} from "../playback-model";
import {
  PolyBlepOscillator,
} from "./polyblep-oscillator";
import {
  SampleEnvelope,
} from "./sample-envelope";

const PARAMETER_SMOOTHING_SECONDS = 0.01;
const FIXED_NOTE_LEVEL = 100 / 127;
// Updating at 1.5 kHz for a 48 kHz context keeps envelope motion smooth while
// avoiding a transcendental filter calculation for every voice/sample.
const FILTER_COEFFICIENT_UPDATE_SAMPLES = 32;

/** Reusable DSP voice initialized from the fixed worklet-side pool. */
export class SubtractiveWorkletVoice {
  public instrumentId: InstrumentId = "";
  public noteId: NoteId | null = null;
  public sequence = 0;
  public endTick: number | null = null;
  private auditionSamples: number | null = null;
  private readonly amplitudeEnvelope = new SampleEnvelope();
  private readonly filterEnvelope = new SampleEnvelope();
  private baseFrequencyHz = 440;
  private waveform: SubtractivePlaybackPresetSnapshot["oscillatorWaveform"] =
    "sine";
  private pulseWidth = 0.5;
  private targetPulseWidth = 0.5;
  private filterEnvelopeAmountOctaves = 0;
  private targetFilterEnvelopeAmountOctaves = 0;
  private oscillatorDetuneCents = 0;
  private pitch = 69;
  private filterKeyTracking = 0;
  private targetFilterKeyTracking = 0;
  private readonly oscillator = new PolyBlepOscillator();
  private filterIntegratorOne = 0;
  private filterIntegratorTwo = 0;
  private frequencyHz = 440;
  private targetFrequencyHz = 440;
  private filterCutoffHz = 20_000;
  private targetFilterCutoffHz = 20_000;
  private filterResonance = 0;
  private targetFilterResonance = 0;
  private readonly smoothingCoefficient: number;
  private released = false;
  private filterCoefficientCountdown = 0;
  private filterG = 0;
  private filterDamping = 1;
  private mixLeft = 0;
  private mixRight = 0;

  public constructor(private readonly sampleRate: number) {
    this.smoothingCoefficient = 1 - Math.exp(
      -1 / (PARAMETER_SMOOTHING_SECONDS * sampleRate),
    );
  }

  public start(
    instrumentId: InstrumentId,
    pitch: number,
    config: SubtractivePlaybackPresetSnapshot,
    tuningFrequencyHz: number,
    sequence: number,
    endTick: number | null,
    auditionSamples: number | null,
    preserveContinuity = false,
  ): void {
    const amplitudeStartValue = preserveContinuity
      ? this.amplitudeEnvelope.currentValue
      : 0;
    const filterEnvelopeStartValue = preserveContinuity
      ? this.filterEnvelope.currentValue
      : 0;

    this.instrumentId = instrumentId;
    this.noteId = null;
    this.sequence = sequence;
    this.endTick = endTick;
    this.auditionSamples = auditionSamples;
    this.baseFrequencyHz = tuningFrequencyHz
      * 2 ** ((pitch - 69) / 12);
    this.pitch = pitch;
    this.waveform = config.oscillatorWaveform;
    this.pulseWidth = config.pulseWidth;
    this.targetPulseWidth = config.pulseWidth;
    this.filterEnvelopeAmountOctaves =
      config.filterEnvelopeAmountOctaves;
    this.targetFilterEnvelopeAmountOctaves =
      config.filterEnvelopeAmountOctaves;
    this.oscillatorDetuneCents = config.oscillatorDetuneCents;
    this.filterKeyTracking = config.filterKeyTracking;
    this.targetFilterKeyTracking = config.filterKeyTracking;
    this.frequencyHz = this.baseFrequencyHz
      * 2 ** (config.oscillatorDetuneCents / 1_200);
    this.targetFrequencyHz = this.frequencyHz;
    this.filterCutoffHz = config.filterCutoffHz;
    this.targetFilterCutoffHz = this.filterCutoffHz;
    this.filterResonance = config.filterResonance;
    this.targetFilterResonance = this.filterResonance;
    if (!preserveContinuity) {
      this.oscillator.reset(config.oscillatorFreePhase ? Math.random() : 0);
      this.filterIntegratorOne = 0;
      this.filterIntegratorTwo = 0;
    }
    this.released = false;
    this.filterCoefficientCountdown = 0;
    this.filterG = 0;
    this.filterDamping = 1;
    this.mixLeft = 0;
    this.mixRight = 0;
    this.amplitudeEnvelope.reset(
      config.envelope,
      this.sampleRate,
      amplitudeStartValue,
    );
    this.filterEnvelope.reset(
      config.filterEnvelope,
      this.sampleRate,
      filterEnvelopeStartValue,
    );
  }

  public bindTimelineNote(noteId: NoteId): void {
    this.noteId = noteId;
  }

  /** Updates a sounding timeline event without resetting its DSP state. */
  public reconcileTimelineEvent(
    pitch: number,
    tuningFrequencyHz: number,
    endTick: number,
  ): void {
    this.pitch = pitch;
    this.baseFrequencyHz = tuningFrequencyHz
      * 2 ** ((pitch - 69) / 12);
    this.targetFrequencyHz = this.baseFrequencyHz
      * 2 ** (this.oscillatorDetuneCents / 1_200);
    this.endTick = endTick;
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

  public preview(config: SubtractivePlaybackPresetSnapshot): void {
    this.oscillatorDetuneCents = config.oscillatorDetuneCents;
    this.targetFrequencyHz = this.baseFrequencyHz
      * 2 ** (config.oscillatorDetuneCents / 1_200);
    this.targetPulseWidth = config.pulseWidth;
    this.targetFilterEnvelopeAmountOctaves =
      config.filterEnvelopeAmountOctaves;
    this.amplitudeEnvelope.previewSustainLevel(
      config.envelope.sustainLevel,
    );
    this.targetFilterCutoffHz = config.filterCutoffHz;
    this.targetFilterResonance = config.filterResonance;
    this.targetFilterKeyTracking = config.filterKeyTracking;
    this.filterEnvelope.previewSustainLevel(
      config.filterEnvelope.sustainLevel,
    );
    this.amplitudeEnvelope.previewCurve(config.envelope.curve);
    this.filterEnvelope.previewCurve(config.filterEnvelope.curve);
  }

  public retune(tuningFrequencyHz: number): void {
    this.baseFrequencyHz = tuningFrequencyHz
      * 2 ** ((this.pitch - 69) / 12);
    this.targetFrequencyHz = this.baseFrequencyHz
      * 2 ** (this.oscillatorDetuneCents / 1_200);
  }

  public configureMix(gain: number, pan: number, audible: boolean): void {
    if (!audible) {
      this.mixLeft = 0;
      this.mixRight = 0;
      return;
    }

    const angle = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;

    this.mixLeft = gain * Math.cos(angle);
    this.mixRight = gain * Math.sin(angle);
  }

  public get leftMixLevel(): number {
    return this.mixLeft;
  }

  public get rightMixLevel(): number {
    return this.mixRight;
  }

  public release(releaseSeconds?: number): void {
    if (this.released) {
      return;
    }

    this.released = true;
    this.auditionSamples = null;
    this.amplitudeEnvelope.release(releaseSeconds, this.sampleRate);
    this.filterEnvelope.release(releaseSeconds, this.sampleRate);
  }

  public render(): number {
    if (this.auditionSamples !== null) {
      this.auditionSamples -= 1;

      if (this.auditionSamples <= 0) {
        this.release();
      }
    }

    this.frequencyHz += (
      this.targetFrequencyHz - this.frequencyHz
    ) * this.smoothingCoefficient;
    this.pulseWidth += (
      this.targetPulseWidth - this.pulseWidth
    ) * this.smoothingCoefficient;
    this.filterEnvelopeAmountOctaves += (
      this.targetFilterEnvelopeAmountOctaves
      - this.filterEnvelopeAmountOctaves
    ) * this.smoothingCoefficient;
    this.filterCutoffHz += (
      this.targetFilterCutoffHz - this.filterCutoffHz
    ) * this.smoothingCoefficient;
    this.filterResonance += (
      this.targetFilterResonance - this.filterResonance
    ) * this.smoothingCoefficient;
    this.filterKeyTracking += (
      this.targetFilterKeyTracking - this.filterKeyTracking
    ) * this.smoothingCoefficient;

    const frequencyHz = Math.min(
      this.sampleRate * 0.45,
      this.frequencyHz,
    );
    const phaseIncrement = frequencyHz / this.sampleRate;
    const oscillatorSample = this.renderOscillator(phaseIncrement);
    const filterEnvelope = this.filterEnvelope.next();
    const filteredSample = this.renderLowpass(
      oscillatorSample,
      filterEnvelope,
      this.filterResonance,
    );

    return filteredSample * this.amplitudeEnvelope.next() * FIXED_NOTE_LEVEL;
  }

  private renderOscillator(phaseIncrement: number): number {
    return this.oscillator.render(
      this.waveform,
      phaseIncrement,
      this.pulseWidth,
    );
  }

  private renderLowpass(
    input: number,
    filterEnvelope: number,
    resonance: number,
  ): number {
    if (this.filterCoefficientCountdown <= 0) {
      const cutoffHz = this.filterCutoffHz
        * 2 ** (
          this.filterEnvelopeAmountOctaves * filterEnvelope
          + ((this.pitch - 60) / 12) * this.filterKeyTracking
        );
      const clampedCutoff = Math.min(
        this.sampleRate * 0.45,
        Math.max(20, cutoffHz),
      );

      this.filterG = Math.tan(
        Math.PI * clampedCutoff / this.sampleRate,
      );
      this.filterDamping = 1 / Math.max(0.5, resonance);
      this.filterCoefficientCountdown =
        FILTER_COEFFICIENT_UPDATE_SAMPLES;
    }

    this.filterCoefficientCountdown -= 1;
    const denominator = 1 + this.filterG
      * (this.filterG + this.filterDamping);
    const band = (
      this.filterIntegratorOne
      + this.filterG * (input - this.filterIntegratorTwo)
    ) / denominator;
    const low = this.filterIntegratorTwo + this.filterG * band;

    this.filterIntegratorOne = 2 * band - this.filterIntegratorOne;
    this.filterIntegratorTwo = 2 * low - this.filterIntegratorTwo;
    return Number.isFinite(low) ? low : 0;
  }
}
