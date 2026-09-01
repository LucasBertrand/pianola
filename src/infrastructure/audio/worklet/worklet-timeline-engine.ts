import type {
  ClipId,
  InstrumentId,
  Tick,
} from "../../../domain/identifiers";
import type {
  TransportState,
} from "../../../domain/transport/transport";
import type {
  PlaybackStatus,
} from "../../../application/ports/audio-transport";
import type {
  SynthRuntimeConfig,
} from "../synth/synth-runtime-config";
import type {
  AudioWorkletTimeline,
} from "./audio-worklet-protocol";
import {
  findTempoIndexAtTick,
} from "./worklet-timeline-query";
import {
  WorkletInstrumentRuntime,
} from "./worklet-instrument-runtime";
import {
  WorkletMasterStage,
  type MasterLevelMeasurement,
  type MasterLevelWriter,
  type MasterProtectionMode,
} from "./worklet-master-stage";

export interface TimelineEngineDiagnostic {
  readonly type: "note-start" | "loop" | "clip-transition" | "project-end";
  readonly frame: number;
  readonly tick: number;
  readonly instrumentId?: InstrumentId;
  readonly pitch?: number;
}

export interface WorkletTimelineEngineOptions {
  readonly onDiagnostic?: (event: TimelineEngineDiagnostic) => void;
  readonly masterProtectionMode?: MasterProtectionMode;
}

/**
 * Transport and synth core executed exclusively by the audio rendering thread.
 * Its clock advances only through rendered samples and never through UI timers.
 */
