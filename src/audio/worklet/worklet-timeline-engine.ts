import type {
  ClipId,
  InstrumentId,
  Tick,
} from "../../domain/identifiers";
import type {
  InstrumentConfig,
} from "../../domain/instruments/instrument";
import type {
  TransportState,
} from "../../domain/transport/transport";
import type {
  PlaybackStatus,
} from "../playback-model";
import type {
  AudioWorkletTimeline,
} from "./audio-worklet-protocol";
import {
  findTempoIndexAtTick,
  lowerBound,
} from "./worklet-timeline-query";
import type {
  WorkletRuntimeInstrument,
} from "./worklet-runtime-instrument";
import {
  WorkletVoiceBank,
} from "./worklet-voice-bank";
import {
  WorkletHeldNoteStarter,
} from "./worklet-held-note-starter";

export interface TimelineEngineDiagnostic {
  readonly type: "note-start" | "loop" | "clip-transition" | "project-end";
  readonly frame: number;
  readonly tick: number;
  readonly instrumentId?: InstrumentId;
  readonly pitch?: number;
}

export interface WorkletTimelineEngineOptions {
  readonly onDiagnostic?: (event: TimelineEngineDiagnostic) => void;
}

/**
 * Transport and synth core executed exclusively by the audio rendering thread.
 * Its clock advances only through rendered samples and never through UI timers.
 */
export class WorkletTimelineEngine {
  private timeline: AudioWorkletTimeline | null = null;
  private transport: TransportState | null = null;
  private timelineSequence = 0;
  private queuedTimeline: {
    readonly timeline: AudioWorkletTimeline;
    readonly transport: TransportState;
    readonly sequence: number;
  } | null = null;
  private runtimeInstruments: WorkletRuntimeInstrument[] = [];
  private readonly runtimeInstrumentsById =
    new Map<InstrumentId, WorkletRuntimeInstrument>();
  private readonly voiceBank: WorkletVoiceBank;
  private readonly heldNoteStarter = new WorkletHeldNoteStarter();
  private currentStatus: PlaybackStatus = "stopped";
  private currentTick = 0;
  private tickCompensation = 0;
  private tempoIndex = 0;
  private ticksPerSample = 0;
  private nextTempoStartTick = Number.POSITIVE_INFINITY;
  private loopActive = false;
  private renderedFrame = 0;
  private stateRevision = 0;
  private masterGain = 1;
  private masterMuted = false;
  private tuningFrequencyHz = 440;
  private readonly onDiagnostic:
    ((event: TimelineEngineDiagnostic) => void) | undefined;

  public constructor(
    private readonly sampleRate: number,
    options: WorkletTimelineEngineOptions = {},
  ) {
    this.onDiagnostic = options.onDiagnostic;
    this.voiceBank = new WorkletVoiceBank(sampleRate);
  }

  public get status(): PlaybackStatus {
    return this.currentStatus;
  }

  public get positionTick(): Tick {
    return this.currentTick;
  }

  public get sourceId(): ClipId {
    return this.requireTimeline().sourceId;
  }

  public get sequence(): number {
    return this.timelineSequence;
  }

  public get frame(): number {
    return this.renderedFrame;
  }

  public get transportStateRevision(): number {
    return this.stateRevision;
  }

  public loadTimeline(
    timeline: AudioWorkletTimeline,
    transport: TransportState,
    sequence = 0,
  ): void {
    this.queuedTimeline = null;
    this.activateTimeline(timeline, transport, sequence);
  }

  public queueTimeline(
    timeline: AudioWorkletTimeline,
    transport: TransportState,
    sequence: number,
  ): void {
    this.queuedTimeline = { timeline, transport, sequence };
  }

  public clearQueuedTimeline(): void {
    this.queuedTimeline = null;
  }

  private activateTimeline(
    timeline: AudioWorkletTimeline,
    transport: TransportState,
    sequence: number,
  ): void {
    const previousRuntimeById = new Map(this.runtimeInstrumentsById);

    this.timeline = timeline;
    this.transport = transport;
    this.timelineSequence = sequence;
    this.masterGain = timeline.masterGain;
    this.masterMuted = timeline.masterMuted;
    this.tuningFrequencyHz = timeline.masterTuningFrequencyHz;
    this.voiceBank.setTuningFrequency(this.tuningFrequencyHz);
    this.currentTick = clampTick(this.currentTick, timeline.durationTicks);
    this.refreshTempoCursor();
    this.loopActive = this.currentStatus === "playing"
      && transport.loopEnabled
      && this.currentTick <= transport.loop.endTick;
    this.runtimeInstruments = [];
    this.runtimeInstrumentsById.clear();

    const hasSoloInstrument = timeline.instruments.some(
      (instrument) => instrument.solo,
    );

    for (const instrument of timeline.instruments) {
      const previousRuntime = previousRuntimeById.get(instrument.instrumentId);
      const runtime: WorkletRuntimeInstrument = {
        timeline: instrument,
        publishedConfig: instrument.instrument,
        config: previousRuntime?.previewConfig ?? instrument.instrument,
        previewConfig: previousRuntime?.previewConfig ?? null,
        gain: instrument.gain,
        audible: !instrument.muted
          && (!hasSoloInstrument || instrument.solo),
        cursor: lowerBound(instrument.startTicks, this.currentTick),
      };

      this.runtimeInstruments.push(runtime);
      this.runtimeInstrumentsById.set(instrument.instrumentId, runtime);
    }

    this.voiceBank.synchronizeMix(this.runtimeInstrumentsById);

    this.refreshCursors(this.currentTick);
    this.stateRevision += 1;
  }

