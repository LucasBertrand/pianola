import type {
  AudioEngineConfig,
  Tick,
  TransportState,
  InstrumentId,
} from "../domain/model";
import {
  AUDIO_CONSTANTS,
} from "../config/audio-config";
import {
  PROJECT_CONSTANTS,
} from "../config/domain-limits";
import {
  MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
} from "../domain/model";
import type {
  AudioEnginePort,
  AudioTransportController,
  PlaybackSnapshot,
  PlaybackStatus,
  PlaybackInstrumentSnapshot,
} from "./playback-model";
import {
  projectTickIntoLoop,
  secondsToTickDelta,
  tickDeltaToSeconds,
} from "./time-math";

export const DEFAULT_AUDIO_ENGINE_CONFIG: AudioEngineConfig =
  Object.freeze({
    latencyHint: AUDIO_CONSTANTS.latencyHint,
    schedulerPulseIntervalMs:
      AUDIO_CONSTANTS.schedulerPulseIntervalMs,
    scheduleAheadSeconds:
      AUDIO_CONSTANTS.scheduleAheadSeconds,
    lateEventToleranceSeconds:
      AUDIO_CONSTANTS.lateEventToleranceSeconds,
    latencyCompensationSeconds:
      AUDIO_CONSTANTS.latencyCompensationSeconds,
    masterGain: PROJECT_CONSTANTS.defaultMasterGain,
    maximumRendererPolyphony:
      MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
    releaseTailSeconds: AUDIO_CONSTANTS.releaseTailSeconds,
  });

export interface SchedulerTimerPort {
  setTimeout(callback: () => void, delayMilliseconds: number): number;
  clearTimeout(handle: number): void;
}

export interface AudioTransportCallbacks {
  readonly onStatusChange?: (
    status: PlaybackStatus,
    positionTick: Tick,
  ) => void;
  readonly onError?: (error: unknown) => void;
}

const DEFAULT_SCHEDULER_TIMER: SchedulerTimerPort = {
  setTimeout(callback, delayMilliseconds) {
    const handle = globalThis.setTimeout(callback, delayMilliseconds);

    return typeof handle === "number" ? handle : Number(handle);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle);
  },
};

