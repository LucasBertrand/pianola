import type {
  AudioEngineConfig,
  VoiceId,
} from "../domain/model";
import {
  AUDIO_CONSTANTS,
} from "../config/program-constants";
import type {
  AudioEnginePort,
  PlaybackSnapshot,
  PlaybackVoiceSnapshot,
  ScheduledNoteEvent,
} from "./contracts";
import {
  countOverlappingVoiceWindows,
  findOldestOverlappingVoiceIndex,
} from "./voice-allocation";
import type {
  ActiveInstrumentVoice,
  InstrumentRenderer,
} from "./instruments/contracts";
import {
  SubtractiveInstrumentRenderer,
} from "./instruments/subtractive-instrument-renderer";

export type AudioContextFactory = (
  config: AudioEngineConfig,
) => AudioContext;

interface VoiceBus {
  readonly gainNode: GainNode;
  readonly panNode: StereoPannerNode;
}

const DEFAULT_INSTRUMENT_RENDERERS: readonly InstrumentRenderer[] =
  Object.freeze([
    new SubtractiveInstrumentRenderer(),
  ]);

/** Owns the shared Web Audio graph and delegates sound creation by kind. */
export class WebAudioEngine implements AudioEnginePort {
  private currentConfig: AudioEngineConfig;
  private currentSnapshot: PlaybackSnapshot;
  private readonly contextFactory: AudioContextFactory;
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private readonly voiceBuses = new Map<VoiceId, VoiceBus>();
  private readonly activeVoicesByVoiceId =
    new Map<VoiceId, ActiveInstrumentVoice[]>();
  private readonly instrumentRenderers =
    new Map<string, InstrumentRenderer>();
  private readonly scheduledOccurrenceIds = new Set<string>();
  private latestGeneration = 0;
  private disposed = false;

  public constructor(
    config: AudioEngineConfig,
    snapshot: PlaybackSnapshot,
    contextFactory: AudioContextFactory = createBrowserAudioContext,
    instrumentRenderers: readonly InstrumentRenderer[] =
      DEFAULT_INSTRUMENT_RENDERERS,
  ) {
    this.currentConfig = {
      ...config,
      masterGain: snapshot.masterGain,
    };
    this.currentSnapshot = snapshot;
    this.contextFactory = contextFactory;

    for (const renderer of instrumentRenderers) {
      if (this.instrumentRenderers.has(renderer.kind)) {
        throw new Error(
          `Instrument renderer "${renderer.kind}" is registered more than once.`,
        );
      }

      this.instrumentRenderers.set(renderer.kind, renderer);
    }
  }

  public get config(): AudioEngineConfig {
    return this.currentConfig;
  }

  public get currentTimeSeconds(): number {
    return this.audioContext?.currentTime ?? 0;
  }

  public configure(config: AudioEngineConfig): void {
    assertValidAudioEngineConfig(config);
    this.currentConfig = config;

    const context = this.audioContext;
    const masterGain = this.masterGainNode;

    if (context !== null && masterGain !== null) {
      setAudioParamSmoothly(
        masterGain.gain,
        this.currentSnapshot.masterMuted ? 0 : config.masterGain,
        context.currentTime,
      );
    }
  }

  public replacePlaybackSnapshot(snapshot: PlaybackSnapshot): void {
    this.assertUsable();
    this.currentSnapshot = snapshot;
    this.currentConfig = {
      ...this.currentConfig,
      masterGain: snapshot.masterGain,
    };

    if (this.audioContext !== null) {
      this.synchronizeVoiceBuses();
    }
  }

  public async resume(): Promise<void> {
    this.assertUsable();
    const context = this.ensureContext();

    if (context.state !== "running") {
      await context.resume();
    }
  }