  public play(tick: Tick = this.currentTick): void {
    const timeline = this.requireTimeline();

    this.currentTick = tick >= timeline.durationTicks
      ? this.resolveRestartTick()
      : clampTick(tick, timeline.durationTicks);

    if (
      this.transport?.loopEnabled === true
      && this.currentTick === this.transport.loop.endTick
    ) {
      this.currentTick = this.transport.loop.startTick;
    }

    this.loopActive = this.transport?.loopEnabled === true
      && this.currentTick <= this.transport.loop.endTick;
    this.tickCompensation = 0;
    this.refreshTempoCursor();
    this.releaseTimelineVoices();
    this.refreshCursors(this.currentTick);
    this.currentStatus = "playing";
    this.startHeldNotes(this.currentTick);
    this.stateRevision += 1;
  }

  public pause(): void {
    if (this.currentStatus === "playing") {
      this.releaseTimelineVoices();
      this.currentStatus = "paused";
      this.stateRevision += 1;
    }
  }

  public stop(): void {
    this.releaseTimelineVoices();
    this.currentStatus = "stopped";
    this.stateRevision += 1;
  }

  public seek(tick: Tick): void {
    const timeline = this.requireTimeline();

    const wasPlaying = this.currentStatus === "playing";

    this.releaseTimelineVoices();
    this.currentTick = clampTick(tick, timeline.durationTicks);

    if (
      wasPlaying
      && this.transport?.loopEnabled === true
      && this.currentTick === this.transport.loop.endTick
    ) {
      this.currentTick = this.transport.loop.startTick;
    }

    this.loopActive = wasPlaying
      && this.transport?.loopEnabled === true
      && this.currentTick <= this.transport.loop.endTick;
    this.tickCompensation = 0;
    this.refreshTempoCursor();
    this.refreshCursors(this.currentTick);

    if (wasPlaying) {
      this.startHeldNotes(this.currentTick);
    }

    this.stateRevision += 1;
  }

  public previewInstrument(
    instrumentId: InstrumentId,
    config: InstrumentConfig | null,
  ): void {
    const runtime = this.runtimeInstrumentsById.get(instrumentId);

    if (runtime === undefined || (config !== null && config.kind !== "subtractive")) {
      return;
    }

    runtime.previewConfig = config;
    runtime.config = config ?? runtime.publishedConfig;

    this.voiceBank.previewInstrument(instrumentId, runtime.config);
  }

  public previewInstrumentGain(
    instrumentId: InstrumentId,
    gain: number,
  ): void {
    const runtime = this.runtimeInstrumentsById.get(instrumentId);

    if (runtime !== undefined) {
      runtime.gain = gain;

      this.voiceBank.previewInstrumentGain(runtime);
    }
  }

  public previewMasterGain(gain: number): void {
    this.masterGain = gain;
  }

  public audition(
    instrumentId: InstrumentId,
    pitch: number,
    durationSeconds: number,
  ): void {
    const runtime = this.runtimeInstrumentsById.get(instrumentId);

    if (runtime === undefined) {
      return;
    }

    this.voiceBank.startAuditionVoice(
      runtime,
      pitch,
      durationSeconds,
    );
  }

  public process(left: Float32Array, right: Float32Array): void {
    const frameCount = Math.min(left.length, right.length);

    left.fill(0);
    right.fill(0);

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      if (this.currentStatus === "playing") {
        this.startDueNotes();
        this.releaseDueNotes();
      }

      const masterLevel = this.masterMuted ? 0 : this.masterGain;

      this.voiceBank.renderFrame(left, right, frameIndex, masterLevel);

      if (this.currentStatus === "playing") {
        this.advanceTransportOneSample();
      }

      this.renderedFrame += 1;
    }

