import type {
  AudioPlaybackPlan,
} from "../../application/audio/audio-playback-plan";
import type {
  TransportState,
} from "../../domain/transport/transport";

export interface PendingAudioWorkletTimeline {
  readonly snapshot: AudioPlaybackPlan;
  readonly transport: TransportState;
}

export interface AudioWorkletReplacementDecision {
  readonly requiresTimelineReplacement: boolean;
  readonly hadQueuedTimeline: boolean;
  readonly sequence: number;
  readonly stateVersion: number;
  readonly queueOperation: number;
}

/** Pure owner of worklet revisions, queue state and pending timeline races. */
export class AudioWorkletStateSynchronizer {
  private currentSequence = 1;
  private nextSequence = 1;
  private currentStateVersion = 1;
  private currentQueueOperation = 0;
  private queued: (PendingAudioWorkletTimeline & { readonly sequence: number }) | null = null;
  private readonly pending = new Map<number, PendingAudioWorkletTimeline>();

  public get sequence(): number {
    return this.currentSequence;
  }

  public get stateVersion(): number {
    return this.currentStateVersion;
  }

  public get queueOperation(): number {
    return this.currentQueueOperation;
  }

  public get queuedTimeline():
    (PendingAudioWorkletTimeline & { readonly sequence: number }) | null {
    return this.queued;
  }

  public beginReplacement(
    previous: AudioPlaybackPlan,
    next: AudioPlaybackPlan,
    workletReady: boolean,
  ): AudioWorkletReplacementDecision {
    const timelineReplacementRequired = requiresTimelineReplacement(previous, next);
    const hadQueuedTimeline = this.queued !== null;

    this.currentStateVersion += 1;
    if (timelineReplacementRequired) {
      this.currentSequence = ++this.nextSequence;
    }
    this.queued = null;
    if (timelineReplacementRequired || !workletReady) {
      this.pending.clear();
    }
    this.currentQueueOperation += 1;
    return {
      requiresTimelineReplacement: timelineReplacementRequired,
      hadQueuedTimeline,
      sequence: this.currentSequence,
      stateVersion: this.currentStateVersion,
      queueOperation: this.currentQueueOperation,
    };
  }

  public queueTimeline(
    snapshot: AudioPlaybackPlan,
    transport: TransportState,
    workletReady: boolean,
  ): {
    readonly sequence: number;
    readonly stateVersion: number;
    readonly operation: number;
  } {
    const sequence = ++this.nextSequence;
    const stateVersion = ++this.currentStateVersion;
    const operation = ++this.currentQueueOperation;
    this.queued = { snapshot, transport, sequence };
    if (!workletReady) {
      this.pending.clear();
    }
    this.pending.set(sequence, { snapshot, transport });
    return { sequence, stateVersion, operation };
  }

  public clearQueuedTimeline(workletReady: boolean): number {
    this.queued = null;
    const operation = ++this.currentQueueOperation;
    if (!workletReady) {
      this.pending.clear();
    }
    return operation;
  }

  public acknowledgeTimeline(sequence: number):
    | { readonly kind: "current" }
    | { readonly kind: "activate"; readonly pending: PendingAudioWorkletTimeline }
    | { readonly kind: "reject" } {
    const pending = this.pending.get(sequence);
    if (sequence > this.currentSequence && pending !== undefined) {
      this.currentSequence = sequence;
      this.queued = null;
      for (const candidate of this.pending.keys()) {
        if (candidate <= sequence) this.pending.delete(candidate);
      }
      return { kind: "activate", pending };
    }
    return sequence === this.currentSequence
      ? { kind: "current" }
      : { kind: "reject" };
  }

  public acknowledgeQueuedState(operation: number, queuedSequence: number | null): void {
    if (operation !== this.currentQueueOperation) return;
    for (const sequence of this.pending.keys()) {
      if (sequence !== queuedSequence) this.pending.delete(sequence);
    }
  }

  public clearPending(): void {
    this.pending.clear();
  }
}

export function requiresTimelineReplacement(
  previous: AudioPlaybackPlan,
  next: AudioPlaybackPlan,
): boolean {
  return previous.sourceId !== next.sourceId
    || previous.instruments.length !== next.instruments.length
    || previous.instruments.some((instrument, index) =>
      instrument.instrumentId !== next.instruments[index]?.instrumentId);
}

export function hasAudioWorkletTransportChange(
  previous: AudioPlaybackPlan,
  next: AudioPlaybackPlan,
  previousTransport: TransportState,
  nextTransport: TransportState,
): boolean {
  return previous.ppqn !== next.ppqn
    || previous.durationTicks !== next.durationTicks
    || !haveEqualNumbers(previous.tempoMap.startTicks, next.tempoMap.startTicks)
    || !haveEqualNumbers(previous.tempoMap.bpms, next.tempoMap.bpms)
    || previousTransport.loopEnabled !== nextTransport.loopEnabled
    || previousTransport.loop.startTick !== nextTransport.loop.startTick
    || previousTransport.loop.endTick !== nextTransport.loop.endTick;
}

export function haveEqualAudioWorkletEvents(
  previous: AudioPlaybackPlan["instruments"][number],
  next: AudioPlaybackPlan["instruments"][number],
): boolean {
  return haveEqualValues(previous.noteIds, next.noteIds)
    && haveEqualNumbers(previous.pitches, next.pitches)
    && haveEqualNumbers(previous.startTicks, next.startTicks)
    && haveEqualNumbers(previous.durationTicks, next.durationTicks);
}

export function haveEqualSynthConfigs(
  previous: AudioPlaybackPlan["instruments"][number]["instrument"],
  next: AudioPlaybackPlan["instruments"][number]["instrument"],
): boolean {
  return JSON.stringify(previous) === JSON.stringify(next);
}

function haveEqualValues<T>(previous: ArrayLike<T>, next: ArrayLike<T>): boolean {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) return false;
  }
  return true;
}

function haveEqualNumbers(
  previous: ArrayLike<number>,
  next: ArrayLike<number>,
): boolean {
  return haveEqualValues(previous, next);
}