  public scheduleNote(event: ScheduledNoteEvent): void {
    this.assertUsable();

    if (event.generation < this.latestGeneration) {
      return;
    }

    this.latestGeneration = event.generation;
    const context = this.audioContext;

    if (context === null) {
      throw new Error(
        "The audio engine must be resumed before scheduling notes.",
      );
    }

    if (
      event.endAudioTimeSeconds
      <= event.startAudioTimeSeconds
      || this.scheduledOccurrenceIds.has(event.occurrenceId)
    ) {
      return;
    }

    const voiceBus = this.voiceBuses.get(event.voice.voiceId);

    if (voiceBus === undefined) {
      throw new Error(
        `Audio bus for voice "${event.voice.voiceId}" is unavailable.`,
      );
    }

    const startAudioTimeSeconds = Math.max(
      context.currentTime,
      event.startAudioTimeSeconds,
    );
    const noteEndAudioTimeSeconds = Math.max(
      startAudioTimeSeconds + AUDIO_CONSTANTS.minimumNoteSeconds,
      event.endAudioTimeSeconds,
    );
    const renderer = this.instrumentRenderers.get(
      event.voice.instrument.kind,
    );

    if (renderer === undefined) {
      throw new Error(
        `No renderer is registered for instrument kind "${event.voice.instrument.kind}".`,
      );
    }

    const maximumPolyphony = renderer.getMaximumPolyphony(
      event.voice,
      this.currentConfig,
    );

    if (
      !Number.isSafeInteger(maximumPolyphony)
      || maximumPolyphony <= 0
    ) {
      throw new RangeError(
        `Renderer "${renderer.kind}" returned invalid polyphony.`,
      );
    }

    this.reservePolyphonySlot(
      event.voice.voiceId,
      startAudioTimeSeconds,
      noteEndAudioTimeSeconds,
      maximumPolyphony,
    );
    this.scheduledOccurrenceIds.add(event.occurrenceId);
    let activeVoice: ActiveInstrumentVoice;

    try {
      activeVoice = renderer.schedule({
        context,
        destination: voiceBus.gainNode,
        event,
        startAudioTimeSeconds,
        noteEndAudioTimeSeconds,
        tuningFrequencyHz:
          this.currentSnapshot.masterTuningFrequencyHz,
        releaseTailSeconds: this.currentConfig.releaseTailSeconds,
        onEnded: (occurrenceId) => {
          this.scheduledOccurrenceIds.delete(occurrenceId);
        },
      });
    } catch (error: unknown) {
      this.scheduledOccurrenceIds.delete(event.occurrenceId);
      throw error;
    }

    const activeVoices =
      this.activeVoicesByVoiceId.get(event.voice.voiceId);

    if (activeVoices === undefined) {
      this.activeVoicesByVoiceId.set(
        event.voice.voiceId,
        [activeVoice],
      );
    } else {
      activeVoices.push(activeVoice);
    }
  }

  public previewVoiceGain(
    voiceId: VoiceId,
    gain: number,
  ): void {
    this.assertUsable();

    if (!Number.isFinite(gain) || gain < 0 || gain > 1) {
      throw new RangeError("Voice gain must be between 0 and 1.");
    }

    const context = this.audioContext;
    const voiceBus = this.voiceBuses.get(voiceId);

    if (context === null || voiceBus === undefined) {
      return;
    }

    let selectedVoice: PlaybackVoiceSnapshot | undefined;
    let hasSoloVoice = false;

    for (
      let voiceIndex = 0;
      voiceIndex < this.currentSnapshot.voices.length;
      voiceIndex += 1
    ) {
      const voice = this.currentSnapshot.voices[voiceIndex];

      if (voice?.voiceId === voiceId) {
        selectedVoice = voice;
      }

      if (voice?.solo === true) {
        hasSoloVoice = true;
      }
    }

    if (selectedVoice === undefined) {
      return;
    }

    const audible =
      !selectedVoice.muted
      && (!hasSoloVoice || selectedVoice.solo);

    setAudioParamSmoothly(
      voiceBus.gainNode.gain,
      audible ? gain : 0,
      context.currentTime,
    );
  }

  public cancelScheduledAfter(
    atAudioTimeSeconds: number,
  ): void {
    const context = this.audioContext;

    if (context === null) {
      return;
    }

    const cancellationTime = Math.max(
      context.currentTime,
      atAudioTimeSeconds,
    );

    for (const activeVoices of this.activeVoicesByVoiceId.values()) {
      let writeIndex = 0;

      for (
        let readIndex = 0;
        readIndex < activeVoices.length;
        readIndex += 1
      ) {
        const activeVoice = activeVoices[readIndex];

        if (activeVoice === undefined || activeVoice.ended) {
          continue;
        }

        if (
          activeVoice.startAudioTimeSeconds >= cancellationTime
        ) {
          activeVoice.cancelBeforeStart(cancellationTime);
          this.scheduledOccurrenceIds.delete(
            activeVoice.occurrenceId,
          );
          continue;
        }

        activeVoices[writeIndex] = activeVoice;
        writeIndex += 1;
      }

      activeVoices.length = writeIndex;
    }
  }

