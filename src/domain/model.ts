export type NoteId = string;
export type VoiceId = string;
export type EffectId = string;
export type RuleId = string;
export type Tick = number;
export type MidiPitch = number;
export type MidiVelocity = number;

export const DEFAULT_PPQN = 960 as const;
export const PROJECT_SCHEMA_VERSION = 2 as const;
export const DEFAULT_MEASURE_COUNT = 16 as const;
export const MINIMUM_MEASURE_COUNT = 1 as const;
export const MAXIMUM_MEASURE_COUNT = 256 as const;
export const MAXIMUM_ENTITY_ID_LENGTH = 160 as const;
export const MAXIMUM_PROJECT_TITLE_LENGTH = 200 as const;
export const MAXIMUM_VOICE_NAME_LENGTH = 128 as const;
export const MAXIMUM_PROJECT_VOICE_COUNT = 256 as const;
export const MAXIMUM_PROJECT_NOTE_COUNT = 250_000 as const;
export const MAXIMUM_VOICE_DESCRIPTOR_COUNT = 128 as const;
export const MAXIMUM_DESCRIPTOR_PARAMETER_COUNT = 256 as const;

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

export type InstrumentConfig = SubtractiveSynthConfig;

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
  readonly locked: boolean;
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
  readonly loop: LoopRegion;
  readonly loopEnabled: boolean;
  readonly ppqn: number;
  readonly anchorTick: Tick;
  readonly anchorAudioTimeSeconds: number | null;
}

export interface ProjectState {
  readonly schemaVersion: number;
  readonly revision: number;
  readonly title: string;
  readonly measureCount: number;
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
    loop: {
      startTick: 0,
      endTick: DEFAULT_PPQN * 4,
    },
    loopEnabled: false,
    ppqn: DEFAULT_PPQN,
    anchorTick: 0,
    anchorAudioTimeSeconds: null,
  };
}

export function getProjectDurationTicks(
  state: Pick<ProjectState, "measureCount" | "transportSettings">,
): number {
  return (
    state.measureCount
    * getTicksPerMeasure(state.transportSettings)
  );
}

export function getTicksPerMeasure(
  transport: TransportState,
): number {
  return (
    transport.ppqn
    * 4
    * transport.timeSignature.numerator
    / transport.timeSignature.denominator
  );
}
