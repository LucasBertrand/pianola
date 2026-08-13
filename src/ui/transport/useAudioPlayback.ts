import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getActiveClip,
  type ProjectState,
} from "../../domain/project/project-document";
import {
  type Tick,
  type InstrumentId,
} from "../../domain/identifiers";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  PlaybackStatus,
} from "../../audio/playback-model";
import {
  AudioWorkletTransport,
} from "../../audio/audio-worklet-transport";
import {
  compilePlaybackPlan,
} from "../../audio/playback-snapshot";
import {
  createClipPlaybackSource,
} from "../../audio/playback-source";
import type {
  MutableRenderSignal,
} from "../../editor/model/render-signal";
import type {
  InstrumentConfig,
} from "../../domain/instruments/instrument";

export interface UseAudioPlaybackOptions {
  readonly projectStore: ProjectStorePort;
  readonly playheadTick: MutableRenderSignal<number>;
  readonly onError: (error: unknown) => void;
}

export interface AudioPlaybackActions {
  readonly status: PlaybackStatus;
  readonly togglePlayback: () => void;
  readonly stopPlayback: () => void;
  readonly returnToStart: () => void;
  readonly seek: (tick: Tick) => void;
  readonly auditionPitch: (
    instrumentId: InstrumentId,
    pitch: number,
  ) => void;
  readonly previewInstrumentGain: (
    instrumentId: InstrumentId,
    gain: number,
  ) => void;
  readonly previewInstrumentSettings: (
    instrumentId: InstrumentId,
    config: InstrumentConfig | null,
  ) => void;
  readonly previewMasterGain: (gain: number) => void;
}

export function useAudioPlayback(
  options: UseAudioPlaybackOptions,
): AudioPlaybackActions {
  const {
    projectStore,
    playheadTick,
    onError,
  } = options;
  const onErrorRef = useRef(onError);
  const [status, setStatus] =
    useState<PlaybackStatus>("stopped");
  const transportRef = useRef<AudioWorkletTransport | null>(null);

  onErrorRef.current = onError;

  useEffect(() => {
    let transport: AudioWorkletTransport;

    try {
      const state = projectStore.getState();
      const activeClip = getActiveClip(state);
      const snapshot = compilePlaybackPlan(
        state,
        createClipPlaybackSource(activeClip),
      );

      transport = new AudioWorkletTransport(
        snapshot,
        activeClip.transportSettings,
        {
          onStatusChange(nextStatus, positionTick) {
            setStatus(nextStatus);
            playheadTick.set(positionTick);
          },
          onError(error) {
            onErrorRef.current(error);
          },
        },
        playheadTick.get(),
      );
      transportRef.current = transport;
      setStatus("stopped");
    } catch (error: unknown) {
      onErrorRef.current(error);
      return undefined;
    }

    const unsubscribe = projectStore.subscribe(
      (state, previousState) => {
        const activeClip = getActiveClip(state);

        if (
          state.masterBus.gain
          !== previousState.masterBus.gain
        ) {
          transport.previewMasterGain(state.masterBus.gain);
        }

        if (!didPlaybackStateChange(state, previousState)) {
          return;
        }

        try {
          const clipChanged =
            state.workspace.activeClipId !== previousState.workspace.activeClipId;

          transport.replacePlaybackState(
            compilePlaybackPlan(
              state,
              createClipPlaybackSource(activeClip),
            ),
            activeClip.transportSettings,
            clipChanged ? playheadTick.get() : undefined,
          );
        } catch (error: unknown) {
          transport.stop();
          onErrorRef.current(error);
        }
      },
    );

    return (): void => {
      unsubscribe();
      void transport.dispose().catch(() => {
        // Teardown errors cannot be surfaced after the UI has unmounted.
      });

      if (transportRef.current === transport) {
        transportRef.current = null;
      }
    };
  }, [
    playheadTick,
    projectStore,
  ]);

  useEffect(() => {
    const transport = transportRef.current;

    if (transport === null || status !== "playing") {
      return undefined;
    }

    let animationFrame = 0;

    const publishPosition = (): void => {
      if (transport.status !== "playing") {
        return;
      }

      playheadTick.set(transport.getPositionTick());
      animationFrame = requestAnimationFrame(publishPosition);
    };

    animationFrame = requestAnimationFrame(publishPosition);

    return (): void => {
      cancelAnimationFrame(animationFrame);
    };
  }, [
    playheadTick,
    status,
  ]);

  const togglePlayback = useCallback((): void => {
    const transport = transportRef.current;

    if (transport === null) {
      return;
    }

    if (transport.status === "playing") {
      transport.pause();
      return;
    }

    void transport.play(playheadTick.get()).catch(() => {
      // The transport reports initialization errors through onError.
    });
  }, [
    playheadTick,
  ]);

  const stopPlayback = useCallback((): void => {
    transportRef.current?.stop();
  }, []);

  const returnToStart = useCallback((): void => {
    transportRef.current?.seek(0);
  }, []);

  const seek = useCallback((tick: Tick): void => {
    transportRef.current?.seek(tick);
  }, []);

  const auditionPitch = useCallback((
    instrumentId: InstrumentId,
    pitch: number,
  ): void => {
    const transport = transportRef.current;

    if (transport === null) {
      return;
    }

    void transport.auditionPitch(instrumentId, pitch).catch((error: unknown) => {
      onErrorRef.current(error);
    });
  }, []);

  const previewInstrumentGain = useCallback((
    instrumentId: InstrumentId,
    gain: number,
  ): void => {
    try {
      transportRef.current?.previewInstrumentGain(instrumentId, gain);
    } catch (error: unknown) {
      onErrorRef.current(error);
    }
  }, []);

  const previewInstrumentSettings = useCallback((
    instrumentId: InstrumentId,
    config: InstrumentConfig | null,
  ): void => {
    try {
      transportRef.current?.replaceInstrumentPreview(instrumentId, config);
    } catch (error: unknown) {
      onErrorRef.current(error);
    }
  }, []);

  const previewMasterGain = useCallback((gain: number): void => {
    transportRef.current?.previewMasterGain(gain);
  }, []);

  return {
    status,
    togglePlayback,
    stopPlayback,
    returnToStart,
    seek,
    auditionPitch,
    previewInstrumentGain,
    previewInstrumentSettings,
    previewMasterGain,
  };
}

