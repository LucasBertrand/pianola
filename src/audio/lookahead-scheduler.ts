import {
  type Tick,
  type InstrumentId,
} from "../domain/identifiers";
import {
  type TransportState,
} from "../domain/transport/transport";
import {
  AUDIO_CONSTANTS,
} from "../config/audio-config";
import type {
  AudioEnginePort,
  AudioTransportController,
  PlaybackSnapshot,
  PlaybackStatus,
} from "./playback-model";
import {
  projectTickIntoLoop,
} from "./time-math";
import {
  scheduleHeldNotesAtAnchor,
  schedulePlaybackOccurrences,
  type PlaybackOccurrenceScheduleContext,
} from "./playback-occurrence-scheduler";
import {
  assertCompatiblePlaybackState,
  clampPlaybackTick,
} from "./playback-transport-query";
import {
  DEFAULT_SCHEDULER_TIMER,
  type AudioTransportCallbacks,
  type SchedulerTimerPort,
} from "./scheduler-timer";
import {
  getCurrentUnwrappedPlaybackTick,
  getPlaybackEndAudioTime,
  playbackAudioTimeToUnwrappedTick,
  unwrappedTickToPlaybackAudioTime,
  type PlaybackTransportClock,
} from "./playback-transport-clock";
import {
  schedulePitchAudition,
} from "./pitch-audition";

export class LookaheadScheduler implements AudioTransportController {
  private currentStatus: PlaybackStatus = "stopped";
  private snapshot: PlaybackSnapshot;
  private transport: TransportState;
  private readonly engine: AudioEnginePort;
  private readonly timer: SchedulerTimerPort;
  private readonly callbacks: AudioTransportCallbacks;
  private timerHandle: number | null = null;
  private positionTick: Tick;
  private anchorUnwrappedTick: Tick;
  private anchorAudioTimeSeconds = 0;
  private scheduledThroughAudioTimeSeconds = 0;
  private generation = 0;
  private startOperationSequence = 0;
  private starting = false;
  private loopingForAnchor = false;
  private disposed = false;
  private auditionSequence = 0;

  public constructor(
    engine: AudioEnginePort,
    snapshot: PlaybackSnapshot,
    transport: TransportState,
    callbacks: AudioTransportCallbacks = {},
    timer: SchedulerTimerPort = DEFAULT_SCHEDULER_TIMER,
    initialPositionTick: Tick = transport.anchorTick,
  ) {
    assertCompatiblePlaybackState(snapshot, transport);
    this.engine = engine;
    this.snapshot = snapshot;
    this.transport = transport;
    this.callbacks = callbacks;
    this.timer = timer;
    this.positionTick = clampPlaybackTick(
      initialPositionTick,
      snapshot.durationTicks,
    );
    this.anchorUnwrappedTick = this.positionTick;
    this.engine.replacePlaybackSnapshot(snapshot);
  }

  public get status(): PlaybackStatus {
    return this.currentStatus;
  }

  public getPositionTick(): Tick {
    if (this.currentStatus !== "playing") {
      return this.positionTick;
    }

    const unwrappedTick = getCurrentUnwrappedPlaybackTick(this.getTransportClock(), this.engine.currentTimeSeconds);

    if (this.loopingForAnchor) {
      return projectTickIntoLoop(
        unwrappedTick,
        this.transport.loop,
      ).tick;
    }

    return clampPlaybackTick(
      unwrappedTick,
      this.snapshot.durationTicks,
    );
  }

  public replacePlaybackState(
    snapshot: PlaybackSnapshot,
    transport: TransportState,
    positionTickOverride?: Tick,
  ): void {
    this.assertUsable();
    assertCompatiblePlaybackState(snapshot, transport);
    this.invalidatePendingStart();
    const wasPlaying = this.currentStatus === "playing";
    const currentTick = positionTickOverride
      ?? this.getPositionTick();

    if (wasPlaying) {
      this.clearTimer();
      this.engine.cancelScheduledAfter(
        this.engine.currentTimeSeconds,
      );
    }

    this.snapshot = snapshot;
    this.transport = transport;
    this.engine.replacePlaybackSnapshot(snapshot);
    this.positionTick = clampPlaybackTick(
      currentTick,
      snapshot.durationTicks,
    );

    if (wasPlaying) {
      try {
        this.restartFromTick(this.positionTick, false, 0);
      } catch (error: unknown) {
        this.handleRuntimeError(error);
      }
    } else {
      this.emitStatus();
    }
  }

