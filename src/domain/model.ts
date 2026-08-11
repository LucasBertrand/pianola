import {
  PROJECT_CONSTANTS,
} from "../config/program-constants";

export type NoteId = string;
export type InstrumentId = string;
export type PresetId = string;
export type ClipId = string;
export type EffectId = string;
export type RuleId = string;
export type Tick = number;
export type MidiPitch = number;
export type MidiVelocity = number;

export const DEFAULT_PPQN = PROJECT_CONSTANTS.ppqn;
export const PROJECT_SCHEMA_VERSION =
  PROJECT_CONSTANTS.schemaVersion;
export const DEFAULT_MEASURE_COUNT =
  PROJECT_CONSTANTS.defaultMeasureCount;
export const DEFAULT_MASTER_GAIN =
  PROJECT_CONSTANTS.defaultMasterGain;
export const MINIMUM_MASTER_GAIN =
  PROJECT_CONSTANTS.minimumMasterGain;
export const MAXIMUM_MASTER_GAIN =
  PROJECT_CONSTANTS.maximumMasterGain;
export const DEFAULT_MASTER_TUNING_FREQUENCY_HZ =
  PROJECT_CONSTANTS.defaultMasterTuningFrequencyHz;
export const MINIMUM_MASTER_TUNING_FREQUENCY_HZ =
  PROJECT_CONSTANTS.minimumMasterTuningFrequencyHz;
export const MAXIMUM_MASTER_TUNING_FREQUENCY_HZ =
  PROJECT_CONSTANTS.maximumMasterTuningFrequencyHz;
export const DEFAULT_SUBTRACTIVE_SYNTH_POLYPHONY =
  PROJECT_CONSTANTS.defaultSubtractiveSynthPolyphony;
export const MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY =
  PROJECT_CONSTANTS.minimumSubtractiveSynthPolyphony;
export const MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY =
  PROJECT_CONSTANTS.maximumSubtractiveSynthPolyphony;
export const MINIMUM_MEASURE_COUNT =
  PROJECT_CONSTANTS.minimumMeasureCount;
export const MAXIMUM_MEASURE_COUNT =
  PROJECT_CONSTANTS.maximumMeasureCount;
export const MAXIMUM_ENTITY_ID_LENGTH =
  PROJECT_CONSTANTS.maximumEntityIdLength;
export const MAXIMUM_PROJECT_TITLE_LENGTH =
  PROJECT_CONSTANTS.maximumProjectTitleLength;
export const MAXIMUM_CLIP_NAME_LENGTH =
  PROJECT_CONSTANTS.maximumClipNameLength;
export const MAXIMUM_PROJECT_CLIP_COUNT =
  PROJECT_CONSTANTS.maximumClipCount;
export const MAXIMUM_INSTRUMENT_NAME_LENGTH =
  PROJECT_CONSTANTS.maximumInstrumentNameLength;
export const MAXIMUM_PROJECT_INSTRUMENT_COUNT =
  PROJECT_CONSTANTS.maximumInstrumentCount;
export const MAXIMUM_CLIP_NOTE_COUNT =
  PROJECT_CONSTANTS.maximumNoteCount;
export const MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT =
  PROJECT_CONSTANTS.maximumInstrumentDescriptorCount;
export const MAXIMUM_DESCRIPTOR_PARAMETER_COUNT =
  PROJECT_CONSTANTS.maximumDescriptorParameterCount;

export interface Note {
  readonly id: NoteId;
  readonly pitch: MidiPitch;
  readonly startTick: Tick;
  readonly durationTicks: Tick;
  readonly velocity: MidiVelocity;
  readonly instrumentId: InstrumentId;
  readonly enabled: boolean;
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
  readonly polyphony: number;
  readonly oscillatorDetuneCents: number;
  readonly pulseWidth: number;
  readonly envelope: AdsrEnvelope;
  readonly filterCutoffHz: number;
  readonly filterResonance: number;
  readonly filterEnvelopeAmountOctaves: number;
  readonly filterEnvelope: AdsrEnvelope;
}

export type InstrumentConfig = SubtractiveSynthConfig;

export interface SubtractiveSynthPreset {
  readonly id: PresetId;
  readonly name: string;
  readonly kind: "subtractive";
  readonly config: SubtractiveSynthConfig;
}

/** A named, reusable sound definition shared by every clip. */
export type InstrumentPreset = SubtractiveSynthPreset;

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