    this.voiceBank.pruneEndedVoices();
  }

  private startDueNotes(): void {
    for (const runtime of this.runtimeInstruments) {
      const { timeline } = runtime;

      while (runtime.cursor < timeline.startTicks.length) {
        const startTick = timeline.startTicks[runtime.cursor];

        if (startTick === undefined || startTick > this.currentTick) {
          break;
        }

        const durationTicks = timeline.durationTicks[runtime.cursor];
        const pitch = timeline.pitches[runtime.cursor];

        if (
          durationTicks !== undefined
          && pitch !== undefined
          && runtime.audible
        ) {
          const boundaryTick = this.resolvePlaybackBoundaryTick();
          const endTick = Math.min(
            boundaryTick,
            startTick + durationTicks,
          );

          if (endTick > this.currentTick) {
            this.voiceBank.startTimelineVoice(runtime, pitch, endTick);
            this.onDiagnostic?.({
              type: "note-start",
              frame: this.renderedFrame,
              tick: startTick,
              instrumentId: timeline.instrumentId,
              pitch,
            });
          }
        }

        runtime.cursor += 1;
      }
    }
  }

  private startHeldNotes(
    tick: number,
    diagnosticFrame = this.renderedFrame,
  ): void {
    this.heldNoteStarter.start(
      this.runtimeInstruments,
      tick,
      diagnosticFrame,
      this.resolvePlaybackBoundaryTick(),
      this.voiceBank,
      this.onDiagnostic,
    );
  }

  private releaseDueNotes(): void {
    this.voiceBank.releaseDueTimelineVoices(this.currentTick);
  }

  private advanceTransportOneSample(): void {
    const timeline = this.requireTimeline();
    const transport = this.requireTransport();
    const compensatedIncrement = this.ticksPerSample - this.tickCompensation;
    const nextTick = this.currentTick + compensatedIncrement;

    this.tickCompensation = (
      nextTick - this.currentTick
    ) - compensatedIncrement;
    this.currentTick = nextTick;

    if (
      this.loopActive
      && this.currentTick >= transport.loop.endTick
    ) {
      const loopDuration = transport.loop.endTick - transport.loop.startTick;

      this.currentTick = transport.loop.startTick
        + positiveModulo(
          this.currentTick - transport.loop.startTick,
          loopDuration,
        );
      this.tickCompensation = 0;
      this.refreshTempoCursor();
      this.releaseTimelineVoices();
      // Always retain events exactly on the loop boundary. Floating-point
      // overshoot belongs to the next sample, not to cursor selection.
      this.refreshCursors(transport.loop.startTick);
      // A note launched before a non-zero loop start must be reconstructed on
      // every pass when its source interval still crosses that boundary.
      this.startHeldNotes(
        transport.loop.startTick,
        this.renderedFrame + 1,
      );
      this.onDiagnostic?.({
        type: "loop",
        frame: this.renderedFrame + 1,
        tick: this.currentTick,
      });
      return;
    }

    this.advanceTempoCursor();

    if (this.currentTick >= timeline.durationTicks) {
      this.releaseTimelineVoices();

      if (this.queuedTimeline !== null) {
        const queued = this.queuedTimeline;

        this.queuedTimeline = null;
        this.currentTick = 0;
        this.tickCompensation = 0;
        this.activateTimeline(
          queued.timeline,
          queued.transport,
          queued.sequence,
        );
        this.onDiagnostic?.({
          type: "clip-transition",
          frame: this.renderedFrame + 1,
          tick: this.currentTick,
        });
        return;
      }

      this.currentTick = timeline.durationTicks;
      this.currentStatus = "stopped";
      this.stateRevision += 1;
      this.onDiagnostic?.({
        type: "project-end",
        frame: this.renderedFrame + 1,
        tick: this.currentTick,
      });
    }
  }

  private releaseTimelineVoices(): void {
    this.voiceBank.releaseTimelineVoices();
  }

  private refreshCursors(tick: number): void {
    for (const runtime of this.runtimeInstruments) {
      runtime.cursor = lowerBound(runtime.timeline.startTicks, tick);
    }
  }

  private refreshTempoCursor(): void {
    const timeline = this.requireTimeline();

    this.tempoIndex = findTempoIndexAtTick(timeline, this.currentTick);
    this.updateTicksPerSample();
  }

  private advanceTempoCursor(): void {
    if (this.currentTick < this.nextTempoStartTick) {
      return;
    }

    const timeline = this.requireTimeline();
    let nextTempoStart: number | undefined = this.nextTempoStartTick;

    while (
      nextTempoStart !== undefined
      && this.currentTick >= nextTempoStart
    ) {
      this.tempoIndex += 1;
      nextTempoStart = timeline.tempoStartTicks[this.tempoIndex + 1];
    }

    this.updateTicksPerSample();
  }

  private updateTicksPerSample(): void {
    const timeline = this.requireTimeline();
    const bpm = timeline.tempoBpms[this.tempoIndex] ?? 120;

    this.ticksPerSample = bpm * timeline.ppqn / (60 * this.sampleRate);
    this.nextTempoStartTick = timeline.tempoStartTicks[this.tempoIndex + 1]
      ?? Number.POSITIVE_INFINITY;
  }

  private resolveRestartTick(): number {
    const transport = this.requireTransport();

    return transport.loopEnabled ? transport.loop.startTick : 0;
  }

  private resolvePlaybackBoundaryTick(): number {
    const timeline = this.requireTimeline();
    const transport = this.requireTransport();

    return this.loopActive
      ? transport.loop.endTick
      : timeline.durationTicks;
  }

  private requireTimeline(): AudioWorkletTimeline {
    if (this.timeline === null) {
      throw new Error("The worklet timeline has not been loaded.");
    }

    return this.timeline;
  }

  private requireTransport(): TransportState {
    if (this.transport === null) {
      throw new Error("The worklet transport has not been loaded.");
    }

    return this.transport;
  }
}

function clampTick(tick: number, durationTicks: number): number {
  return Math.min(durationTicks, Math.max(0, tick));
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