  public async play(startTick: Tick = this.positionTick): Promise<void> {
    this.assertUsable();

    if (this.currentStatus === "playing" || this.starting) {
      return;
    }

    this.starting = true;
    this.startOperationSequence += 1;
    const startOperation = this.startOperationSequence;
    const clampedStartTick = clampPlaybackTick(
      startTick,
      this.snapshot.durationTicks,
    );
    this.positionTick =
      clampedStartTick >= this.snapshot.durationTicks
        ? (
          this.transport.loopEnabled
            ? this.transport.loop.startTick
            : 0
        )
        : clampedStartTick;

    try {
      await this.engine.resume();

      if (
        this.disposed
        || startOperation !== this.startOperationSequence
      ) {
        return;
      }

      this.starting = false;
      this.currentStatus = "playing";
      this.restartFromTick(this.positionTick);
      this.emitStatus();
    } catch (error: unknown) {
      if (
        this.disposed
        || startOperation !== this.startOperationSequence
      ) {
        return;
      }

      this.starting = false;
      this.clearTimer();
      this.engine.cancelAll(this.engine.currentTimeSeconds);
      this.currentStatus = "stopped";
      this.emitStatus();
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  public pause(): void {
    this.finishPlaybackChange("paused");
  }

  public stop(): void {
    this.finishPlaybackChange("stopped");
  }

  public seek(tick: Tick): void {
    this.assertUsable();
    this.invalidatePendingStart();
    const nextTick = clampPlaybackTick(tick, this.snapshot.durationTicks);

    if (this.currentStatus === "playing") {
      this.engine.cancelAll(this.engine.currentTimeSeconds);
      this.clearTimer();
      this.positionTick = nextTick;

      try {
        this.restartFromTick(nextTick);
      } catch (error: unknown) {
        this.handleRuntimeError(error);
        return;
      }
    } else {
      this.positionTick = nextTick;
    }

    this.emitStatus();
  }

  public previewMasterGain(gain: number): void {
    this.assertUsable();
    this.engine.configure({
      ...this.engine.config,
      masterGain: gain,
    });
  }

  public previewInstrumentGain(
    instrumentId: InstrumentId,
    gain: number,
  ): void {
    this.assertUsable();
    this.engine.previewInstrumentGain(instrumentId, gain);
  }

  public async auditionPitch(
    instrumentId: InstrumentId,
    pitch: number,
  ): Promise<void> {
    this.assertUsable();

    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
      throw new RangeError("Audition pitch must be between 0 and 127.");
    }

    this.auditionSequence += 1;
    await schedulePitchAudition(
      this.engine,
      this.snapshot,
      instrumentId,
      pitch,
      `audition:${this.auditionSequence}:${instrumentId}:${pitch}`,
      this.generation,
      () => this.assertUsable(),
    );
  }

  public pulse(): void {
    if (
      this.disposed
      || this.currentStatus !== "playing"
    ) {
      return;
    }

    try {
      this.scheduleNextWindow();
    } catch (error: unknown) {
      this.handleRuntimeError(error);
      return;
    }

    if (this.currentStatus === "playing") {
      this.armTimer();
    }
  }

  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.clearTimer();
    this.invalidatePendingStart();
    this.engine.cancelAll(this.engine.currentTimeSeconds);
    this.currentStatus = "stopped";
    this.disposed = true;
    await this.engine.dispose();
  }

  private restartFromTick(
    tick: Tick,
    includeHeldNotes = true,
    restartLeadSeconds?: number,
  ): void {
    this.generation += 1;
    this.positionTick = clampPlaybackTick(
      tick,
      this.snapshot.durationTicks,
    );
    this.anchorUnwrappedTick = this.positionTick;
    this.loopingForAnchor =
      this.transport.loopEnabled
      && this.positionTick <= this.transport.loop.endTick;
    this.anchorAudioTimeSeconds =
      this.engine.currentTimeSeconds
      + (
        restartLeadSeconds
        ?? Math.max(
          AUDIO_CONSTANTS.minimumRestartLeadSeconds,
          this.engine.config.latencyCompensationSeconds,
        )
      );
    this.scheduledThroughAudioTimeSeconds =
      this.anchorAudioTimeSeconds;

    if (includeHeldNotes) {
      scheduleHeldNotesAtAnchor(this.getOccurrenceScheduleContext());
    }
    this.scheduleNextWindow();

    if (this.currentStatus === "playing") {
      this.armTimer();
    }
  }