  public cancelAll(atAudioTimeSeconds: number): void {
    const context = this.audioContext;

    if (context === null) {
      return;
    }

    const cancellationTime = Math.max(
      context.currentTime,
      atAudioTimeSeconds,
    );

    for (const activeVoices of this.activeVoicesByVoiceId.values()) {
      for (
        let voiceIndex = 0;
        voiceIndex < activeVoices.length;
        voiceIndex += 1
      ) {
        const activeVoice = activeVoices[voiceIndex];

        if (activeVoice !== undefined && !activeVoice.ended) {
          activeVoice.stop(cancellationTime);
        }
      }

      activeVoices.length = 0;
    }

    this.scheduledOccurrenceIds.clear();
  }

  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    const context = this.audioContext;

    if (context === null) {
      return;
    }

    this.cancelAll(context.currentTime);

    for (const voiceBus of this.voiceBuses.values()) {
      voiceBus.gainNode.disconnect();
      voiceBus.panNode.disconnect();
    }

    this.voiceBuses.clear();
    this.activeVoicesByVoiceId.clear();
    this.scheduledOccurrenceIds.clear();
    this.masterGainNode?.disconnect();
    this.masterGainNode = null;
    this.audioContext = null;

    if (context.state !== "closed") {
      await context.close();
    }
  }

  private ensureContext(): AudioContext {
    if (this.audioContext !== null) {
      return this.audioContext;
    }

    assertValidAudioEngineConfig(this.currentConfig);
    const context = this.contextFactory(this.currentConfig);
    const masterGain = context.createGain();

    masterGain.gain.value =
      this.currentSnapshot.masterMuted
        ? 0
        : this.currentConfig.masterGain;
    masterGain.connect(context.destination);
    this.audioContext = context;
    this.masterGainNode = masterGain;
    this.synchronizeVoiceBuses();

    return context;
  }

  private synchronizeVoiceBuses(): void {
    const context = this.audioContext;
    const masterGain = this.masterGainNode;

    if (context === null || masterGain === null) {
      return;
    }

    setAudioParamSmoothly(
      masterGain.gain,
      this.currentSnapshot.masterMuted
        ? 0
        : this.currentSnapshot.masterGain,
      context.currentTime,
    );

    const retainedVoiceIds = new Set<VoiceId>();
    let hasSoloVoice = false;

    for (
      let voiceIndex = 0;
      voiceIndex < this.currentSnapshot.voices.length;
      voiceIndex += 1
    ) {
      const voice = this.currentSnapshot.voices[voiceIndex];

      if (voice !== undefined && voice.solo) {
        hasSoloVoice = true;
        break;
      }
    }

    for (
      let voiceIndex = 0;
      voiceIndex < this.currentSnapshot.voices.length;
      voiceIndex += 1
    ) {
      const voice = this.currentSnapshot.voices[voiceIndex];

      if (voice === undefined) {
        continue;
      }

      retainedVoiceIds.add(voice.voiceId);
      let voiceBus = this.voiceBuses.get(voice.voiceId);

      if (voiceBus === undefined) {
        const gainNode = context.createGain();
        const panNode = context.createStereoPanner();

        gainNode.connect(panNode);
        panNode.connect(masterGain);
        voiceBus = {
          gainNode,
          panNode,
        };
        this.voiceBuses.set(voice.voiceId, voiceBus);
      }

      const audible =
        !voice.muted && (!hasSoloVoice || voice.solo);
      setAudioParamSmoothly(
        voiceBus.gainNode.gain,
        audible ? voice.gain : 0,
        context.currentTime,
      );
      setAudioParamSmoothly(
        voiceBus.panNode.pan,
        voice.pan,
        context.currentTime,
      );
    }

    for (const [voiceId, voiceBus] of this.voiceBuses) {
      if (!retainedVoiceIds.has(voiceId)) {
        const activeVoices =
          this.activeVoicesByVoiceId.get(voiceId);

        if (activeVoices !== undefined) {
          for (
            let voiceIndex = 0;
            voiceIndex < activeVoices.length;
            voiceIndex += 1
          ) {
            const activeVoice = activeVoices[voiceIndex];

            if (activeVoice !== undefined) {
              activeVoice.stop(context.currentTime);
            }
          }
        }

        voiceBus.gainNode.disconnect();
        voiceBus.panNode.disconnect();
        this.voiceBuses.delete(voiceId);
        this.activeVoicesByVoiceId.delete(voiceId);
      }
    }
  }

  private reservePolyphonySlot(
    voiceId: VoiceId,
    startAudioTimeSeconds: number,
    endAudioTimeSeconds: number,
    maximumPolyphony: number,
  ): void {
    const activeVoices = this.activeVoicesByVoiceId.get(voiceId);

    if (activeVoices === undefined) {
      return;
    }

    let writeIndex = 0;

    for (
      let readIndex = 0;
      readIndex < activeVoices.length;
      readIndex += 1
    ) {
      const activeVoice = activeVoices[readIndex];

      if (
        activeVoice !== undefined
        && !activeVoice.ended
        && activeVoice.stopAudioTimeSeconds
          > startAudioTimeSeconds
      ) {
        activeVoices[writeIndex] = activeVoice;
        writeIndex += 1;
      }
    }

    activeVoices.length = writeIndex;

    while (
      countOverlappingVoiceWindows(
        activeVoices,
        startAudioTimeSeconds,
        endAudioTimeSeconds,
      ) >= maximumPolyphony
    ) {
      const voiceIndex = findOldestOverlappingVoiceIndex(
        activeVoices,
        startAudioTimeSeconds,
        endAudioTimeSeconds,
      );

      if (voiceIndex < 0) {
        break;
      }

      const voiceToSteal = activeVoices[voiceIndex];

      if (voiceToSteal === undefined) {
        break;
      }

      voiceToSteal.stop(startAudioTimeSeconds);
      activeVoices.splice(voiceIndex, 1);
    }
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("The audio engine has been disposed.");
    }
  }
}