const SCHEDULING_EPSILON_TICKS = 1e-7;

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
    this.positionTick = clampTick(
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

    const unwrappedTick = this.getCurrentUnwrappedTick();

    if (this.loopingForAnchor) {
      return projectTickIntoLoop(
        unwrappedTick,
        this.transport.loop,
      ).tick;
    }

    return clampTick(
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
    this.positionTick = clampTick(
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
    const clampedStartTick = clampTick(
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
    const nextTick = clampTick(tick, this.snapshot.durationTicks);

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

    const instrument = findPlaybackInstrument(this.snapshot, instrumentId);

    if (instrument === undefined) {
      throw new Error(`Project instrument "${instrumentId}" is unavailable for audition.`);
    }

    await this.engine.resume();
    this.assertUsable();
    this.auditionSequence += 1;
    const startAudioTimeSeconds = this.engine.currentTimeSeconds;

    this.engine.scheduleNote({
      occurrenceId:
        `audition:${this.auditionSequence}:${instrumentId}:${pitch}`,
      generation: this.generation,
      instrument,
      pitch,
      velocity: AUDIO_CONSTANTS.auditionNoteVelocity,
      startAudioTimeSeconds,
      endAudioTimeSeconds:
        startAudioTimeSeconds
        + AUDIO_CONSTANTS.auditionNoteDurationSeconds,
    });
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
    this.positionTick = clampTick(
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
      this.scheduleHeldNotesAtAnchor();
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
        >= this.getProjectEndAudioTimeSeconds()
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
        this.getProjectEndAudioTimeSeconds(),
      );
    }

    if (
      windowEndAudioTimeSeconds
      <= windowStartAudioTimeSeconds
    ) {
      return;
    }

    const windowStartTick =
      this.audioTimeToUnwrappedTick(
        windowStartAudioTimeSeconds,
      );
    const windowEndTick =
      this.audioTimeToUnwrappedTick(
        windowEndAudioTimeSeconds,
      );

    this.scheduleUnwrappedRange(
      windowStartTick,
      windowEndTick,
    );
    this.scheduledThroughAudioTimeSeconds =
      windowEndAudioTimeSeconds;
  }

  private scheduleUnwrappedRange(
    startUnwrappedTick: number,
    endUnwrappedTick: number,
  ): void {
    if (endUnwrappedTick <= startUnwrappedTick) {
      return;
    }

    if (!this.loopingForAnchor) {
      this.scheduleProjectRange(
        Math.max(0, startUnwrappedTick),
        Math.min(this.snapshot.durationTicks, endUnwrappedTick),
        0,
        this.snapshot.durationTicks,
        0,
      );
      return;
    }

    const loop = this.transport.loop;
    const loopDurationTicks = loop.endTick - loop.startTick;
    let cursor = startUnwrappedTick;

    while (cursor < endUnwrappedTick - SCHEDULING_EPSILON_TICKS) {
      if (cursor < loop.endTick) {
        const segmentEnd = Math.min(
          endUnwrappedTick,
          loop.endTick,
        );

        this.scheduleProjectRange(
          cursor,
          segmentEnd,
          0,
          loop.endTick,
          0,
        );
        cursor = segmentEnd;
        continue;
      }

      const cycleIndex = Math.floor(
        (cursor - loop.endTick) / loopDurationTicks,
      );
      const cycleStartUnwrappedTick =
        loop.endTick + cycleIndex * loopDurationTicks;
      const segmentEndUnwrappedTick = Math.min(
        endUnwrappedTick,
        cycleStartUnwrappedTick + loopDurationTicks,
      );
      const projectStartTick =
        loop.startTick
        + cursor - cycleStartUnwrappedTick;
      const projectEndTick =
        loop.startTick
        + segmentEndUnwrappedTick
        - cycleStartUnwrappedTick;
      const unwrappedOffsetTicks =
        cycleStartUnwrappedTick - loop.startTick;

      this.scheduleProjectRange(
        projectStartTick,
        projectEndTick,
        unwrappedOffsetTicks,
        cycleStartUnwrappedTick + loopDurationTicks,
        cycleIndex + 1,
      );
      cursor = segmentEndUnwrappedTick;
    }
  }

  private scheduleProjectRange(
    projectStartTick: number,
    projectEndTick: number,
    unwrappedOffsetTicks: number,
    boundaryUnwrappedTick: number,
    loopIteration: number,
  ): void {
    if (projectEndTick <= projectStartTick) {
      return;
    }

    const hasSoloInstrument = snapshotHasSoloInstrument(this.snapshot);

    for (
      let instrumentIndex = 0;
      instrumentIndex < this.snapshot.instruments.length;
      instrumentIndex += 1
    ) {
      const instrument = this.snapshot.instruments[instrumentIndex];

      if (
        instrument === undefined
        || !isInstrumentAudible(instrument, hasSoloInstrument)
      ) {
        continue;
      }

      let noteIndex = lowerBound(
        instrument.startTicks,
        projectStartTick,
      );

      while (noteIndex < instrument.startTicks.length) {
        const noteStartTick = instrument.startTicks[noteIndex];

        if (
          noteStartTick === undefined
          || noteStartTick >= projectEndTick
        ) {
          break;
        }

        const durationTicks = instrument.durationTicks[noteIndex];
        const pitch = instrument.pitches[noteIndex];
        const velocity = instrument.velocities[noteIndex];
        const noteId = instrument.noteIds[noteIndex];

        if (
          durationTicks !== undefined
          && pitch !== undefined
          && velocity !== undefined
          && noteId !== undefined
        ) {
          const startUnwrappedTick =
            noteStartTick + unwrappedOffsetTicks;
          const endUnwrappedTick = Math.min(
            boundaryUnwrappedTick,
            startUnwrappedTick + durationTicks,
          );

          if (endUnwrappedTick > startUnwrappedTick) {
            this.engine.scheduleNote({
              occurrenceId:
                `${this.generation}:${loopIteration}:${instrument.instrumentId}:${noteId}`,
              generation: this.generation,
              instrument,
              pitch,
              velocity,
              startAudioTimeSeconds:
                this.unwrappedTickToAudioTime(
                  startUnwrappedTick,
                ),
              endAudioTimeSeconds:
                this.unwrappedTickToAudioTime(
                  endUnwrappedTick,
                ),
            });
          }
        }

        noteIndex += 1;
      }
    }
  }

  private scheduleHeldNotesAtAnchor(): void {
    const anchorTick = this.positionTick;

    if (
      anchorTick <= 0
      || anchorTick >= this.snapshot.durationTicks
    ) {
      return;
    }

    const hasSoloInstrument = snapshotHasSoloInstrument(this.snapshot);
    const boundaryTick = this.loopingForAnchor
      ? this.transport.loop.endTick
      : this.snapshot.durationTicks;
    const minimumStartTick =
      this.loopingForAnchor
      && anchorTick >= this.transport.loop.startTick
        ? this.transport.loop.startTick
        : 0;

    for (
      let instrumentIndex = 0;
      instrumentIndex < this.snapshot.instruments.length;
      instrumentIndex += 1
    ) {
      const instrument = this.snapshot.instruments[instrumentIndex];

      if (
        instrument === undefined
        || !isInstrumentAudible(instrument, hasSoloInstrument)
      ) {
        continue;
      }

      const endIndex = lowerBound(
        instrument.startTicks,
        anchorTick,
      );

      for (
        let noteIndex = 0;
        noteIndex < endIndex;
        noteIndex += 1
      ) {
        const noteStartTick = instrument.startTicks[noteIndex];
        const durationTicks = instrument.durationTicks[noteIndex];
        const pitch = instrument.pitches[noteIndex];
        const velocity = instrument.velocities[noteIndex];
        const noteId = instrument.noteIds[noteIndex];

        if (
          noteStartTick === undefined
          || durationTicks === undefined
          || pitch === undefined
          || velocity === undefined
          || noteId === undefined
          || noteStartTick < minimumStartTick
          || noteStartTick + durationTicks <= anchorTick
        ) {
          continue;
        }

        const endTick = Math.min(
          boundaryTick,
          noteStartTick + durationTicks,
        );

        if (endTick <= anchorTick) {
          continue;
        }

        this.engine.scheduleNote({
          occurrenceId:
            `${this.generation}:held:${instrument.instrumentId}:${noteId}`,
          generation: this.generation,
          instrument,
          pitch,
          velocity,
          startAudioTimeSeconds: this.anchorAudioTimeSeconds,
          endAudioTimeSeconds:
            this.unwrappedTickToAudioTime(endTick),
        });
      }
    }
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

  private getCurrentUnwrappedTick(): number {
    const elapsedSeconds = Math.max(
      0,
      this.engine.currentTimeSeconds
      - this.anchorAudioTimeSeconds,
    );

    return (
      this.anchorUnwrappedTick
      + secondsToTickDelta(
        elapsedSeconds,
        getPlaybackBpm(this.snapshot),
        this.snapshot.ppqn,
      )
    );
  }

  private audioTimeToUnwrappedTick(
    audioTimeSeconds: number,
  ): number {
    return (
      this.anchorUnwrappedTick
      + secondsToTickDelta(
        audioTimeSeconds - this.anchorAudioTimeSeconds,
        getPlaybackBpm(this.snapshot),
        this.snapshot.ppqn,
      )
    );
  }

  private unwrappedTickToAudioTime(
    unwrappedTick: number,
  ): number {
    return (
      this.anchorAudioTimeSeconds
      + tickDeltaToSeconds(
        unwrappedTick - this.anchorUnwrappedTick,
        getPlaybackBpm(this.snapshot),
        this.snapshot.ppqn,
      )
    );
  }

  private getProjectEndAudioTimeSeconds(): number {
    return this.unwrappedTickToAudioTime(
      this.snapshot.durationTicks,
    );
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

function lowerBound(values: Float64Array, target: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const middle = low + ((high - low) >> 1);
    const value = values[middle];

    if (value !== undefined && value < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function snapshotHasSoloInstrument(snapshot: PlaybackSnapshot): boolean {
  for (
    let instrumentIndex = 0;
    instrumentIndex < snapshot.instruments.length;
    instrumentIndex += 1
  ) {
    if (snapshot.instruments[instrumentIndex]?.solo === true) {
      return true;
    }
  }

  return false;
}

function findPlaybackInstrument(
  snapshot: PlaybackSnapshot,
  instrumentId: InstrumentId,
): PlaybackInstrumentSnapshot | undefined {
  for (
    let instrumentIndex = 0;
    instrumentIndex < snapshot.instruments.length;
    instrumentIndex += 1
  ) {
    const instrument = snapshot.instruments[instrumentIndex];

    if (instrument?.instrumentId === instrumentId) {
      return instrument;
    }
  }

  return undefined;
}

function isInstrumentAudible(
  instrument: PlaybackInstrumentSnapshot,
  hasSoloInstrument: boolean,
): boolean {
  return !instrument.muted && (!hasSoloInstrument || instrument.solo);
}

function getPlaybackBpm(snapshot: PlaybackSnapshot): number {
  const bpm = snapshot.tempoMap.bpms[0];

  if (bpm === undefined) {
    throw new RangeError("The playback snapshot has no tempo.");
  }

  return bpm;
}

function assertCompatiblePlaybackState(
  snapshot: PlaybackSnapshot,
  transport: TransportState,
): void {
  if (
    snapshot.ppqn <= 0
    || snapshot.tempoMap.bpms.length !== 1
    || (snapshot.tempoMap.bpms[0] ?? 0) <= 0
    || transport.loop.startTick < 0
    || transport.loop.endTick <= transport.loop.startTick
    || transport.loop.endTick > snapshot.durationTicks
  ) {
    throw new RangeError(
      "Playback snapshot and transport settings are incompatible.",
    );
  }
}

function clampTick(tick: number, durationTicks: number): Tick {
  if (!Number.isFinite(tick)) {
    throw new RangeError("Playback position must be finite.");
  }

  return Math.min(durationTicks, Math.max(0, tick));
}