export interface ProjectInstrumentInterpretation {
  readonly transposeSemitones: number;
  readonly timingOffsetTicks: Tick;
  readonly gateRatio: number;
  readonly velocityScale: number;
  readonly probability: number;
}

export interface ProjectInstrument {
  readonly id: InstrumentId;
  readonly name: string;
  readonly color: string;
  readonly pan: number;
  readonly effects: readonly EffectDescriptor[];
  readonly generativeRules: readonly GenerativeRuleDescriptor[];
  readonly interpretation: ProjectInstrumentInterpretation;
}

/** Per-clip mixer, editing, and preset selection for one global instrument. */
export interface ClipInstrumentState {
  readonly gain: number;
  readonly muted: boolean;
  readonly locked: boolean;
  readonly solo: boolean;
  readonly presetId: PresetId;
}

export interface Track {
  readonly instrumentId: InstrumentId;
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

export interface MasterBusState {
  readonly gain: number;
  readonly muted: boolean;
  readonly tuningFrequencyHz: number;
}

/** Self-contained musical material rendered by the piano-roll editor. */
export interface Clip {
  readonly id: ClipId;
  readonly name: string;
  readonly measureCount: number;
  readonly tracksByInstrumentId: Readonly<Record<InstrumentId, Track>>;
  readonly instrumentStatesById: Readonly<Record<InstrumentId, ClipInstrumentState>>;
  readonly transportSettings: TransportState;
}

export function getActiveClipInstrumentState(
  state: ProjectState,
  instrumentId: InstrumentId,
): ClipInstrumentState | undefined {
  return getActiveClip(state).instrumentStatesById[instrumentId];
}

export interface ProjectState {
  readonly schemaVersion: number;
  readonly revision: number;
  readonly title: string;
  readonly projectInstrumentsById: Readonly<Record<InstrumentId, ProjectInstrument>>;
  readonly instrumentOrder: readonly InstrumentId[];
  readonly instrumentPresetsById: Readonly<Record<PresetId, InstrumentPreset>>;
  readonly instrumentPresetOrder: readonly PresetId[];
  readonly clipsById: Readonly<Record<ClipId, Clip>>;
  readonly clipOrder: readonly ClipId[];
  readonly activeClipId: ClipId;
  readonly masterBus: MasterBusState;
}

export type AudioLatencyHint = "interactive" | "balanced" | "playback" | number;

export interface AudioEngineConfig {
  readonly latencyHint: AudioLatencyHint;
  readonly schedulerPulseIntervalMs: number;
  readonly scheduleAheadSeconds: number;
  readonly lateEventToleranceSeconds: number;
  readonly latencyCompensationSeconds: number;
  readonly masterGain: number;
  readonly maximumRendererPolyphony: number;
  readonly releaseTailSeconds: number;
}

export function createDefaultTransportState(): TransportState {
  return {
    bpm: PROJECT_CONSTANTS.defaultTempoBpm,
    timeSignature: {
      numerator:
        PROJECT_CONSTANTS.defaultTimeSignatureNumerator,
      denominator:
        PROJECT_CONSTANTS.defaultTimeSignatureDenominator,
    },
    loop: {
      startTick: 0,
      endTick:
        DEFAULT_PPQN
        * 4
        * PROJECT_CONSTANTS.defaultTimeSignatureNumerator
        / PROJECT_CONSTANTS.defaultTimeSignatureDenominator,
    },
    loopEnabled: PROJECT_CONSTANTS.defaultLoopEnabled,
    ppqn: DEFAULT_PPQN,
    anchorTick: 0,
    anchorAudioTimeSeconds: null,
  };
}

export function createDefaultMasterBusState(): MasterBusState {
  return {
    gain: DEFAULT_MASTER_GAIN,
    muted: PROJECT_CONSTANTS.defaultMasterMuted,
    tuningFrequencyHz: DEFAULT_MASTER_TUNING_FREQUENCY_HZ,
  };
}

export function getActiveClipDurationTicks(
  state: ProjectState,
): number {
  return getClipDurationTicks(getActiveClip(state));
}

export function getClipDurationTicks(
  clip: Pick<Clip, "measureCount" | "transportSettings">,
): number {
  return (
    clip.measureCount
    * getTicksPerMeasure(clip.transportSettings)
  );
}

export function getActiveClip(state: ProjectState): Clip {
  const clip = state.clipsById[state.activeClipId];

  if (clip === undefined) {
    throw new Error(
      `Active clip "${state.activeClipId}" does not exist.`,
    );
  }

  return clip;
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
