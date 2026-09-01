import type {
  ClipId,
  InstrumentId,
  Tick,
} from "../../domain/identifiers";
import {
  resolvePlaybackStartTick,
  type LoopRegion,
  type TransportState,
} from "../../domain/transport/transport";
import type {
  InstrumentConfig,
} from "../../domain/instruments/synth/synth-config";
import type {
  SynthRuntimeConfig,
} from "./synth/synth-runtime-config";
import {
  projectSynthRuntimeConfig,
} from "./synth/project-synth-runtime-config";
import {
  AudioWorkletStateSynchronizer,
  hasAudioWorkletTransportChange,
  haveEqualAudioWorkletEvents,
  haveEqualSynthConfigs,
} from "./audio-worklet-state-synchronizer";
import {
  AUDIO_CONSTANTS,
} from "./audio-constants";
import type {
  AudioTransportController,
  PitchAuditionHandle,
  PlaybackStatus,
} from "../../application/ports/audio-transport";
import type {
  AudioPlaybackPlan,
  TempoMapSnapshot,
} from "../../application/audio/audio-playback-plan";
import {
  assertCompatiblePlaybackState,
  clampPlaybackTick,
  findPlaybackInstrument,
} from "./playback-transport-query";
import type {
  AudioTransportCallbacks,
} from "./audio-transport-callbacks";
import processorModuleUrl from "./worklet/playback-processor.ts?worker&url";
import type {
  AudioWorkletToMainMessage,
  MainToAudioWorkletMessage,
} from "./worklet/audio-worklet-protocol";
import {
  AUDIO_WORKLET_PROTOCOL_VERSION,
  PLAYBACK_PROCESSOR_NAME,
} from "./worklet/audio-worklet-protocol";
import {
  createTransferableInstrumentEvents,
  createTransferableAudioWorkletTimeline,
} from "./worklet/create-audio-worklet-timeline";

type UnversionedMessage<T> = T extends MainToAudioWorkletMessage
  ? Omit<T, "protocolVersion"> : never;

type AudioContextFactory = () => AudioContext;
type AudioWorkletNodeFactory = (context: AudioContext) => AudioWorkletNode;

/** Browser adapter for the sample-clock transport hosted by AudioWorklet. */
export class AudioWorkletTransport implements AudioTransportController {
  private snapshot: AudioPlaybackPlan;
  private transport: TransportState;
  private readonly synchronizer = new AudioWorkletStateSynchronizer();
  private readonly callbacks: AudioTransportCallbacks;
  private readonly contextFactory: AudioContextFactory;
  private readonly nodeFactory: AudioWorkletNodeFactory;
  private readonly instrumentPreviews = new Map<InstrumentId, SynthRuntimeConfig>();
  private tempoMapPreview: {
    readonly sourceId: ClipId;
    readonly startTicks: Float64Array;
    readonly bpms: Float64Array;
  } | null = null;
  private loopPreview: {
    readonly sourceId: ClipId;
    readonly loop: LoopRegion;
  } | null = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private initialization: Promise<void> | null = null;
  private currentStatus: PlaybackStatus = "stopped";
  private desiredStatus: PlaybackStatus = "stopped";
  private positionTick: Tick;
  private operationSequence = 0;
  private tempoMapPreviewVersion = 0;
  private loopPreviewVersion = 0;
  private auditionSequence = 0;
  private readonly activeAuditionIds = new Set<number>();
  private pendingPositionAcknowledgement: PlaybackStatus | null = null;
  private disposed = false;

  public constructor(
    snapshot: AudioPlaybackPlan,
    transport: TransportState,
    callbacks: AudioTransportCallbacks = {},
    initialPositionTick: Tick = 0,
    contextFactory: AudioContextFactory = createBrowserAudioContext,
    nodeFactory: AudioWorkletNodeFactory = createBrowserAudioWorkletNode,
  ) {
    assertCompatiblePlaybackState(snapshot, transport);
    this.snapshot = snapshot;
    this.transport = transport;
    this.callbacks = callbacks;
    this.contextFactory = contextFactory;
    this.nodeFactory = nodeFactory;
    this.positionTick = clampPlaybackTick(
      initialPositionTick,
      snapshot.durationTicks,
    );
  }