  private scheduleNextWindow(): void {
    const currentAudioTimeSeconds = this.engine.currentTimeSeconds;

    if (
      !this.loopingForAnchor
      && currentAudioTimeSeconds
        >= getPlaybackEndAudioTime(this.getTransportClock())
    ) {
      this.completeAtProjectEnd();
      return;
    }

    if (
      currentAudioTimeSeconds
      - this.scheduledThroughAudioTimeSeconds
      > this.engine.config.lateEventToleranceSeconds
    ) {
      this.scheduledThroughAudioTimeSeconds =
        currentAudioTimeSeconds;
    }

    const windowStartAudioTimeSeconds = Math.max(
      this.anchorAudioTimeSeconds,
      this.scheduledThroughAudioTimeSeconds,
    );
    let windowEndAudioTimeSeconds =
      currentAudioTimeSeconds
      + this.engine.config.scheduleAheadSeconds;

    if (!this.loopingForAnchor) {
      windowEndAudioTimeSeconds = Math.min(
        windowEndAudioTimeSeconds,
        getPlaybackEndAudioTime(this.getTransportClock()),
      );
    }

    if (
      windowEndAudioTimeSeconds
      <= windowStartAudioTimeSeconds
    ) {
      return;
    }

    const windowStartTick =
      playbackAudioTimeToUnwrappedTick(this.getTransportClock(),
        windowStartAudioTimeSeconds,
      );
    const windowEndTick =
      playbackAudioTimeToUnwrappedTick(this.getTransportClock(),
        windowEndAudioTimeSeconds,
      );

    schedulePlaybackOccurrences(
      this.getOccurrenceScheduleContext(),
      windowStartTick,
      windowEndTick,
    );
    this.scheduledThroughAudioTimeSeconds =
      windowEndAudioTimeSeconds;
  }

  private getOccurrenceScheduleContext(): PlaybackOccurrenceScheduleContext {
    return {
      engine: this.engine,
      snapshot: this.snapshot,
      transport: this.transport,
      generation: this.generation,
      loopingForAnchor: this.loopingForAnchor,
      positionTick: this.positionTick,
      anchorAudioTimeSeconds: this.anchorAudioTimeSeconds,
      unwrappedTickToAudioTime: (tick) => (
        unwrappedTickToPlaybackAudioTime(this.getTransportClock(), tick)
      ),
    };
  }
  private finishPlaybackChange(status: PlaybackStatus): void {
    this.assertUsable();
    const wasStarting = this.starting;

    this.invalidatePendingStart();

    if (this.currentStatus === "playing") {
      this.positionTick = this.getPositionTick();
      this.engine.cancelAll(this.engine.currentTimeSeconds);
    }

    this.clearTimer();

    if (
      status !== "paused"
      || wasStarting
      || this.currentStatus !== "stopped"
    ) {
      this.currentStatus = status;
    }

    this.emitStatus();
  }

  private completeAtProjectEnd(): void {
    this.clearTimer();
    this.positionTick = this.snapshot.durationTicks;
    this.currentStatus = "stopped";
    this.emitStatus();
  }

  private getTransportClock(): PlaybackTransportClock {
    return {
      snapshot: this.snapshot,
      anchorUnwrappedTick: this.anchorUnwrappedTick,
      anchorAudioTimeSeconds: this.anchorAudioTimeSeconds,
    };
  }
  private armTimer(): void {
    if (this.timerHandle !== null) {
      return;
    }

    this.timerHandle = this.timer.setTimeout(() => {
      this.timerHandle = null;
      this.pulse();
    }, this.engine.config.schedulerPulseIntervalMs);
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      this.timer.clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private handleRuntimeError(error: unknown): void {
    this.positionTick = this.getPositionTick();
    this.clearTimer();
    this.engine.cancelAll(this.engine.currentTimeSeconds);
    this.currentStatus = "stopped";
    this.emitStatus();
    this.callbacks.onError?.(error);
  }

  private invalidatePendingStart(): void {
    this.startOperationSequence += 1;
    this.starting = false;
  }

  private emitStatus(): void {
    this.callbacks.onStatusChange?.(
      this.currentStatus,
      this.getPositionTick(),
    );
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("The audio scheduler has been disposed.");
    }
  }
}
