import type {
  InstrumentId,
  Tick,
} from "../../domain/identifiers";
import {
  resolvePlaybackStartTick,
  type TransportState,
} from "../../domain/transport/transport";
import type {
  InstrumentConfig,
} from "../../domain/instruments/instrument";
import {
  AUDIO_CONSTANTS,
} from "./audio-constants";
import type {
  AudioTransportController,
  PlaybackSnapshot,
  PlaybackStatus,
} from "./playback-model";
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
  private snapshot: PlaybackSnapshot;
  private transport: TransportState;
  private queuedSnapshot: PlaybackSnapshot | null = null;
  private queuedTransport: TransportState | null = null;
  private queuedSequence: number | null = null;
  private readonly pendingTimelines = new Map<number, {
    readonly snapshot: PlaybackSnapshot;
    readonly transport: TransportState;
  }>();
  private readonly callbacks: AudioTransportCallbacks;
  private readonly contextFactory: AudioContextFactory;
  private readonly nodeFactory: AudioWorkletNodeFactory;
  private readonly instrumentPreviews = new Map<InstrumentId, InstrumentConfig>();
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private initialization: Promise<void> | null = null;
  private currentStatus: PlaybackStatus = "stopped";
  private desiredStatus: PlaybackStatus = "stopped";
  private positionTick: Tick;
  private operationSequence = 0;
  private queueOperationSequence = 0;
  private timelineSequence = 1;
  private nextTimelineSequence = 1;
  private stateVersion = 1;
  private pendingPositionAcknowledgement: PlaybackStatus | null = null;
  private disposed = false;

  public constructor(
    snapshot: PlaybackSnapshot,
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
    snapshot: PlaybackSnapshot,
    transport: TransportState,
    positionTickOverride?: Tick,
  ): void {
    this.assertUsable();
    assertCompatiblePlaybackState(snapshot, transport);
    const previousSnapshot = this.snapshot;
    const previousTransport = this.transport;
    const requiresTimelineReplacement = hasStructuralTopologyChange(
      previousSnapshot,
      snapshot,
    );
    const hadQueuedTimeline = this.queuedSequence !== null;
    this.snapshot = snapshot;
    this.transport = transport;
    this.stateVersion += 1;
    if (requiresTimelineReplacement) {
      this.timelineSequence = ++this.nextTimelineSequence;
    }
    this.queuedSnapshot = null;
    this.queuedTransport = null;
    this.queuedSequence = null;
    if (requiresTimelineReplacement || this.node === null) {
      this.pendingTimelines.clear();
    }
    this.queueOperationSequence += 1;

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
      if (hadQueuedTimeline && !requiresTimelineReplacement) {
        this.post({
          type: "clear-queued-timeline",
          operation: this.queueOperationSequence,
        });
      }
      if (requiresTimelineReplacement) {
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
    snapshot: PlaybackSnapshot,
    transport: TransportState,
  ): void {
    this.assertUsable();
    assertCompatiblePlaybackState(snapshot, transport);
    const sequence = ++this.nextTimelineSequence;
    const stateVersion = ++this.stateVersion;
    const operation = ++this.queueOperationSequence;

    this.queuedSnapshot = snapshot;
    this.queuedTransport = transport;
    this.queuedSequence = sequence;
    if (this.node === null) {
      this.pendingTimelines.clear();
    }
    this.pendingTimelines.set(sequence, { snapshot, transport });

    if (this.node !== null) {
      this.postQueuedTimeline(snapshot, transport, sequence, stateVersion, operation);
    }
  }

  public clearQueuedPlaybackState(): void {
    this.assertUsable();
    this.queuedSnapshot = null;
    this.queuedTransport = null;
    this.queuedSequence = null;
    const operation = ++this.queueOperationSequence;

    if (this.node === null) {
      this.pendingTimelines.clear();
    } else {
      this.post({ type: "clear-queued-timeline", operation });
    }
  }

  public replaceInstrumentPreview(
    instrumentId: InstrumentId,
    instrument: InstrumentConfig | null,
  ): void {
    this.assertUsable();

    if (instrument === null) {
      this.instrumentPreviews.delete(instrumentId);
    } else {
      this.instrumentPreviews.set(instrumentId, cloneInstrument(instrument));
    }

    this.post({
      type: "instrument-preview",
      instrumentId,
      instrument,
    });
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

  public async auditionPitch(
    instrumentId: InstrumentId,
    pitch: number,
  ): Promise<void> {
    this.assertUsable();

    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
      throw new RangeError("Audition pitch must be between 0 and 127.");
    }

    if (findPlaybackInstrument(this.snapshot, instrumentId) === undefined) {
      throw new Error(`Instrument "${instrumentId}" is unavailable.`);
    }

    await this.ensureInitialized();
    const context = this.requireContext();

    if (context.state !== "running") {
      await context.resume();
    }

    this.assertUsable();
    this.post({
      type: "audition",
      instrumentId,
      pitch,
      durationSeconds: AUDIO_CONSTANTS.auditionNoteDurationSeconds,
    });
  }

  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.operationSequence += 1;
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

    if (
      this.queuedSnapshot !== null
      && this.queuedTransport !== null
      && this.queuedSequence !== null
    ) {
      this.postQueuedTimeline(
        this.queuedSnapshot,
        this.queuedTransport,
        this.queuedSequence,
        this.stateVersion,
        this.queueOperationSequence,
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
      sequence: this.timelineSequence,
      stateVersion: this.stateVersion,
      protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
    } satisfies MainToAudioWorkletMessage, transfers);
  }

  private postQueuedTimeline(
    snapshot: PlaybackSnapshot,
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
    previous: PlaybackSnapshot,
    next: PlaybackSnapshot,
    previousTransport: TransportState,
    nextTransport: TransportState,
  ): void {
    const target = {
      sequence: this.timelineSequence,
      stateVersion: this.stateVersion,
    };

    if (hasTransportConfigChange(previous, next,
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

      if (!haveEqualEvents(previousInstrument, instrument)) {
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
      if (!haveEqualInstrumentConfigs(previousInstrument.instrument,
        instrument.instrument)) this.post({
        type: "instrument-config", instrumentId: instrument.instrumentId,
        instrument: instrument.instrument, ...target,
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

    const pendingTimeline = this.pendingTimelines.get(message.sequence);

    if (
      message.sequence > this.timelineSequence
      && pendingTimeline !== undefined
    ) {
      this.snapshot = pendingTimeline.snapshot;
      this.transport = pendingTimeline.transport;
      this.timelineSequence = message.sequence;
      this.queuedSnapshot = null;
      this.queuedTransport = null;
      this.queuedSequence = null;

      for (const sequence of this.pendingTimelines.keys()) {
        if (sequence <= message.sequence) {
          this.pendingTimelines.delete(sequence);
        }
      }

      sourceChanged = true;
    } else if (message.sequence !== this.timelineSequence) {
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
    if (operation !== this.queueOperationSequence) {
      return;
    }

    for (const sequence of this.pendingTimelines.keys()) {
      if (sequence !== queuedSequence) {
        this.pendingTimelines.delete(sequence);
      }
    }
  }

  private handleProcessorFailure(error: Error): void {
    if (this.disposed) {
      return;
    }

    this.setStatus("stopped");
    this.desiredStatus = "stopped";
    this.pendingPositionAcknowledgement = null;
    this.pendingTimelines.clear();
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

function cloneInstrument<TInstrument extends InstrumentConfig>(
  instrument: TInstrument,
): TInstrument {
  return {
    ...instrument,
    envelope: { ...instrument.envelope },
    filterEnvelope: { ...instrument.filterEnvelope },
  };
}

function cloneTransport(transport: TransportState): TransportState {
  return {
    ...transport,
    loop: { ...transport.loop },
  };
}

function hasStructuralTopologyChange(
  previous: PlaybackSnapshot,
  next: PlaybackSnapshot,
): boolean {
  return previous.sourceId !== next.sourceId
    || previous.instruments.length !== next.instruments.length
    || previous.instruments.some((instrument, index) =>
      instrument.instrumentId !== next.instruments[index]?.instrumentId);
}

function hasTransportConfigChange(previous: PlaybackSnapshot,
  next: PlaybackSnapshot, previousTransport: TransportState,
  nextTransport: TransportState): boolean {
  return previous.ppqn !== next.ppqn
    || previous.durationTicks !== next.durationTicks
    || !haveEqualNumbers(previous.tempoMap.startTicks, next.tempoMap.startTicks)
    || !haveEqualNumbers(previous.tempoMap.bpms, next.tempoMap.bpms)
    || previousTransport.loopEnabled !== nextTransport.loopEnabled
    || previousTransport.loop.startTick !== nextTransport.loop.startTick
    || previousTransport.loop.endTick !== nextTransport.loop.endTick;
}

function haveEqualEvents(
  previous: PlaybackSnapshot["instruments"][number],
  next: PlaybackSnapshot["instruments"][number],
): boolean {
  return haveEqualValues(previous.noteIds, next.noteIds)
    && haveEqualNumbers(previous.pitches, next.pitches)
    && haveEqualNumbers(previous.startTicks, next.startTicks)
    && haveEqualNumbers(previous.durationTicks, next.durationTicks);
}

function haveEqualValues<T>(previous: ArrayLike<T>, next: ArrayLike<T>): boolean {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) return false;
  }
  return true;
}

function haveEqualNumbers(previous: ArrayLike<number>,
  next: ArrayLike<number>): boolean {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) return false;
  }
  return true;
}

function haveEqualInstrumentConfigs(
  previous: PlaybackSnapshot["instruments"][number]["instrument"],
  next: PlaybackSnapshot["instruments"][number]["instrument"],
): boolean {
  return JSON.stringify(previous) === JSON.stringify(next);
}