  public get status(): PlaybackStatus {
    return this.currentStatus;
  }

  public getPositionTick(): Tick {
    return this.positionTick;
  }

  public replacePlaybackState(
    snapshot: AudioPlaybackPlan,
    transport: TransportState,
    positionTickOverride?: Tick,
  ): void {
    this.assertUsable();
    assertCompatiblePlaybackState(snapshot, transport);
    const previousSnapshot = this.snapshot;
    const previousTransport = this.transport;
    const decision = this.synchronizer.beginReplacement(
      previousSnapshot,
      snapshot,
      this.node !== null,
    );
    const sourceChanged = previousSnapshot.sourceId !== snapshot.sourceId;
    this.snapshot = snapshot;
    this.transport = transport;
    if (sourceChanged) {
      this.tempoMapPreview = null;
      this.loopPreview = null;
    }

    if (positionTickOverride !== undefined) {
      this.positionTick = clampPlaybackTick(
        positionTickOverride,
        snapshot.durationTicks,
      );
    } else {
      this.positionTick = clampPlaybackTick(
        this.positionTick,
        snapshot.durationTicks,
      );
    }

    if (this.node !== null) {
      if (decision.hadQueuedTimeline && !decision.requiresTimelineReplacement) {
        this.post({
          type: "clear-queued-timeline",
          operation: decision.queueOperation,
        });
      }
      if (decision.requiresTimelineReplacement) {
        this.postTimeline();
      } else {
        this.postIncrementalChanges(previousSnapshot, snapshot,
          previousTransport, transport);
      }

      if (positionTickOverride !== undefined) {
        this.post({ type: "seek", tick: this.positionTick });
      }
    }
  }

  /** Preloads the next clip so the render thread can switch sample-accurately. */
  public queuePlaybackState(
    snapshot: AudioPlaybackPlan,
    transport: TransportState,
  ): void {
    this.assertUsable();
    assertCompatiblePlaybackState(snapshot, transport);
    const { sequence, stateVersion, operation } =
      this.synchronizer.queueTimeline(snapshot, transport, this.node !== null);

    if (this.node !== null) {
      this.postQueuedTimeline(snapshot, transport, sequence, stateVersion, operation);
    }
  }

  public clearQueuedPlaybackState(): void {
    this.assertUsable();
    const operation = this.synchronizer.clearQueuedTimeline(this.node !== null);

    if (this.node !== null) {
      this.post({ type: "clear-queued-timeline", operation });
    }
  }

  public replaceInstrumentPreview(
    instrumentId: InstrumentId,
    instrument: InstrumentConfig | null,
  ): void {
    this.assertUsable();

    const runtimeConfig = instrument === null
      ? null
      : projectSynthRuntimeConfig(instrument);

    if (runtimeConfig === null) {
      this.instrumentPreviews.delete(instrumentId);
    } else {
      this.instrumentPreviews.set(instrumentId, runtimeConfig);
    }

    this.post({
      type: "instrument-preview",
      instrumentId,
      instrument: runtimeConfig,
    });
  }

  public previewTempoMap(
    clipId: ClipId,
    tempoMap: TempoMapSnapshot | null,
  ): void {
    this.assertUsable();

    if (clipId !== this.snapshot.sourceId) {
      return;
    }

    if (tempoMap === null) {
      if (this.tempoMapPreview === null) {
        return;
      }

      this.tempoMapPreview = null;
      this.postTempoMapPreview();
      return;
    }

    if (
      this.tempoMapPreview?.sourceId === clipId
      && haveEqualNumbers(this.tempoMapPreview.startTicks, tempoMap.startTicks)
      && haveEqualNumbers(this.tempoMapPreview.bpms, tempoMap.bpms)
    ) {
      return;
    }

    this.tempoMapPreview = {
      sourceId: clipId,
      startTicks: new Float64Array(tempoMap.startTicks),
      bpms: new Float64Array(tempoMap.bpms),
    };
    this.postTempoMapPreview();
  }

