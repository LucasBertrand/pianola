import type {
  AudioEngineConfig,
  InstrumentId,
} from "../domain/model";
import {
  AUDIO_CONSTANTS,
} from "../config/audio-config";
import type {
  AudioEnginePort,
  PlaybackSnapshot,
  PlaybackInstrumentSnapshot,
  ScheduledNoteEvent,
} from "./playback-model";
import {
  countOverlappingVoiceWindows,
  findOldestOverlappingVoiceIndex,
} from "./voice-allocation";
import type {
  ActiveInstrumentVoice,
  InstrumentRenderer,
} from "./instruments/instrument-renderer";
import {
  SubtractiveInstrumentRenderer,
} from "./instruments/subtractive-instrument-renderer";

export type AudioContextFactory = (
  config: AudioEngineConfig,
) => AudioContext;

interface InstrumentBus {
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
  private readonly instrumentBuses = new Map<InstrumentId, InstrumentBus>();
  private readonly activeVoicesByInstrumentId =
    new Map<InstrumentId, ActiveInstrumentVoice[]>();
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
      this.synchronizeInstrumentBuses();
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

    const instrumentBus = this.instrumentBuses.get(event.instrument.instrumentId);

    if (instrumentBus === undefined) {
      throw new Error(
        `Audio bus for instrument "${event.instrument.instrumentId}" is unavailable.`,
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
      event.instrument.instrument.kind,
    );

    if (renderer === undefined) {
      throw new Error(
        `No renderer is registered for instrument kind "${event.instrument.instrument.kind}".`,
      );
    }

    const maximumPolyphony = renderer.getMaximumPolyphony(
      event.instrument,
      this.currentConfig,
    );

    if (
      !Number.isSafeInteger(maximumPolyphony)
      || maximumPolyphony <= 0
    ) {
      throw new RangeError(
        `Project instrument "${event.instrument.instrumentId}" has an invalid simultaneous-note limit.`,
      );
    }

    this.reservePolyphonySlot(
      event.instrument.instrumentId,
      startAudioTimeSeconds,
      noteEndAudioTimeSeconds,
      maximumPolyphony,
    );
    this.scheduledOccurrenceIds.add(event.occurrenceId);
    let activeVoice: ActiveInstrumentVoice;

    try {
      activeVoice = renderer.schedule({
        context,
        destination: instrumentBus.gainNode,
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
      this.activeVoicesByInstrumentId.get(event.instrument.instrumentId);

    if (activeVoices === undefined) {
      this.activeVoicesByInstrumentId.set(
        event.instrument.instrumentId,
        [activeVoice],
      );
    } else {
      activeVoices.push(activeVoice);
    }
  }

  public previewInstrumentGain(
    instrumentId: InstrumentId,
    gain: number,
  ): void {
    this.assertUsable();

    if (!Number.isFinite(gain) || gain < 0 || gain > 1) {
      throw new RangeError("Project instrument gain must be between 0 and 1.");
    }

    const context = this.audioContext;
    const instrumentBus = this.instrumentBuses.get(instrumentId);

    if (context === null || instrumentBus === undefined) {
      return;
    }

    let selectedInstrument: PlaybackInstrumentSnapshot | undefined;
    let hasSoloInstrument = false;

    for (
      let instrumentIndex = 0;
      instrumentIndex < this.currentSnapshot.instruments.length;
      instrumentIndex += 1
    ) {
      const instrument = this.currentSnapshot.instruments[instrumentIndex];

      if (instrument?.instrumentId === instrumentId) {
        selectedInstrument = instrument;
      }

      if (instrument?.solo === true) {
        hasSoloInstrument = true;
      }
    }

    if (selectedInstrument === undefined) {
      return;
    }

    const audible =
      !selectedInstrument.muted
      && (!hasSoloInstrument || selectedInstrument.solo);

    setAudioParamSmoothly(
      instrumentBus.gainNode.gain,
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

    for (const activeVoices of this.activeVoicesByInstrumentId.values()) {
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

    for (const activeVoices of this.activeVoicesByInstrumentId.values()) {
      for (
        let instrumentIndex = 0;
        instrumentIndex < activeVoices.length;
        instrumentIndex += 1
      ) {
        const activeVoice = activeVoices[instrumentIndex];

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

    for (const instrumentBus of this.instrumentBuses.values()) {
      instrumentBus.gainNode.disconnect();
      instrumentBus.panNode.disconnect();
    }

    this.instrumentBuses.clear();
    this.activeVoicesByInstrumentId.clear();
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
    this.synchronizeInstrumentBuses();

    return context;
  }

  private synchronizeInstrumentBuses(): void {
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

    const retainedInstrumentIds = new Set<InstrumentId>();
    let hasSoloInstrument = false;

    for (
      let instrumentIndex = 0;
      instrumentIndex < this.currentSnapshot.instruments.length;
      instrumentIndex += 1
    ) {
      const instrument = this.currentSnapshot.instruments[instrumentIndex];

      if (instrument !== undefined && instrument.solo) {
        hasSoloInstrument = true;
        break;
      }
    }

    for (
      let instrumentIndex = 0;
      instrumentIndex < this.currentSnapshot.instruments.length;
      instrumentIndex += 1
    ) {
      const instrument = this.currentSnapshot.instruments[instrumentIndex];

      if (instrument === undefined) {
        continue;
      }

      retainedInstrumentIds.add(instrument.instrumentId);
      let instrumentBus = this.instrumentBuses.get(instrument.instrumentId);

      if (instrumentBus === undefined) {
        const gainNode = context.createGain();
        const panNode = context.createStereoPanner();

        gainNode.connect(panNode);
        panNode.connect(masterGain);
        instrumentBus = {
          gainNode,
          panNode,
        };
        this.instrumentBuses.set(instrument.instrumentId, instrumentBus);
      }

      const audible =
        !instrument.muted && (!hasSoloInstrument || instrument.solo);
      setAudioParamSmoothly(
        instrumentBus.gainNode.gain,
        audible ? instrument.gain : 0,
        context.currentTime,
      );
      setAudioParamSmoothly(
        instrumentBus.panNode.pan,
        instrument.pan,
        context.currentTime,
      );
    }

    for (const [instrumentId, instrumentBus] of this.instrumentBuses) {
      if (!retainedInstrumentIds.has(instrumentId)) {
        const activeVoices =
          this.activeVoicesByInstrumentId.get(instrumentId);

        if (activeVoices !== undefined) {
          for (
            let instrumentIndex = 0;
            instrumentIndex < activeVoices.length;
            instrumentIndex += 1
          ) {
            const activeVoice = activeVoices[instrumentIndex];

            if (activeVoice !== undefined) {
              activeVoice.stop(context.currentTime);
            }
          }
        }

        instrumentBus.gainNode.disconnect();
        instrumentBus.panNode.disconnect();
        this.instrumentBuses.delete(instrumentId);
        this.activeVoicesByInstrumentId.delete(instrumentId);
      }
    }
  }

  private reservePolyphonySlot(
    instrumentId: InstrumentId,
    startAudioTimeSeconds: number,
    endAudioTimeSeconds: number,
    maximumPolyphony: number,
  ): void {
    const activeVoices = this.activeVoicesByInstrumentId.get(instrumentId);

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
      const instrumentIndex = findOldestOverlappingVoiceIndex(
        activeVoices,
        startAudioTimeSeconds,
        endAudioTimeSeconds,
      );

      if (instrumentIndex < 0) {
        break;
      }

      const voiceToSteal = activeVoices[instrumentIndex];

      if (voiceToSteal === undefined) {
        break;
      }

      voiceToSteal.stop(startAudioTimeSeconds);
      activeVoices.splice(instrumentIndex, 1);
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
    || !Number.isSafeInteger(config.maximumRendererPolyphony)
    || config.maximumRendererPolyphony <= 0
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
