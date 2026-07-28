export type NoteId = string;
export type VoiceId = string;
export type EffectId = string;
export type RuleId = string;
export type Tick = number;
export type MidiPitch = number;
export type MidiVelocity = number;

export const DEFAULT_PPQN = 960 as const;

export interface Note {
  readonly id: NoteId;
  readonly pitch: MidiPitch;
  readonly startTick: Tick;
  readonly durationTicks: Tick;
  readonly velocity: MidiVelocity;
  readonly voiceId: VoiceId;
}

export interface AdsrEnvelope {
  readonly attackSeconds: number;
  readonly decaySeconds: number;
  readonly sustainLevel: number;
  readonly releaseSeconds: number;
}

export type OscillatorWaveform =
  | "sine"
  | "square"
  | "sawtooth"
  | "triangle";

export interface SubtractiveSynthConfig {
  readonly kind: "subtractive";
  readonly oscillatorWaveform: OscillatorWaveform;
  readonly oscillatorDetuneCents: number;
  readonly envelope: AdsrEnvelope;
  readonly filterCutoffHz: number;
  readonly filterResonance: number;
}

export interface FmSynthConfig {
  readonly kind: "fm";
  readonly carrierWaveform: OscillatorWaveform;
  readonly modulatorWaveform: OscillatorWaveform;
  readonly modulationRatio: number;
  readonly modulationIndex: number;
  readonly envelope: AdsrEnvelope;
}

export type InstrumentConfig = SubtractiveSynthConfig | FmSynthConfig;

export type EffectParameterValue = number | boolean | string;

export interface EffectDescriptor {
  readonly id: EffectId;
  readonly kind: string;
  readonly enabled: boolean;
  readonly parameters: Readonly<Record<string, EffectParameterValue>>;
}

export interface GenerativeRuleDescriptor {
  readonly id: RuleId;
  readonly kind: string;
  readonly enabled: boolean;
  readonly parameters: Readonly<Record<string, number | boolean | string>>;
}

export interface VoiceInterpretation {
  readonly transposeSemitones: number;
  readonly timingOffsetTicks: Tick;
  readonly gateRatio: number;
  readonly velocityScale: number;
  readonly probability: number;
}

export interface Voice {
  readonly id: VoiceId;
  readonly name: string;
  readonly color: string;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly gain: number;
  readonly pan: number;
  readonly instrument: InstrumentConfig;
  readonly effects: readonly EffectDescriptor[];
  readonly generativeRules: readonly GenerativeRuleDescriptor[];
  readonly interpretation: VoiceInterpretation;
}

export interface Track {
  readonly voiceId: VoiceId;
  readonly notesById: Readonly<Record<NoteId, Note>>;
}

export interface TimeSignature {
  readonly numerator: number;
  readonly denominator: 1 | 2 | 4 | 8 | 16 | 32;
}

export interface LoopRegion {
  readonly startTick: Tick;
  readonly endTick: Tick;
}

export interface TransportState {
  readonly bpm: number;
  readonly timeSignature: TimeSignature;
  readonly loop: LoopRegion | null;
  readonly ppqn: number;
  readonly anchorTick: Tick;
  readonly anchorAudioTimeSeconds: number | null;
}

export interface ProjectState {
  readonly schemaVersion: number;
  readonly revision: number;
  readonly voicesById: Readonly<Record<VoiceId, Voice>>;
  readonly voiceOrder: readonly VoiceId[];
  readonly tracksByVoiceId: Readonly<Record<VoiceId, Track>>;
  readonly transportSettings: TransportState;
}

export type AudioLatencyHint = "interactive" | "balanced" | "playback" | number;

export interface AudioEngineConfig {
  readonly latencyHint: AudioLatencyHint;
  readonly schedulerPulseIntervalMs: number;
  readonly scheduleAheadSeconds: number;
  readonly lateEventToleranceSeconds: number;
  readonly latencyCompensationSeconds: number;
  readonly masterGain: number;
  readonly maxPolyphonyPerVoice: number;
  readonly releaseTailSeconds: number;
}

export function createDefaultTransportState(): TransportState {
  return {
    bpm: 120,
    timeSignature: {
      numerator: 4,
      denominator: 4,
    },
    loop: null,
    ppqn: DEFAULT_PPQN,
    anchorTick: 0,
    anchorAudioTimeSeconds: null,
  };
}
