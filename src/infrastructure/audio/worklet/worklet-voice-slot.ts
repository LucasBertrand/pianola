import type {
  InstrumentId,
  NoteId,
} from "../../../domain/identifiers";
import {
  SynthVoice,
} from "../synth/synth-voice";
import type {
  SynthRuntimeConfig,
} from "../synth/synth-runtime-config";

/** Worklet-owned scheduling, allocation and stereo state around one DSP voice. */
export class WorkletVoiceSlot {
  public instrumentId: InstrumentId = "";
  public noteId: NoteId | null = null;
  public sequence = 0;
  public endTick: number | null = null;
  private auditionSamples: number | null = null;
  private mixLeft = 0;
  private mixRight = 0;
  private readonly voice: SynthVoice;

  public constructor(sampleRate: number) {
    this.voice = new SynthVoice(sampleRate);
  }

  public start(
    instrumentId: InstrumentId,
    pitch: number,
    config: SynthRuntimeConfig,
    tuningFrequencyHz: number,
    sequence: number,
    endTick: number | null,
    auditionSamples: number | null,
    initialPhase: number,
    preserveContinuity: boolean,
  ): void {
    this.instrumentId = instrumentId;
    this.noteId = null;
    this.sequence = sequence;
    this.endTick = endTick;
    this.auditionSamples = auditionSamples;
    this.mixLeft = 0;
    this.mixRight = 0;
    this.voice.start(
      pitch,
      config,
      tuningFrequencyHz,
      initialPhase,
      preserveContinuity,
    );
  }

  public bindTimelineNote(noteId: NoteId): void {
    this.noteId = noteId;
  }

  public reconcileTimelineEvent(
    pitch: number,
    tuningFrequencyHz: number,
    endTick: number,
  ): void {
    this.endTick = endTick;
    this.voice.reconcileTimelineEvent(pitch, tuningFrequencyHz);
  }

  public get ended(): boolean {
    return this.voice.ended;
  }

  public get releasing(): boolean {
    return this.voice.releasing;
  }

  public get level(): number {
    return this.voice.level;
  }

  public preview(config: SynthRuntimeConfig): void {
    this.voice.preview(config);
  }

  public retune(tuningFrequencyHz: number): void {
    this.voice.retune(tuningFrequencyHz);
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
    this.auditionSamples = null;
    this.voice.release(releaseSeconds);
  }

  public render(): number {
    if (this.auditionSamples !== null) {
      this.auditionSamples -= 1;
      if (this.auditionSamples <= 0) {
        this.release();
      }
    }
    return this.voice.render();
  }
}
