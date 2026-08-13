import type {
  InstrumentId,
} from "../domain/identifiers";
import type {
  ActiveInstrumentVoice,
} from "./instruments/instrument-renderer";
import type {
  PlaybackSnapshot,
} from "./playback-model";
import {
  setAudioParamSmoothly,
} from "./audio-param-automation";

export interface InstrumentBus {
  readonly gainNode: GainNode;
  readonly panNode: StereoPannerNode;
}

export interface InstrumentBusSynchronizationOptions {
  readonly context: AudioContext;
  readonly masterGain: GainNode;
  readonly snapshot: PlaybackSnapshot;
  readonly buses: Map<InstrumentId, InstrumentBus>;
  readonly activeVoicesByInstrumentId: Map<InstrumentId, ActiveInstrumentVoice[]>;
}

/** Reconciles the project instrument list with the shared Web Audio graph. */
export function synchronizeInstrumentBuses({
  context,
  masterGain,
  snapshot,
  buses,
  activeVoicesByInstrumentId,
}: InstrumentBusSynchronizationOptions): void {
  setAudioParamSmoothly(
    masterGain.gain,
    snapshot.masterMuted ? 0 : snapshot.masterGain,
    context.currentTime,
  );

  const retainedInstrumentIds = new Set<InstrumentId>();
  const hasSoloInstrument = snapshot.instruments.some(
    (instrument) => instrument.solo,
  );

  for (const instrument of snapshot.instruments) {
    retainedInstrumentIds.add(instrument.instrumentId);
    let instrumentBus = buses.get(instrument.instrumentId);

    if (instrumentBus === undefined) {
      const gainNode = context.createGain();
      const panNode = context.createStereoPanner();

      gainNode.connect(panNode);
      panNode.connect(masterGain);
      instrumentBus = { gainNode, panNode };
      buses.set(instrument.instrumentId, instrumentBus);
    }

    const audible =
      !instrument.muted && (!hasSoloInstrument || instrument.solo);
    setAudioParamSmoothly(
      instrumentBus.gainNode.gain,
      audible ? instrument.gain : 0,
      context.currentTime,
    );
    setAudioParamSmoothly(
      instrumentBus.panNode.pan,
      instrument.pan,
      context.currentTime,
    );
  }

  for (const [instrumentId, instrumentBus] of buses) {
    if (retainedInstrumentIds.has(instrumentId)) {
      continue;
    }

    for (const activeVoice of activeVoicesByInstrumentId.get(instrumentId) ?? []) {
      activeVoice.stop(context.currentTime);
    }

    instrumentBus.gainNode.disconnect();
    instrumentBus.panNode.disconnect();
    buses.delete(instrumentId);
    activeVoicesByInstrumentId.delete(instrumentId);
  }
}