export class WorkletTimelineEngine {
  private publishedTimeline: AudioWorkletTimeline | null = null;
  private publishedTransport: TransportState | null = null;
  private tempoMapPreview: {
    readonly startTicks: Float64Array;
    readonly bpms: Float64Array;
  } | null = null;
  private loopPreview: TransportState["loop"] | null = null;
  private tempoMapPreviewVersion = -1;
  private loopPreviewVersion = -1;
  private timelineSequence = 0;
  private timelineStateVersion = 0;
  private queuedTimeline: {
    readonly timeline: AudioWorkletTimeline;
    readonly transport: TransportState;
    readonly sequence: number;
    readonly stateVersion: number;
  } | null = null;
  private readonly instrumentRuntime: WorkletInstrumentRuntime;
  private readonly masterStage: WorkletMasterStage;
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
    this.instrumentRuntime = new WorkletInstrumentRuntime(
      sampleRate,
      (event) => this.onDiagnostic?.({ type: "note-start", ...event }),
    );
    this.masterStage = new WorkletMasterStage(
      sampleRate,
      options.masterProtectionMode,
    );
  }

  public get status(): PlaybackStatus {
    return this.currentStatus;
  }

  public get positionTick(): Tick {
    return this.currentTick;
  }

  public get sourceId(): ClipId {
    return this.requirePublishedTimeline().sourceId;
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

  public readAndResetMasterLevels(): MasterLevelMeasurement {
    return this.masterStage.readAndResetLevels();
  }

  public writeAndResetMasterLevels(levels: MasterLevelWriter): void {
    this.masterStage.writeAndResetLevels(levels);
  }

  public loadTimeline(
    timeline: AudioWorkletTimeline,
    transport: TransportState,
    sequence = 0,
    stateVersion = 0,
  ): void {
    if (sequence < this.timelineSequence
      || (sequence === this.timelineSequence
        && stateVersion < this.timelineStateVersion)) return;
    this.queuedTimeline = null;
    this.activateTimeline(timeline, transport, sequence, stateVersion);
  }

  public queueTimeline(
    timeline: AudioWorkletTimeline,
    transport: TransportState,
    sequence: number,
    stateVersion = 0,
  ): void {
    if (sequence <= this.timelineSequence
      || (this.queuedTimeline !== null
        && sequence < this.queuedTimeline.sequence)) return;
    this.queuedTimeline = { timeline, transport, sequence, stateVersion };
  }

  public clearQueuedTimeline(): void {
    this.queuedTimeline = null;
  }

  private activateTimeline(
    timeline: AudioWorkletTimeline,
    transport: TransportState,
    sequence: number,
    stateVersion: number,
  ): void {
    this.publishedTimeline = timeline;
    this.publishedTransport = transport;
    this.tempoMapPreview = null;
    this.loopPreview = null;
    this.tempoMapPreviewVersion = -1;
    this.loopPreviewVersion = -1;
    this.timelineSequence = sequence;
    this.timelineStateVersion = stateVersion;
    this.masterGain = timeline.masterGain;
    this.masterMuted = timeline.masterMuted;
    this.tuningFrequencyHz = timeline.masterTuningFrequencyHz;
    this.currentTick = clampTick(this.currentTick, timeline.durationTicks);
    this.refreshTempoCursor();
    this.loopActive = this.currentStatus === "playing"
      && transport.loopEnabled
      && this.currentTick <= transport.loop.endTick;
    this.instrumentRuntime.activate(
      timeline.instruments,
      this.currentTick,
      this.tuningFrequencyHz,
    );
    this.stateRevision += 1;
  }

  public play(tick: Tick = this.currentTick): void {
    const timeline = this.requirePublishedTimeline();

    this.currentTick = tick >= timeline.durationTicks
      ? this.resolveRestartTick()
      : clampTick(tick, timeline.durationTicks);

    if (
      this.publishedTransport?.loopEnabled === true
      && this.currentTick === this.getEffectiveLoop().endTick
    ) {
      this.currentTick = this.getEffectiveLoop().startTick;
    }

    this.loopActive = this.publishedTransport?.loopEnabled === true
      && this.currentTick <= this.getEffectiveLoop().endTick;
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
    const timeline = this.requirePublishedTimeline();

    const wasPlaying = this.currentStatus === "playing";

    this.releaseTimelineVoices();
    this.currentTick = clampTick(tick, timeline.durationTicks);

    if (
      wasPlaying
      && this.publishedTransport?.loopEnabled === true
      && this.currentTick === this.getEffectiveLoop().endTick
    ) {
      this.currentTick = this.getEffectiveLoop().startTick;
    }

    this.loopActive = wasPlaying
      && this.publishedTransport?.loopEnabled === true
      && this.currentTick <= this.getEffectiveLoop().endTick;
    this.tickCompensation = 0;
    this.refreshTempoCursor();
    this.refreshCursors(this.currentTick);

    if (wasPlaying) {
      this.startHeldNotes(this.currentTick);
    }

    this.stateRevision += 1;
  }

  public previewTempoMap(
    sourceId: ClipId,
    sequence: number,
    previewVersion: number,
    tempoStartTicks: Float64Array | null,
    tempoBpms: Float64Array | null,
  ): void {
    if (
      sourceId !== this.sourceId
      || sequence !== this.timelineSequence
      || previewVersion <= this.tempoMapPreviewVersion
      || (tempoStartTicks === null) !== (tempoBpms === null)
    ) {
      return;
    }

    if (tempoStartTicks === null || tempoBpms === null) {
      this.tempoMapPreview = null;
    } else {
      assertValidTempoPreview(tempoStartTicks, tempoBpms);
      this.tempoMapPreview = {
        startTicks: tempoStartTicks,
        bpms: tempoBpms,
      };
    }

    this.tempoMapPreviewVersion = previewVersion;
    this.refreshTempoCursor();
  }

  public previewLoop(
    sourceId: ClipId,
    sequence: number,
    previewVersion: number,
    loop: TransportState["loop"] | null,
  ): void {
    if (
      sourceId !== this.sourceId
      || sequence !== this.timelineSequence
      || previewVersion <= this.loopPreviewVersion
    ) {
      return;
    }

    if (loop !== null) {
      const durationTicks = this.requirePublishedTimeline().durationTicks;

      if (
        !Number.isFinite(loop.startTick)
        || !Number.isFinite(loop.endTick)
        || loop.startTick < 0
        || loop.endTick <= loop.startTick
        || loop.endTick > durationTicks
      ) {
        return;
      }
    }

    const oldLoopEnabled = this.requirePublishedTransport().loopEnabled;
    const oldLoop = this.getEffectiveLoop();
    const wasInside = oldLoopEnabled
      && this.currentTick >= oldLoop.startTick
      && this.currentTick < oldLoop.endTick;

    this.loopPreview = loop === null ? null : { ...loop };
    this.loopPreviewVersion = previewVersion;
    
    const newLoop = this.getEffectiveLoop();

    if (
      this.currentStatus === "playing"
      && oldLoopEnabled
      && wasInside
      && this.currentTick >= newLoop.endTick
    ) {
      const loopDuration = newLoop.endTick - newLoop.startTick;
      
      this.currentTick = newLoop.startTick
        + positiveModulo(
          this.currentTick - newLoop.startTick,
          loopDuration,
        );
      this.tickCompensation = 0;
      this.refreshTempoCursor();
      this.releaseTimelineVoices();
      this.refreshCursors(newLoop.startTick);
      this.startHeldNotes(
        newLoop.startTick,
        this.renderedFrame + 1,
      );
      this.onDiagnostic?.({
        type: "loop",
        frame: this.renderedFrame + 1,
        tick: this.currentTick,
      });
    }

    this.loopActive = this.currentStatus === "playing"
      && oldLoopEnabled
      && this.currentTick <= newLoop.endTick;

    if (this.currentStatus === "playing") {
      const boundaryTick = this.resolvePlaybackBoundaryTick();

      this.instrumentRuntime.reconcileAll(this.currentTick, boundaryTick);
    }
  }

  public previewInstrument(
    instrumentId: InstrumentId,
    config: SynthRuntimeConfig | null,
  ): void {
    this.instrumentRuntime.previewInstrument(instrumentId, config);
  }

  public previewInstrumentGain(
    instrumentId: InstrumentId,
    gain: number,
    sequence?: number,
    stateVersion?: number,
  ): void {
    if (sequence !== undefined && stateVersion !== undefined
      && !this.acceptStateMessage(sequence, stateVersion)) return;
    this.instrumentRuntime.previewGain(instrumentId, gain);
  }

  public previewMasterGain(gain: number, sequence?: number,
    stateVersion?: number): void {
    if (sequence !== undefined && stateVersion !== undefined
      && !this.acceptStateMessage(sequence, stateVersion)) return;
    this.masterGain = gain;
  }

  public replaceInstrumentEvents(
    instrumentId: InstrumentId,
    events: Pick<AudioWorkletTimeline["instruments"][number],
      "noteIds" | "pitches" | "startTicks" | "durationTicks"
      | "maximumEndTickTree" | "endTickTreeLeafCount">,
    sequence: number,
    stateVersion: number,
  ): void {
    if (!this.acceptStateMessage(sequence, stateVersion)) return;
    this.instrumentRuntime.replaceEvents(
      instrumentId,
      events,
      this.currentTick,
      this.resolvePlaybackBoundaryTick(),
      this.currentStatus === "playing",
      this.renderedFrame,
    );
  }

  public updateTransport(
    transport: TransportState,
    timelineState: Pick<AudioWorkletTimeline,
      "ppqn" | "durationTicks" | "tempoStartTicks" | "tempoBpms">,
    sequence: number,
    stateVersion: number,
  ): void {
    if (!this.acceptStateMessage(sequence, stateVersion)) return;
    this.publishedTimeline = {
      ...this.requirePublishedTimeline(),
      ...timelineState,
    };
    this.publishedTransport = transport;
    this.currentTick = clampTick(this.currentTick, timelineState.durationTicks);
    this.loopActive = this.currentStatus === "playing"
      && transport.loopEnabled
      && this.currentTick <= this.getEffectiveLoop().endTick;
    this.refreshTempoCursor();
  }

  public updateInstrumentConfig(
    instrumentId: InstrumentId,
    config: SynthRuntimeConfig,
    sequence: number,
    stateVersion: number,
  ): void {
    if (!this.acceptStateMessage(sequence, stateVersion)) return;
    this.instrumentRuntime.updateConfig(instrumentId, config);
  }

  public updateInstrumentPan(instrumentId: InstrumentId, pan: number,
    sequence: number, stateVersion: number): void {
    if (!this.acceptInstrumentMessage(instrumentId, sequence, stateVersion)) return;
    this.instrumentRuntime.updatePan(instrumentId, pan);
  }

  public updateInstrumentMute(instrumentId: InstrumentId, muted: boolean,
    sequence: number, stateVersion: number): void {
    if (!this.acceptInstrumentMessage(instrumentId, sequence, stateVersion)) return;
    this.instrumentRuntime.updateMute(instrumentId, muted);
  }

  public updateInstrumentSolo(instrumentId: InstrumentId, solo: boolean,
    sequence: number, stateVersion: number): void {
    if (!this.acceptInstrumentMessage(instrumentId, sequence, stateVersion)) return;
    this.instrumentRuntime.updateSolo(instrumentId, solo);
  }

  public updateMasterMute(muted: boolean, sequence: number,
    stateVersion: number): void {
    if (this.acceptStateMessage(sequence, stateVersion)) this.masterMuted = muted;
  }

  public updateMasterTuning(tuningFrequencyHz: number, sequence: number,
    stateVersion: number): void {
    if (!this.acceptStateMessage(sequence, stateVersion)) return;
    this.tuningFrequencyHz = tuningFrequencyHz;
    this.instrumentRuntime.setTuningFrequency(tuningFrequencyHz);
  }

  public audition(
    instrumentId: InstrumentId,
    pitch: number,
    durationSeconds: number,
  ): void {
    this.instrumentRuntime.audition(instrumentId, pitch, durationSeconds);
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

      this.instrumentRuntime.renderFrame(left, right, frameIndex);
      this.masterStage.processFrame(left, right, frameIndex, masterLevel);

      if (this.currentStatus === "playing") {
        this.advanceTransportOneSample();
      }

      this.renderedFrame += 1;
    }

    this.instrumentRuntime.pruneEndedVoices();
  }

  private startDueNotes(): void {
    this.instrumentRuntime.startDueNotes(
      this.currentTick,
      this.resolvePlaybackBoundaryTick(),
      this.renderedFrame,
    );
  }

  private startHeldNotes(
    tick: number,
    diagnosticFrame = this.renderedFrame,
  ): void {
    this.instrumentRuntime.startHeldNotes(
      tick,
      diagnosticFrame,
      this.resolvePlaybackBoundaryTick(),
    );
  }

  private releaseDueNotes(): void {
    this.instrumentRuntime.releaseDueNotes(this.currentTick);
  }

  private advanceTransportOneSample(): void {
    const timeline = this.requirePublishedTimeline();
    const loop = this.getEffectiveLoop();
    const compensatedIncrement = this.ticksPerSample - this.tickCompensation;
    const previousTick = this.currentTick;
    const nextTick = this.currentTick + compensatedIncrement;

    this.tickCompensation = (
      nextTick - this.currentTick
    ) - compensatedIncrement;
    this.currentTick = nextTick;

    if (
      this.loopActive
      && previousTick < loop.endTick
      && this.currentTick >= loop.endTick
    ) {
      const loopDuration = loop.endTick - loop.startTick;

      this.currentTick = loop.startTick
        + positiveModulo(
          this.currentTick - loop.startTick,
          loopDuration,
        );
      this.tickCompensation = 0;
      this.refreshTempoCursor();
      this.releaseTimelineVoices();
      // Always retain events exactly on the loop boundary. Floating-point
      // overshoot belongs to the next sample, not to cursor selection.
      this.refreshCursors(loop.startTick);
      // A note launched before a non-zero loop start must be reconstructed on
      // every pass when its source interval still crosses that boundary.
      this.startHeldNotes(
        loop.startTick,
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
          queued.stateVersion,
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
    this.instrumentRuntime.releaseTimelineVoices();
  }

  private acceptStateMessage(sequence: number, stateVersion: number): boolean {
    if (sequence !== this.timelineSequence
      || stateVersion < this.timelineStateVersion) return false;
    this.timelineStateVersion = stateVersion;
    return true;
  }

  private acceptInstrumentMessage(instrumentId: InstrumentId,
    sequence: number, stateVersion: number): boolean {
    return this.acceptStateMessage(sequence, stateVersion)
      && this.instrumentRuntime.hasInstrument(instrumentId);
  }

  private refreshCursors(tick: number): void {
    this.instrumentRuntime.refreshCursors(tick);
  }

  private refreshTempoCursor(): void {
    const starts = this.getEffectiveTempoStartTicks();

    this.tempoIndex = findTempoIndexAtTick(starts, this.currentTick);
    this.updateTicksPerSample();
  }

  private advanceTempoCursor(): void {
    if (this.currentTick < this.nextTempoStartTick) {
      return;
    }

    const starts = this.getEffectiveTempoStartTicks();
    let nextTempoStart: number | undefined = this.nextTempoStartTick;

    while (
      nextTempoStart !== undefined
      && this.currentTick >= nextTempoStart
    ) {
      this.tempoIndex += 1;
      nextTempoStart = starts[this.tempoIndex + 1];
    }

    this.updateTicksPerSample();
  }

  private updateTicksPerSample(): void {
    const timeline = this.requirePublishedTimeline();
    const starts = this.getEffectiveTempoStartTicks();
    const bpms = this.getEffectiveTempoBpms();
    const bpm = bpms[this.tempoIndex] ?? 120;

    this.ticksPerSample = bpm * timeline.ppqn / (60 * this.sampleRate);
    this.nextTempoStartTick = starts[this.tempoIndex + 1]
      ?? Number.POSITIVE_INFINITY;
  }

  private resolveRestartTick(): number {
    const transport = this.requirePublishedTransport();

    return transport.loopEnabled ? this.getEffectiveLoop().startTick : 0;
  }

  private resolvePlaybackBoundaryTick(): number {
    const timeline = this.requirePublishedTimeline();

    return this.loopActive
      ? this.getEffectiveLoop().endTick
      : timeline.durationTicks;
  }

  private getEffectiveTempoStartTicks(): Float64Array {
    return this.tempoMapPreview?.startTicks
      ?? this.requirePublishedTimeline().tempoStartTicks;
  }

  private getEffectiveTempoBpms(): Float64Array {
    return this.tempoMapPreview?.bpms
      ?? this.requirePublishedTimeline().tempoBpms;
  }

  private getEffectiveLoop(): TransportState["loop"] {
    return this.loopPreview ?? this.requirePublishedTransport().loop;
  }

  private requirePublishedTimeline(): AudioWorkletTimeline {
    if (this.publishedTimeline === null) {
      throw new Error("The worklet timeline has not been loaded.");
    }

    return this.publishedTimeline;
  }

  private requirePublishedTransport(): TransportState {
    if (this.publishedTransport === null) {
      throw new Error("The worklet transport has not been loaded.");
    }

    return this.publishedTransport;
  }
}

function clampTick(tick: number, durationTicks: number): number {
  return Math.min(durationTicks, Math.max(0, tick));
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function assertValidTempoPreview(
  startTicks: Float64Array,
  bpms: Float64Array,
): void {
  if (
    startTicks.length === 0
    || startTicks.length !== bpms.length
    || startTicks[0] !== 0
  ) {
    throw new RangeError("A tempo preview must start at tick 0.");
  }

  let previousTick = -1;

  for (let index = 0; index < startTicks.length; index += 1) {
    const tick = startTicks[index];
    const bpm = bpms[index];

    if (
      tick === undefined
      || bpm === undefined
      || !Number.isFinite(tick)
      || !Number.isFinite(bpm)
      || tick <= previousTick
      || bpm <= 0
    ) {
      throw new RangeError("A tempo preview must be sorted and positive.");
    }

    previousTick = tick;
  }
}