  public previewLoop(clipId: ClipId, loop: LoopRegion | null): void {
    this.assertUsable();

    if (clipId !== this.snapshot.sourceId) {
      return;
    }

    if (loop === null) {
      if (this.loopPreview === null) {
        return;
      }

      this.loopPreview = null;
      this.postLoopPreview();
      return;
    }

    if (
      this.loopPreview?.sourceId === clipId
      && this.loopPreview.loop.startTick === loop.startTick
      && this.loopPreview.loop.endTick === loop.endTick
    ) {
      return;
    }

    this.loopPreview = {
      sourceId: clipId,
      loop: { ...loop },
    };
    this.postLoopPreview();
  }

  public async play(startTick: Tick = this.positionTick): Promise<void> {
    this.assertUsable();

    if (this.currentStatus === "playing") {
      return;
    }

    this.operationSequence += 1;
    this.pendingPositionAcknowledgement = null;
    const operation = this.operationSequence;
    this.positionTick = resolvePlaybackStartTick(
      startTick,
      this.snapshot.durationTicks,
      this.transport,
    );

    try {
      await this.ensureInitialized();
      const context = this.requireContext();

      if (context.state !== "running") {
        await context.resume();
      }

      if (this.disposed || operation !== this.operationSequence) {
        return;
      }

      this.post({ type: "play", tick: this.positionTick });
      this.desiredStatus = "playing";
      this.setStatus("playing");
    } catch (error: unknown) {
      if (!this.disposed && operation === this.operationSequence) {
        this.setStatus("stopped");
        this.desiredStatus = "stopped";
        this.callbacks.onError?.(error);
      }

      throw error;
    }
  }

  public pause(): void {
    this.assertUsable();
    this.operationSequence += 1;
    this.desiredStatus = "paused";
    this.pendingPositionAcknowledgement = "paused";
    this.post({ type: "pause" });
    this.setStatus("paused");
  }

  public stop(): void {
    this.assertUsable();
    this.operationSequence += 1;
    this.desiredStatus = "stopped";
    this.pendingPositionAcknowledgement = "stopped";
    this.post({ type: "stop" });
    this.setStatus("stopped");
  }

  public seek(tick: Tick): void {
    this.assertUsable();
    this.positionTick = clampPlaybackTick(tick, this.snapshot.durationTicks);
    this.post({ type: "seek", tick: this.positionTick });
    this.emitStatus();
  }

  public previewMasterGain(gain: number): void {
    this.assertUsable();
    this.post({ type: "master-gain", gain });
  }

  public previewInstrumentGain(
    instrumentId: InstrumentId,
    gain: number,
  ): void {
    this.assertUsable();
    this.post({ type: "instrument-gain", instrumentId, gain });
  }

  public beginPitchAudition(
    instrumentId: InstrumentId,
    pitch: number,
  ): PitchAuditionHandle {
    this.assertUsable();

    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
      throw new RangeError("Audition pitch must be between 0 and 127.");
    }

    if (findPlaybackInstrument(this.snapshot, instrumentId) === undefined) {
      throw new Error(`Instrument "${instrumentId}" is unavailable.`);
    }

    const auditionId = ++this.auditionSequence;
    this.activeAuditionIds.add(auditionId);
    let released = false;
    const ready = this.startPitchAudition(
      auditionId,
      instrumentId,
      pitch,
    );

