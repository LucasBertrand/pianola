import {
  projectSynthRuntimeConfig,
} from "../synth/project-synth-runtime-config";
import type {
  AudioPlaybackPlan,
} from "../../../application/audio/audio-playback-plan";
import type {
  AudioWorkletTimeline,
  AudioWorkletTimelineInstrument,
} from "./audio-worklet-protocol";

export interface TransferableAudioWorkletTimeline {
  readonly timeline: AudioWorkletTimeline;
  readonly transfers: Transferable[];
}

export interface TransferableInstrumentEvents {
  readonly events: Pick<AudioWorkletTimelineInstrument,
    "noteIds" | "pitches" | "startTicks" | "durationTicks"
    | "maximumEndTickTree" | "endTickTreeLeafCount">;
  readonly transfers: Transferable[];
}

export function createTransferableInstrumentEvents(
  instrument: AudioPlaybackPlan["instruments"][number],
): TransferableInstrumentEvents {
  const pitches = new Uint8Array(instrument.pitches);
  const startTicks = new Float64Array(instrument.startTicks);
  const durationTicks = new Float64Array(instrument.durationTicks);
  const heldNoteIndex = createMaximumEndTickTree(startTicks, durationTicks);

  return {
    events: {
      noteIds: instrument.noteIds.slice(),
      pitches,
      startTicks,
      durationTicks,
      maximumEndTickTree: heldNoteIndex.maximumEndTickTree,
      endTickTreeLeafCount: heldNoteIndex.leafCount,
    },
    transfers: [pitches.buffer, startTicks.buffer, durationTicks.buffer,
      heldNoteIndex.maximumEndTickTree.buffer],
  };
}

/** Keeps stable event identity and clones numeric arrays for zero-copy transfer. */
export function createTransferableAudioWorkletTimeline(
  snapshot: AudioPlaybackPlan,
): TransferableAudioWorkletTimeline {
  const transfers: Transferable[] = [];
  const cloneFloat64Array = (value: Float64Array): Float64Array => {
    const cloned = new Float64Array(value);

    transfers.push(cloned.buffer);
    return cloned;
  };
  const cloneUint8Array = (value: Uint8Array): Uint8Array => {
    const cloned = new Uint8Array(value);

    transfers.push(cloned.buffer);
    return cloned;
  };
  const instruments: AudioWorkletTimelineInstrument[] =
    snapshot.instruments.map((instrument) => {
      const heldNoteIndex = createMaximumEndTickTree(
        instrument.startTicks,
        instrument.durationTicks,
      );

      transfers.push(heldNoteIndex.maximumEndTickTree.buffer);
      return {
        instrumentId: instrument.instrumentId,
        noteIds: instrument.noteIds.slice(),
        pitches: cloneUint8Array(instrument.pitches),
        startTicks: cloneFloat64Array(instrument.startTicks),
        durationTicks: cloneFloat64Array(instrument.durationTicks),
        maximumEndTickTree: heldNoteIndex.maximumEndTickTree,
        endTickTreeLeafCount: heldNoteIndex.leafCount,
        gain: instrument.gain,
        pan: instrument.pan,
        muted: instrument.muted,
        solo: instrument.solo,
        instrument: projectSynthRuntimeConfig(instrument.instrument),
      };
    });

  return {
    timeline: {
      sourceId: snapshot.sourceId,
      ppqn: snapshot.ppqn,
      durationTicks: snapshot.durationTicks,
      masterGain: snapshot.masterGain,
      masterMuted: snapshot.masterMuted,
      masterTuningFrequencyHz: snapshot.masterTuningFrequencyHz,
      tempoStartTicks: cloneFloat64Array(snapshot.tempoMap.startTicks),
      tempoBpms: cloneFloat64Array(snapshot.tempoMap.bpms),
      instruments,
    },
    transfers,
  };
}

function createMaximumEndTickTree(
  startTicks: Float64Array,
  durationTicks: Float64Array,
): {
  readonly maximumEndTickTree: Float64Array;
  readonly leafCount: number;
} {
  if (startTicks.length === 0) {
    return {
      maximumEndTickTree: new Float64Array(0),
      leafCount: 0,
    };
  }

  let leafCount = 1;

  while (leafCount < startTicks.length) {
    leafCount *= 2;
  }

  const tree = new Float64Array(leafCount * 2);

  tree.fill(Number.NEGATIVE_INFINITY);

  for (let noteIndex = 0; noteIndex < startTicks.length; noteIndex += 1) {
    tree[leafCount + noteIndex] = (
      startTicks[noteIndex] ?? 0
    ) + (durationTicks[noteIndex] ?? 0);
  }

  for (let nodeIndex = leafCount - 1; nodeIndex > 0; nodeIndex -= 1) {
    tree[nodeIndex] = Math.max(
      tree[nodeIndex * 2] ?? Number.NEGATIVE_INFINITY,
      tree[nodeIndex * 2 + 1] ?? Number.NEGATIVE_INFINITY,
    );
  }

  return {
    maximumEndTickTree: tree,
    leafCount,
  };
}