function createBrowserAudioContext(
  config: AudioEngineConfig,
): AudioContext {
  if (typeof AudioContext === "undefined") {
    throw new Error("Web Audio is not supported by this browser.");
  }

  return new AudioContext({
    latencyHint: config.latencyHint,
  });
}

function setAudioParamSmoothly(
  parameter: AudioParam,
  value: number,
  atAudioTimeSeconds: number,
): void {
  holdAudioParam(parameter, atAudioTimeSeconds);
  parameter.linearRampToValueAtTime(
    value,
    atAudioTimeSeconds + AUDIO_CONSTANTS.busRampSeconds,
  );
}

function holdAudioParam(
  parameter: AudioParam,
  atAudioTimeSeconds: number,
): void {
  try {
    parameter.cancelAndHoldAtTime(atAudioTimeSeconds);
  } catch {
    parameter.cancelScheduledValues(atAudioTimeSeconds);
    parameter.setValueAtTime(
      parameter.value,
      atAudioTimeSeconds,
    );
  }
}

function assertValidAudioEngineConfig(
  config: AudioEngineConfig,
): void {
  if (
    !Number.isFinite(config.schedulerPulseIntervalMs)
    || config.schedulerPulseIntervalMs <= 0
    || !Number.isFinite(config.scheduleAheadSeconds)
    || config.scheduleAheadSeconds <= 0
    || !Number.isFinite(config.lateEventToleranceSeconds)
    || config.lateEventToleranceSeconds < 0
    || !Number.isFinite(config.latencyCompensationSeconds)
    || config.latencyCompensationSeconds < 0
    || !Number.isFinite(config.masterGain)
    || config.masterGain < 0
    || !Number.isSafeInteger(config.maxPolyphonyPerVoice)
    || config.maxPolyphonyPerVoice <= 0
    || !Number.isFinite(config.releaseTailSeconds)
    || config.releaseTailSeconds < 0
    || config.scheduleAheadSeconds
      <= (
        config.schedulerPulseIntervalMs / 1_000
        + config.latencyCompensationSeconds
      )
  ) {
    throw new RangeError("Audio engine configuration is invalid.");
  }
}
