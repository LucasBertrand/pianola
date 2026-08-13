import type {
  AudioEnginePort,
  PlaybackSnapshot,
  ScheduledNoteEvent,
} from "../../src/audio/playback-model";
import {
  type SchedulerTimerPort,
} from "../../src/audio/scheduler-timer";
import {
  DEFAULT_AUDIO_ENGINE_CONFIG,
} from "../../src/audio/default-audio-engine-config";
import {
  type AudioEngineConfig,
} from "../../src/audio/audio-engine-config";
import {
  type InstrumentId,
} from "../../src/domain/identifiers";

export class FakeAudioEngine implements AudioEnginePort {
  public config: AudioEngineConfig;
  public currentTimeSeconds = 0;
  public readonly cancelledAt: number[] = [];
  public readonly cancelledFutureAt: number[] = [];
  public readonly configurations: AudioEngineConfig[] = [];
  public readonly events: ScheduledNoteEvent[] = [];
  public readonly instrumentGainPreviews: Array<{
    readonly instrumentId: InstrumentId;
    readonly gain: number;
  }> = [];
  public readonly instrumentSettingsPreviews: Array<
    PlaybackSnapshot["instruments"][number]
  > = [];
  public readonly snapshots: PlaybackSnapshot[] = [];
  public resumeGate: Promise<void> | null = null;
  public resumeCount = 0;
  public scheduleFailureAfterEventCount: number | null = null;
  public disposed = false;

  public constructor(configChanges: Partial<AudioEngineConfig> = {}) {
    this.config = {
      ...DEFAULT_AUDIO_ENGINE_CONFIG,
      latencyCompensationSeconds: 0,
      ...configChanges,
    };
  }

  public configure(config: AudioEngineConfig): void {
    this.config = config;
    this.configurations.push(config);
  }

  public replacePlaybackSnapshot(snapshot: PlaybackSnapshot): void {
    this.snapshots.push(snapshot);
  }

  public async resume(): Promise<void> {
    this.resumeCount += 1;

    if (this.resumeGate !== null) {
      await this.resumeGate;
    }
  }

  public scheduleNote(event: ScheduledNoteEvent): void {
    if (
      this.scheduleFailureAfterEventCount !== null
      && this.events.length >= this.scheduleFailureAfterEventCount
    ) {
      throw new Error("Synthetic scheduling failure.");
    }

    this.events.push(event);
  }

  public previewInstrumentGain(instrumentId: InstrumentId, gain: number): void {
    this.instrumentGainPreviews.push({ instrumentId, gain });
  }

  public previewInstrumentSettings(
    instrument: PlaybackSnapshot["instruments"][number],
  ): void {
    this.instrumentSettingsPreviews.push(instrument);
  }

  public cancelScheduledAfter(atAudioTimeSeconds: number): void {
    this.cancelledFutureAt.push(atAudioTimeSeconds);
  }

  public cancelAll(atAudioTimeSeconds: number): void {
    this.cancelledAt.push(atAudioTimeSeconds);
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
  }
}

export class FakeSchedulerTimer implements SchedulerTimerPort {
  private nextHandle = 1;
  public readonly entries = new Map<number, {
    readonly callback: () => void;
    readonly delayMilliseconds: number;
  }>();

  public setTimeout(callback: () => void, delayMilliseconds: number): number {
    const handle = this.nextHandle;

    this.nextHandle += 1;
    this.entries.set(handle, { callback, delayMilliseconds });
    return handle;
  }

  public clearTimeout(handle: number): void {
    this.entries.delete(handle);
  }

  public get pendingCount(): number {
    return this.entries.size;
  }
}
