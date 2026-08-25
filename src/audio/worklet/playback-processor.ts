import type {
  MainToAudioWorkletMessage,
} from "./audio-worklet-protocol";
import {
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

class PlaybackProcessor extends AudioWorkletProcessor {
  private readonly engine = new WorkletTimelineEngine(sampleRate);
  private lastReportedStateRevision = -1;
  private nextPositionReportFrame = 0;
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
      return true;
    } catch (error: unknown) {
      left.fill(0);
      right.fill(0);
      this.reportError(error);
      return false;
    }
  }

  private handleMessage(message: MainToAudioWorkletMessage): void {
    switch (message.type) {
      case "load-timeline":
        this.engine.loadTimeline(
          message.timeline,
          message.transport,
          message.sequence,
        );
        break;

      case "queue-timeline":
        this.engine.queueTimeline(
          message.timeline,
          message.transport,
          message.sequence,
        );
        this.port.postMessage({
          type: "queued-timeline-state",
          operation: message.operation,
          sequence: message.sequence,
        });
        break;

      case "clear-queued-timeline":
        this.engine.clearQueuedTimeline();
        this.port.postMessage({
          type: "queued-timeline-state",
          operation: message.operation,
          sequence: null,
        });
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
        );
        break;

      case "master-gain":
        this.engine.previewMasterGain(message.gain);
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
      type: "transport-state",
      status: this.engine.status,
      sourceId: this.engine.sourceId,
      tick: this.engine.positionTick,
      frame: currentFrame,
      sequence: this.engine.sequence,
    });
  }

  private reportError(error: unknown): void {
    this.failed = true;
    this.port.postMessage({
      type: "processor-error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

registerProcessor(PLAYBACK_PROCESSOR_NAME, PlaybackProcessor);