function didPlaybackStateChange(
  state: ProjectState,
  previousState: ProjectState,
): boolean {
  const activeClip = getActiveClip(state);
  const previousActiveClip = getActiveClip(previousState);

  if (
    state.workspace.activeClipId !== previousState.workspace.activeClipId
    || state.clock !== previousState.clock
    || activeClip.timeline !== previousActiveClip.timeline
    || activeClip.tracksByInstrumentId !== previousActiveClip.tracksByInstrumentId
    || activeClip.transportSettings !== previousActiveClip.transportSettings
    || state.instrumentPresetsById
      !== previousState.instrumentPresetsById
    || state.masterBus.muted !== previousState.masterBus.muted
    || state.masterBus.tuningFrequencyHz
      !== previousState.masterBus.tuningFrequencyHz
  ) {
    return true;
  }

  if (state.instrumentOrder !== previousState.instrumentOrder) {
    return true;
  }

  for (
    let instrumentIndex = 0;
    instrumentIndex < state.instrumentOrder.length;
    instrumentIndex += 1
  ) {
    const instrumentId = state.instrumentOrder[instrumentIndex];

    if (instrumentId === undefined) {
      continue;
    }

    const instrument = state.projectInstrumentsById[instrumentId];
    const previousInstrument = previousState.projectInstrumentsById[instrumentId];
    const instrumentState = activeClip.instrumentStatesById[instrumentId];
    const previousInstrumentState =
      previousActiveClip.instrumentStatesById[instrumentId];

    if (
      instrument === undefined
      || previousInstrument === undefined
      || instrumentState === undefined
      || previousInstrumentState === undefined
      || instrument.pan !== previousInstrument.pan
      || instrument.instrument !== previousInstrument.instrument
      || instrument.gain !== previousInstrument.gain
      || instrument.muted !== previousInstrument.muted
      || instrument.solo !== previousInstrument.solo
    ) {
      return true;
    }
  }

  return false;
}
