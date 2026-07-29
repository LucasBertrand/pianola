import type {
  AudioEngineConfig,
  VoiceId,
} from "../domain/model";
import type {
  AudioEnginePort,
  PlaybackSnapshot,
  PlaybackVoiceSnapshot,
  ScheduledNoteEvent,
} from "./contracts";

export type AudioContextFactory = (
  config: AudioEngineConfig,
) => AudioContext;

interface VoiceBus {
  readonly gainNode: GainNode;
  readonly panNode: StereoPannerNode;
}

interface ActiveVoice {
  readonly occurrenceId: string;
  readonly voiceId: VoiceId;
  readonly oscillator: OscillatorNode;
  readonly envelopeGain: GainNode;
  readonly filter: BiquadFilterNode;
  readonly startAudioTimeSeconds: number;
  stopAudioTimeSeconds: number;
  ended: boolean;
}

const MINIMUM_NOTE_SECONDS = 0.002;
const CANCELLATION_FADE_SECONDS = 0.006;
const BUS_RAMP_SECONDS = 0.008;

export class SubtractiveAudioEngine implements AudioEnginePort {
  private currentConfig: AudioEngineConfig;
  private currentSnapshot: PlaybackSnapshot;
  private readonly contextFactory: AudioContextFactory;
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private readonly voiceBuses = new Map<VoiceId, VoiceBus>();
  private readonly activeVoicesByVoiceId =
    new Map<VoiceId, ActiveVoice[]>();
  private readonly scheduledOccurrenceIds = new Set<string>();
  private latestGeneration = 0;
  private disposed = false;

  public constructor(
    config: AudioEngineConfig,
    snapshot: PlaybackSnapshot,
    contextFactory: AudioContextFactory = createBrowserAudioContext,
  ) {
    this.currentConfig = {
      ...config,
      masterGain: snapshot.masterGain,
    };
    this.currentSnapshot = snapshot;
    this.contextFactory = contextFactory;
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
        config.masterGain,
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
      || event.velocity <= 0
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
      startAudioTimeSeconds + MINIMUM_NOTE_SECONDS,
      event.endAudioTimeSeconds,
    );

    this.reservePolyphonySlot(
      event.voice.voiceId,
      startAudioTimeSeconds,
      noteEndAudioTimeSeconds,
    );

    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const envelopeGain = context.createGain();
    const instrument = event.voice.instrument;
    const releaseSeconds = Math.min(
      instrument.envelope.releaseSeconds,
      this.currentConfig.releaseTailSeconds,
    );
    const stopAudioTimeSeconds =
      noteEndAudioTimeSeconds + releaseSeconds;
    const activeVoice: ActiveVoice = {
      occurrenceId: event.occurrenceId,
      voiceId: event.voice.voiceId,
      oscillator,
      envelopeGain,
      filter,
      startAudioTimeSeconds,
      stopAudioTimeSeconds,
      ended: false,
    };

