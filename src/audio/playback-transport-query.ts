import type {
  InstrumentId,
  Tick,
} from "../domain/identifiers";
import type {
  TransportState,
} from "../domain/transport/transport";
import type {
  PlaybackInstrumentSnapshot,
  PlaybackSnapshot,
} from "./playback-model";

export function findPlaybackInstrument(
  snapshot: PlaybackSnapshot,
  instrumentId: InstrumentId,
): PlaybackInstrumentSnapshot | undefined {
  return snapshot.instruments.find(
    (instrument) => instrument.instrumentId === instrumentId,
  );
}

export function getPlaybackBpm(snapshot: PlaybackSnapshot): number {
  const bpm = snapshot.tempoMap.bpms[0];

  if (bpm === undefined) {
    throw new RangeError("The playback snapshot has no tempo.");
  }

  return bpm;
}

export function assertCompatiblePlaybackState(
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

export function clampPlaybackTick(
  tick: number,
  durationTicks: number,
): Tick {
  if (!Number.isFinite(tick)) {
    throw new RangeError("Playback position must be finite.");
  }

  return Math.min(durationTicks, Math.max(0, tick));
}