    return {
      ready,
      release: (): void => {
        if (released) {
          return;
        }

        released = true;
        this.releasePitchAudition(auditionId);
      },
    };
  }

  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.operationSequence += 1;
    this.activeAuditionIds.clear();
    this.disconnectNode();
    const context = this.context;

    this.context = null;

    if (context !== null && context.state !== "closed") {
      await context.close();
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.node !== null) {
      return;
    }

    if (this.initialization !== null) {
      return this.initialization;
    }

    this.initialization = this.initialize();

    try {
      await this.initialization;
    } catch (error: unknown) {
      this.disconnectNode();
      const context = this.context;

      this.context = null;

      if (context !== null && context.state !== "closed") {
        await context.close().catch(() => {
          // Preserve the initialization failure as the actionable error.
        });
      }

      throw error;
    } finally {
      this.initialization = null;
    }
  }

  private async initialize(): Promise<void> {
    const context = this.contextFactory();

    this.context = context;

    if (context.audioWorklet === undefined) {
      throw new Error("AudioWorklet is not supported by this browser.");
    }

    await context.audioWorklet.addModule(processorModuleUrl);
    this.assertUsable();
    const node = this.nodeFactory(context);

    node.port.onmessage = (
      event: MessageEvent<AudioWorkletToMainMessage>,
    ): void => {
      this.handleProcessorMessage(event.data);
    };
    node.onprocessorerror = (): void => {
      this.handleProcessorFailure(
        new Error("The real-time audio processor stopped unexpectedly."),
      );
    };
    node.connect(context.destination);
    this.node = node;
    this.postTimeline();

    const queuedTimeline = this.synchronizer.queuedTimeline;

    if (queuedTimeline !== null) {
      this.postQueuedTimeline(
        queuedTimeline.snapshot,
        queuedTimeline.transport,
        queuedTimeline.sequence,
        this.synchronizer.stateVersion,
        this.synchronizer.queueOperation,
      );
    }

    for (const [instrumentId, instrument] of this.instrumentPreviews) {
      this.post({
        type: "instrument-preview",
        instrumentId,
        instrument,
      });
    }
  }

  private postTimeline(): void {
    const { timeline, transfers } =
      createTransferableAudioWorkletTimeline(this.snapshot);

    this.node?.port.postMessage({
      type: "load-timeline",
      timeline,
      transport: cloneTransport(this.transport),
      sequence: this.synchronizer.sequence,
      stateVersion: this.synchronizer.stateVersion,
      protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
    } satisfies MainToAudioWorkletMessage, transfers);
    this.postActiveTimingPreviews();
  }

  private postActiveTimingPreviews(): void {
    if (this.tempoMapPreview !== null) {
      this.postTempoMapPreview();
    }

    if (this.loopPreview !== null) {
      this.postLoopPreview();
    }
  }

  private postTempoMapPreview(): void {
    if (this.node === null) {
      return;
    }

    const preview = this.tempoMapPreview;
    const tempoStartTicks = preview === null
      ? null
      : new Float64Array(preview.startTicks);
    const tempoBpms = preview === null
      ? null
      : new Float64Array(preview.bpms);
    const transfers: Transferable[] = [];

    if (tempoStartTicks !== null && tempoBpms !== null) {
      transfers.push(tempoStartTicks.buffer, tempoBpms.buffer);
    }

    this.node.port.postMessage({
      protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
      type: "tempo-map-preview",
      sourceId: this.snapshot.sourceId,
      sequence: this.synchronizer.sequence,
      previewVersion: ++this.tempoMapPreviewVersion,
      tempoStartTicks,
      tempoBpms,
    } satisfies MainToAudioWorkletMessage, transfers);
  }

  private postLoopPreview(): void {
    if (this.node === null) {
      return;
    }

    this.node.port.postMessage({
      protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
      type: "loop-preview",
      sourceId: this.snapshot.sourceId,
      sequence: this.synchronizer.sequence,
      previewVersion: ++this.loopPreviewVersion,
      loop: this.loopPreview === null
        ? null
        : { ...this.loopPreview.loop },
    } satisfies MainToAudioWorkletMessage);
  }

  private postQueuedTimeline(
    snapshot: AudioPlaybackPlan,
    transport: TransportState,
    sequence: number,
    stateVersion: number,
    operation: number,
  ): void {
    const { timeline, transfers } =
      createTransferableAudioWorkletTimeline(snapshot);

    this.node?.port.postMessage({
      type: "queue-timeline",
      timeline,
      transport: cloneTransport(transport),
      sequence,
      stateVersion,
      operation,
      protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
    } satisfies MainToAudioWorkletMessage, transfers);
  }

  private postIncrementalChanges(
    previous: AudioPlaybackPlan,
    next: AudioPlaybackPlan,
    previousTransport: TransportState,
    nextTransport: TransportState,
  ): void {
    const target = {
      sequence: this.synchronizer.sequence,
      stateVersion: this.synchronizer.stateVersion,
    };

    if (hasAudioWorkletTransportChange(previous, next,
      previousTransport, nextTransport)) {
      const tempoStartTicks = new Float64Array(next.tempoMap.startTicks);
      const tempoBpms = new Float64Array(next.tempoMap.bpms);
      this.node?.port.postMessage({
        protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
        type: "transport-config",
        transport: cloneTransport(nextTransport),
        ppqn: next.ppqn,
        durationTicks: next.durationTicks,
        tempoStartTicks,
        tempoBpms,
        ...target,
      } satisfies MainToAudioWorkletMessage, [
        tempoStartTicks.buffer,
        tempoBpms.buffer,
      ]);
    }

    for (let index = 0; index < next.instruments.length; index += 1) {
      const instrument = next.instruments[index];
      const previousInstrument = previous.instruments[index];
      if (instrument === undefined || previousInstrument === undefined) continue;

      if (!haveEqualAudioWorkletEvents(previousInstrument, instrument)) {
        const { events, transfers } =
          createTransferableInstrumentEvents(instrument);
        this.node?.port.postMessage({
          protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
          type: "replace-instrument-events",
          instrumentId: instrument.instrumentId,
          ...events,
          ...target,
        } satisfies MainToAudioWorkletMessage, transfers);
      }
      if (previousInstrument.gain !== instrument.gain) this.post({
        type: "instrument-gain", instrumentId: instrument.instrumentId,
        gain: instrument.gain, ...target,
      });
      if (previousInstrument.pan !== instrument.pan) this.post({
        type: "instrument-pan", instrumentId: instrument.instrumentId,
        pan: instrument.pan, ...target,
      });
      if (previousInstrument.muted !== instrument.muted) this.post({
        type: "instrument-mute", instrumentId: instrument.instrumentId,
        muted: instrument.muted, ...target,
      });
      if (previousInstrument.solo !== instrument.solo) this.post({
        type: "instrument-solo", instrumentId: instrument.instrumentId,
        solo: instrument.solo, ...target,
      });
      if (!haveEqualSynthConfigs(previousInstrument.instrument,
        instrument.instrument)) this.post({
        type: "instrument-config", instrumentId: instrument.instrumentId,
        instrument: projectSynthRuntimeConfig(instrument.instrument), ...target,
      });
    }

    if (previous.masterGain !== next.masterGain) this.post({
      type: "master-gain", gain: next.masterGain, ...target,
    });
    if (previous.masterMuted !== next.masterMuted) this.post({
      type: "master-mute", muted: next.masterMuted, ...target,
    });
    if (previous.masterTuningFrequencyHz !== next.masterTuningFrequencyHz) {
      this.post({ type: "master-tuning",
        tuningFrequencyHz: next.masterTuningFrequencyHz, ...target });
    }
  }

  private post(message: UnversionedMessage<MainToAudioWorkletMessage>): void {
    this.node?.port.postMessage({
      ...message,
      protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
    } as MainToAudioWorkletMessage);
  }

  private handleProcessorMessage(message: AudioWorkletToMainMessage): void {
    if (this.disposed) {
      return;
    }

    if (message.protocolVersion !== AUDIO_WORKLET_PROTOCOL_VERSION) {
      this.handleProcessorFailure(new Error(
        "Unsupported audio worklet protocol version.",
      ));
      return;
    }

    if (message.type === "processor-error") {
      this.handleProcessorFailure(new Error(message.message));
      return;
    }

    if (message.type === "queued-timeline-state") {
      this.handleQueuedTimelineState(message.operation, message.sequence);
      return;
    }

    if (message.type === "master-levels") {
      this.callbacks.onMasterLevels?.(message.levels);
      return;
    }

    let sourceChanged = false;

    const acknowledgement = this.synchronizer.acknowledgeTimeline(
      message.sequence,
    );

    if (acknowledgement.kind === "activate") {
      if (acknowledgement.pending.snapshot.sourceId !== this.snapshot.sourceId) {
        this.tempoMapPreview = null;
        this.loopPreview = null;
      }
      this.snapshot = acknowledgement.pending.snapshot;
      this.transport = acknowledgement.pending.transport;

      sourceChanged = true;
    } else if (acknowledgement.kind === "reject") {
      return;
    }

    if (message.sourceId !== this.snapshot.sourceId) {
      return;
    }

    this.positionTick = clampPlaybackTick(
      message.tick,
      this.snapshot.durationTicks,
    );
    const acknowledgesPosition =
      this.pendingPositionAcknowledgement === message.status
      && message.status === this.desiredStatus;

    if (acknowledgesPosition) {
      this.pendingPositionAcknowledgement = null;
    }

    if (
      message.status === "stopped"
      && this.desiredStatus === "playing"
      && message.tick >= this.snapshot.durationTicks
    ) {
      this.desiredStatus = "stopped";
    }

    if (
      message.status === this.desiredStatus
      && message.status !== this.currentStatus
    ) {
      this.setStatus(message.status);
    } else if (
      message.status === this.currentStatus
      && (sourceChanged || acknowledgesPosition)
    ) {
      this.emitStatus();
    }
  }

  private handleQueuedTimelineState(
    operation: number,
    queuedSequence: number | null,
  ): void {
    this.synchronizer.acknowledgeQueuedState(operation, queuedSequence);
  }

  private handleProcessorFailure(error: Error): void {
    if (this.disposed) {
      return;
    }

    this.setStatus("stopped");
    this.desiredStatus = "stopped";
    this.pendingPositionAcknowledgement = null;
    this.synchronizer.clearPending();
    this.callbacks.onError?.(error);
  }

  private setStatus(status: PlaybackStatus): void {
    const changed = status !== this.currentStatus;

    this.currentStatus = status;

    if (changed) {
      this.emitStatus();
    }
  }

  private emitStatus(): void {
    this.callbacks.onStatusChange?.(
      this.currentStatus,
      this.snapshot.sourceId,
      this.positionTick,
    );
  }

  private requireContext(): AudioContext {
    if (this.context === null) {
      throw new Error("The audio context is unavailable.");
    }

    return this.context;
  }

  private disconnectNode(): void {
    const node = this.node;

    this.node = null;
    node?.disconnect();
    node?.port.close();
  }

  private async startPitchAudition(
    auditionId: number,
    instrumentId: InstrumentId,
    pitch: number,
  ): Promise<void> {
    try {
      await this.ensureInitialized();

      if (!this.activeAuditionIds.has(auditionId)) {
        return;
      }

      const context = this.requireContext();

      if (context.state !== "running") {
        await context.resume();
      }

      this.assertUsable();

      if (!this.activeAuditionIds.has(auditionId)) {
        return;
      }

      this.post({
        type: "audition-start",
        auditionId,
        instrumentId,
        pitch,
      });
    } catch (error: unknown) {
      this.activeAuditionIds.delete(auditionId);
      throw error;
    }
  }

  private releasePitchAudition(auditionId: number): void {
    if (!this.activeAuditionIds.delete(auditionId)) {
      return;
    }

    this.post({ type: "audition-release", auditionId });
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("The audio transport has been disposed.");
    }
  }
}

function createBrowserAudioContext(): AudioContext {
  if (
    typeof AudioContext === "undefined"
    || typeof AudioWorkletNode === "undefined"
  ) {
    throw new Error("AudioWorklet is not supported by this browser.");
  }

  return new AudioContext({ latencyHint: AUDIO_CONSTANTS.latencyHint });
}

function createBrowserAudioWorkletNode(
  context: AudioContext,
): AudioWorkletNode {
  return new AudioWorkletNode(context, PLAYBACK_PROCESSOR_NAME, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
}

function cloneTransport(transport: TransportState): TransportState {
  return {
    ...transport,
    loop: { ...transport.loop },
  };
}

function haveEqualNumbers(previous: ArrayLike<number>,
  next: ArrayLike<number>): boolean {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) return false;
  }
  return true;
}
