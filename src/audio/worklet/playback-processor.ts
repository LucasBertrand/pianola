import type {
  MainToAudioWorkletMessage,
} from "./audio-worklet-protocol";
import {
  AUDIO_WORKLET_PROTOCOL_VERSION,
  PLAYBACK_PROCESSOR_NAME,
} from "./audio-worklet-protocol";
import {
  WorkletTimelineEngine,
} from "./worklet-timeline-engine";

declare const sampleRate: number;
declare const currentFrame: number;

declare abstract class AudioWorkletProcessor {
  public readonly port: MessagePort;
  public constructor(options?: AudioWorkletNodeOptions);
  public abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (
    options?: AudioWorkletNodeOptions,
  ) => AudioWorkletProcessor,
): void;

const POSITION_REPORT_INTERVAL_FRAMES = 1_024;
const LEVEL_REPORT_INTERVAL_FRAMES = Math.max(1, Math.round(sampleRate / 20));

class PlaybackProcessor extends AudioWorkletProcessor {
  private readonly engine = new WorkletTimelineEngine(sampleRate);
  private readonly levelReport = {
    protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
    type: "master-levels" as const,
    frame: 0,
    levels: {
      peakLeft: 0,
      peakRight: 0,
      rmsLeft: 0,
      rmsRight: 0,
      preProtectionPeak: 0,
      gainReductionDb: 0,
    },
  };
  private lastReportedStateRevision = -1;
  private nextPositionReportFrame = 0;
  private nextLevelReportFrame = 0;
  private failed = false;

  public constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    this.port.onmessage = (event: MessageEvent<MainToAudioWorkletMessage>) => {
      try {
        this.handleMessage(event.data);
      } catch (error: unknown) {
        this.reportError(error);
      }
    };
  }

  public process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    if (this.failed) {
      return false;
    }

    const output = outputs[0];
    const left = output?.[0];
    const right = output?.[1];

    if (left === undefined || right === undefined) {
      return true;
    }

    try {
      this.engine.process(left, right);
      this.publishTransportStateIfNeeded();
      this.publishMasterLevelsIfNeeded();
      return true;
    } catch (error: unknown) {
      left.fill(0);
      right.fill(0);
      this.reportError(error);
      return false;
    }
  }

  private handleMessage(message: MainToAudioWorkletMessage): void {
    if (message.protocolVersion !== AUDIO_WORKLET_PROTOCOL_VERSION) {
      throw new Error("Unsupported audio worklet protocol version.");
    }

    switch (message.type) {
      case "load-timeline":
        this.engine.loadTimeline(
          message.timeline,
          message.transport,
          message.sequence,
          message.stateVersion,
        );
        break;

      case "queue-timeline":
        this.engine.queueTimeline(
          message.timeline,
          message.transport,
          message.sequence,
          message.stateVersion,
        );
        this.port.postMessage({
          protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
          type: "queued-timeline-state",
          operation: message.operation,
          sequence: message.sequence,
        });
        break;

      case "clear-queued-timeline":
        this.engine.clearQueuedTimeline();
        this.port.postMessage({
          protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
          type: "queued-timeline-state",
          operation: message.operation,
          sequence: null,
        });
        break;

      case "replace-instrument-events":
        this.engine.replaceInstrumentEvents(message.instrumentId, message,
          message.sequence, message.stateVersion);
        break;

      case "transport-config":
        this.engine.updateTransport(message.transport, message,
          message.sequence, message.stateVersion);
        break;

      case "play":
        this.engine.play(message.tick);
        break;

      case "pause":
        this.engine.pause();
        break;

      case "stop":
        this.engine.stop();
        break;

      case "seek":
        this.engine.seek(message.tick);
        break;

      case "instrument-preview":
        this.engine.previewInstrument(
          message.instrumentId,
          message.instrument,
        );
        break;

      case "instrument-gain":
        this.engine.previewInstrumentGain(
          message.instrumentId,
          message.gain,
          message.sequence,
          message.stateVersion,
        );
        break;

      case "instrument-pan":
        this.engine.updateInstrumentPan(message.instrumentId, message.pan,
          message.sequence, message.stateVersion);
        break;

      case "instrument-mute":
        this.engine.updateInstrumentMute(message.instrumentId, message.muted,
          message.sequence, message.stateVersion);
        break;

      case "instrument-solo":
        this.engine.updateInstrumentSolo(message.instrumentId, message.solo,
          message.sequence, message.stateVersion);
        break;

      case "instrument-config":
        this.engine.updateInstrumentConfig(message.instrumentId,
          message.instrument, message.sequence, message.stateVersion);
        break;

      case "master-gain":
        this.engine.previewMasterGain(message.gain, message.sequence,
          message.stateVersion);
        break;

      case "master-mute":
        this.engine.updateMasterMute(message.muted, message.sequence,
          message.stateVersion);
        break;

      case "master-tuning":
        this.engine.updateMasterTuning(message.tuningFrequencyHz,
          message.sequence, message.stateVersion);
        break;

      case "audition":
        this.engine.audition(
          message.instrumentId,
          message.pitch,
          message.durationSeconds,
        );
        break;
    }

  }

  private publishTransportStateIfNeeded(): void {
    if (
      this.engine.transportStateRevision !== this.lastReportedStateRevision
      || currentFrame >= this.nextPositionReportFrame
    ) {
      this.publishTransportState();
    }
  }

  private publishTransportState(): void {
    this.lastReportedStateRevision = this.engine.transportStateRevision;
    this.nextPositionReportFrame = currentFrame
      + POSITION_REPORT_INTERVAL_FRAMES;
    this.port.postMessage({
      protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
      type: "transport-state",
      status: this.engine.status,
      sourceId: this.engine.sourceId,
      tick: this.engine.positionTick,
      frame: currentFrame,
      sequence: this.engine.sequence,
    });
  }

  private publishMasterLevelsIfNeeded(): void {
    if (currentFrame < this.nextLevelReportFrame) {
      return;
    }

    this.nextLevelReportFrame = currentFrame + LEVEL_REPORT_INTERVAL_FRAMES;
    this.levelReport.frame = currentFrame;
    this.engine.writeAndResetMasterLevels(this.levelReport.levels);
    this.port.postMessage(this.levelReport);
  }

  private reportError(error: unknown): void {
    this.failed = true;
    this.port.postMessage({
      protocolVersion: AUDIO_WORKLET_PROTOCOL_VERSION,
      type: "processor-error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

registerProcessor(PLAYBACK_PROCESSOR_NAME, PlaybackProcessor);