    oscillator.type = instrument.oscillatorWaveform;
    oscillator.frequency.setValueAtTime(
      midiPitchToFrequency(event.pitch),
      startAudioTimeSeconds,
    );
    oscillator.detune.setValueAtTime(
      instrument.oscillatorDetuneCents,
      startAudioTimeSeconds,
    );

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      Math.min(
        instrument.filterCutoffHz,
        context.sampleRate * 0.49,
      ),
      startAudioTimeSeconds,
    );
    filter.Q.setValueAtTime(
      instrument.filterResonance,
      startAudioTimeSeconds,
    );

    scheduleEnvelope(
      envelopeGain.gain,
      event.velocity / 127,
      startAudioTimeSeconds,
      noteEndAudioTimeSeconds,
      instrument.envelope.attackSeconds,
      instrument.envelope.decaySeconds,
      instrument.envelope.sustainLevel,
      releaseSeconds,
    );

    oscillator.connect(filter);
    filter.connect(envelopeGain);
    envelopeGain.connect(voiceBus.gainNode);

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

    this.scheduledOccurrenceIds.add(event.occurrenceId);
    oscillator.onended = (): void => {
      activeVoice.ended = true;
      this.scheduledOccurrenceIds.delete(
        activeVoice.occurrenceId,
      );
      oscillator.disconnect();
      filter.disconnect();
      envelopeGain.disconnect();
    };
    oscillator.start(startAudioTimeSeconds);
    oscillator.stop(
      stopAudioTimeSeconds + MINIMUM_NOTE_SECONDS,
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
          cancelFutureVoice(activeVoice, cancellationTime);
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
          stopActiveVoice(activeVoice, cancellationTime);
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

    masterGain.gain.value = this.currentConfig.masterGain;
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
      this.currentSnapshot.masterGain,
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
              stopActiveVoice(
                activeVoice,
                context.currentTime,
              );
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
      countOverlappingVoices(
        activeVoices,
        startAudioTimeSeconds,
        endAudioTimeSeconds,
      ) >= this.currentConfig.maxPolyphonyPerVoice
    ) {
      const voiceToSteal = findVoiceToSteal(
        activeVoices,
        startAudioTimeSeconds,
        endAudioTimeSeconds,
      );

      if (voiceToSteal === undefined) {
        break;
      }

      stopActiveVoice(voiceToSteal, startAudioTimeSeconds);
      const voiceIndex = activeVoices.indexOf(voiceToSteal);

      if (voiceIndex >= 0) {
        activeVoices.splice(voiceIndex, 1);
      }
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

function scheduleEnvelope(
  parameter: AudioParam,
  peakLevel: number,
  startAudioTimeSeconds: number,
  noteEndAudioTimeSeconds: number,
  attackSeconds: number,
  decaySeconds: number,
  sustainLevel: number,
  releaseSeconds: number,
): void {
  const attackEnd = startAudioTimeSeconds + attackSeconds;
  const decayEnd = attackEnd + decaySeconds;
  const sustainGain = peakLevel * sustainLevel;
  let noteOffGain = sustainGain;

  parameter.cancelScheduledValues(startAudioTimeSeconds);
  parameter.setValueAtTime(0, startAudioTimeSeconds);

  if (attackSeconds > 0) {
    if (noteEndAudioTimeSeconds <= attackEnd) {
      noteOffGain =
        peakLevel
        * (
          (noteEndAudioTimeSeconds - startAudioTimeSeconds)
          / attackSeconds
        );
      parameter.linearRampToValueAtTime(
        noteOffGain,
        noteEndAudioTimeSeconds,
      );
    } else {
      parameter.linearRampToValueAtTime(peakLevel, attackEnd);
    }
  } else {
    parameter.setValueAtTime(peakLevel, startAudioTimeSeconds);
  }

  if (noteEndAudioTimeSeconds > attackEnd) {
    if (
      decaySeconds > 0
      && noteEndAudioTimeSeconds < decayEnd
    ) {
      const decayProgress =
        (noteEndAudioTimeSeconds - attackEnd) / decaySeconds;

      noteOffGain =
        peakLevel
        + (sustainGain - peakLevel) * decayProgress;
      parameter.linearRampToValueAtTime(
        noteOffGain,
        noteEndAudioTimeSeconds,
      );
    } else {
      if (decaySeconds > 0) {
        parameter.linearRampToValueAtTime(
          sustainGain,
          decayEnd,
        );
      } else {
        parameter.setValueAtTime(sustainGain, attackEnd);
      }

      parameter.setValueAtTime(
        sustainGain,
        noteEndAudioTimeSeconds,
      );
    }
  }

  parameter.setValueAtTime(
    noteOffGain,
    noteEndAudioTimeSeconds,
  );

  if (releaseSeconds > 0) {
    parameter.linearRampToValueAtTime(
      0,
      noteEndAudioTimeSeconds + releaseSeconds,
    );
  } else {
    parameter.setValueAtTime(0, noteEndAudioTimeSeconds);
  }
}

function stopActiveVoice(
  activeVoice: ActiveVoice,
  atAudioTimeSeconds: number,
): void {
  if (activeVoice.ended) {
    return;
  }

  const stopTime =
    atAudioTimeSeconds + CANCELLATION_FADE_SECONDS;
  const gain = activeVoice.envelopeGain.gain;

  holdAudioParam(gain, atAudioTimeSeconds);
  gain.linearRampToValueAtTime(0, stopTime);

  try {
    activeVoice.oscillator.stop(
      stopTime + MINIMUM_NOTE_SECONDS,
    );
  } catch {
    activeVoice.ended = true;
  }

  activeVoice.stopAudioTimeSeconds = stopTime;
}

function cancelFutureVoice(
  activeVoice: ActiveVoice,
  atAudioTimeSeconds: number,
): void {
  const stopTime =
    atAudioTimeSeconds + MINIMUM_NOTE_SECONDS;
  const gain = activeVoice.envelopeGain.gain;

  gain.cancelScheduledValues(atAudioTimeSeconds);
  gain.setValueAtTime(0, atAudioTimeSeconds);

  try {
    activeVoice.oscillator.stop(stopTime);
  } catch {
    activeVoice.ended = true;
  }

  activeVoice.stopAudioTimeSeconds = stopTime;
}

function countOverlappingVoices(
  activeVoices: readonly ActiveVoice[],
  startAudioTimeSeconds: number,
  endAudioTimeSeconds: number,
): number {
  let count = 0;

  for (
    let voiceIndex = 0;
    voiceIndex < activeVoices.length;
    voiceIndex += 1
  ) {
    const activeVoice = activeVoices[voiceIndex];

    if (
      activeVoice !== undefined
      && activeVoice.startAudioTimeSeconds < endAudioTimeSeconds
      && activeVoice.stopAudioTimeSeconds > startAudioTimeSeconds
    ) {
      count += 1;
    }
  }

  return count;
}

function findVoiceToSteal(
  activeVoices: readonly ActiveVoice[],
  startAudioTimeSeconds: number,
  endAudioTimeSeconds: number,
): ActiveVoice | undefined {
  let selectedVoice: ActiveVoice | undefined;

  for (
    let voiceIndex = 0;
    voiceIndex < activeVoices.length;
    voiceIndex += 1
  ) {
    const activeVoice = activeVoices[voiceIndex];

    if (
      activeVoice === undefined
      || activeVoice.startAudioTimeSeconds >= endAudioTimeSeconds
      || activeVoice.stopAudioTimeSeconds <= startAudioTimeSeconds
    ) {
      continue;
    }

    if (
      selectedVoice === undefined
      || activeVoice.stopAudioTimeSeconds
        < selectedVoice.stopAudioTimeSeconds
      || (
        activeVoice.stopAudioTimeSeconds
          === selectedVoice.stopAudioTimeSeconds
        && activeVoice.startAudioTimeSeconds
          < selectedVoice.startAudioTimeSeconds
      )
    ) {
      selectedVoice = activeVoice;
    }
  }

  return selectedVoice;
}

function setAudioParamSmoothly(
  parameter: AudioParam,
  value: number,
  atAudioTimeSeconds: number,
): void {
  holdAudioParam(parameter, atAudioTimeSeconds);
  parameter.linearRampToValueAtTime(
    value,
    atAudioTimeSeconds + BUS_RAMP_SECONDS,
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

function midiPitchToFrequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
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
