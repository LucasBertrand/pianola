import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getClip,
  type ProjectState,
} from "../../domain/project/project-document";
import {
  type ClipId,
  type Tick,
  type InstrumentId,
} from "../../domain/identifiers";
import {
  getAutoAdvanceTargetClipId,
} from "../../domain/transport/clip-playback-sequence";
import {
  resolvePlaybackStartTick,
} from "../../domain/transport/transport";
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
  PlayheadPosition,
} from "../../editor/model/playhead-position";
import type {
  InstrumentConfig,
} from "../../domain/instruments/instrument";

export interface UseAudioPlaybackOptions {
  readonly projectStore: ProjectStorePort;
  readonly playheadPosition: MutableRenderSignal<PlayheadPosition>;
  readonly onError: (error: unknown) => void;
}

export interface AudioPlaybackActions {
  readonly status: PlaybackStatus;
  readonly playingClipId: ClipId | null;
  readonly togglePlayback: () => void;
  readonly toggleClipPlayback: (clipId: ClipId) => void;
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

/** Owns the audio transport and keeps it aligned with the single playhead. */
export function useAudioPlayback(
  options: UseAudioPlaybackOptions,
): AudioPlaybackActions {
  const {
    projectStore,
    playheadPosition,
    onError,
  } = options;
  const onErrorRef = useRef(onError);
  const [status, setStatus] = useState<PlaybackStatus>("stopped");
  const [playingClipId, setPlayingClipIdState] =
    useState<ClipId | null>(null);
  const transportRef = useRef<AudioWorkletTransport | null>(null);
  const loadedClipIdRef = useRef<ClipId | null>(null);
  const playingClipIdRef = useRef<ClipId | null>(null);
  const allowAutoAdvanceRef = useRef(true);

  onErrorRef.current = onError;

  const publishPlayingClipId = useCallback((clipId: ClipId | null): void => {
    playingClipIdRef.current = clipId;
    setPlayingClipIdState(clipId);
  }, []);

  const publishPlayhead = useCallback((clipId: ClipId, tick: Tick): void => {
    const current = playheadPosition.get();

    if (current.clipId !== clipId || current.tick !== tick) {
      playheadPosition.set({ clipId, tick });
    }
  }, [playheadPosition]);

  const playTransport = useCallback((
    transport: AudioWorkletTransport,
    clipId: ClipId,
    startTick: Tick,
  ): void => {
    void transport.play(startTick).catch(() => {
      if (
        transport.status === "stopped"
        && playingClipIdRef.current === clipId
      ) {
        publishPlayingClipId(null);
        setStatus("stopped");
      }
    });
  }, [publishPlayingClipId]);

  useEffect(() => {
    let transport: AudioWorkletTransport;

    try {
      const state = projectStore.getState();
      const initialPosition = normalizePlayheadPosition(
        state,
        playheadPosition.get(),
      );
      const initialClip = getClip(state, initialPosition.clipId);

      publishPlayhead(initialPosition.clipId, initialPosition.tick);
      transport = new AudioWorkletTransport(
        compilePlaybackPlan(
          state,
          createClipPlaybackSource(initialClip),
        ),
        initialClip.transportSettings,
        {
          onStatusChange(nextStatus, positionTick) {
            const completedClipId = loadedClipIdRef.current;

            if (completedClipId !== null) {
              publishPlayhead(completedClipId, positionTick);
            }

            if (
              nextStatus === "stopped"
              && completedClipId !== null
              && allowAutoAdvanceRef.current
            ) {
              const latestState = projectStore.getState();
              const completedClip = latestState.clipsById[completedClipId];
              const completedNaturally = completedClip !== undefined
                && positionTick >= completedClip.timeline.durationTicks;
              const nextClipId = completedNaturally
                ? getAutoAdvanceTargetClipId(latestState, completedClipId)
                : null;

              if (nextClipId !== null) {
                try {
                  replaceTransportClip(
                    transport,
                    latestState,
                    nextClipId,
                    0,
                  );
                  loadedClipIdRef.current = nextClipId;
                  publishPlayhead(nextClipId, 0);
                  publishPlayingClipId(nextClipId);
                  setStatus("playing");
                  playTransport(transport, nextClipId, 0);
                  return;
                } catch (error: unknown) {
                  publishPlayingClipId(null);
                  setStatus("stopped");
                  onErrorRef.current(error);
                  return;
                }
              }
            }

            if (nextStatus === "stopped") {
              publishPlayingClipId(null);
            } else if (completedClipId !== null) {
              publishPlayingClipId(completedClipId);
            }

            setStatus(nextStatus);
          },
          onError(error) {
            onErrorRef.current(error);
          },
        },
        initialPosition.tick,
      );
      transportRef.current = transport;
      loadedClipIdRef.current = initialClip.id;
      setStatus("stopped");
    } catch (error: unknown) {
      onErrorRef.current(error);
      return undefined;
    }

    const unsubscribe = projectStore.subscribe((state, previousState) => {
      if (state.masterBus.gain !== previousState.masterBus.gain) {
        transport.previewMasterGain(state.masterBus.gain);
      }

      if (
        loadedClipIdRef.current !== null
        && state.clipsById[loadedClipIdRef.current] === undefined
      ) {
        allowAutoAdvanceRef.current = false;
        transport.stop();
        allowAutoAdvanceRef.current = true;
        publishPlayingClipId(null);
        setStatus("stopped");
      }

      const sourcePosition = normalizePlayheadPosition(
        state,
        playheadPosition.get(),
      );
      publishPlayhead(sourcePosition.clipId, sourcePosition.tick);

      if (
        loadedClipIdRef.current === sourcePosition.clipId
        && !didPlaybackStateChange(
          state,
          previousState,
          sourcePosition.clipId,
        )
      ) {
        return;
      }

      try {
        const sourceChanged = loadedClipIdRef.current
          !== sourcePosition.clipId;
        replaceTransportClip(
          transport,
          state,
          sourcePosition.clipId,
          sourceChanged ? sourcePosition.tick : undefined,
        );
        loadedClipIdRef.current = sourcePosition.clipId;
      } catch (error: unknown) {
        allowAutoAdvanceRef.current = false;
        transport.stop();
        allowAutoAdvanceRef.current = true;
        publishPlayingClipId(null);
        setStatus("stopped");
        onErrorRef.current(error);
      }
    });

    return (): void => {
      unsubscribe();
      void transport.dispose().catch(() => {
        // Teardown errors cannot be surfaced after the UI has unmounted.
      });

      if (transportRef.current === transport) {
        transportRef.current = null;
        loadedClipIdRef.current = null;
      }
    };
  }, [
    playTransport,
    playheadPosition,
    projectStore,
    publishPlayhead,
    publishPlayingClipId,
  ]);

  useEffect(() => {
    const transport = transportRef.current;

    if (transport === null || status !== "playing") {
      return undefined;
    }

    let animationFrame = 0;

    const publishPosition = (): void => {
      const clipId = loadedClipIdRef.current;

      if (transport.status !== "playing" || clipId === null) {
        return;
      }

      publishPlayhead(clipId, transport.getPositionTick());
      animationFrame = requestAnimationFrame(publishPosition);
    };

    animationFrame = requestAnimationFrame(publishPosition);

    return (): void => {
      cancelAnimationFrame(animationFrame);
    };
  }, [publishPlayhead, status]);

  const launchClip = useCallback((
    clipId: ClipId,
    startTick: Tick,
  ): void => {
    const transport = transportRef.current;
    const state = projectStore.getState();
    const clip = state.clipsById[clipId];

    if (transport === null || clip === undefined) {
      return;
    }

    try {
      const normalizedTick = resolvePlaybackStartTick(
        startTick,
        clip.timeline.durationTicks,
        clip.transportSettings,
      );
      const alreadyPlaying = transport.status === "playing";

      allowAutoAdvanceRef.current = true;
      replaceTransportClip(transport, state, clipId, normalizedTick);
      loadedClipIdRef.current = clipId;
      publishPlayhead(clipId, normalizedTick);
      publishPlayingClipId(clipId);

      if (alreadyPlaying) {
        setStatus("playing");
      } else {
        playTransport(transport, clipId, normalizedTick);
      }
    } catch (error: unknown) {
      allowAutoAdvanceRef.current = false;
      transport.stop();
      allowAutoAdvanceRef.current = true;
      publishPlayingClipId(null);
      setStatus("stopped");
      onErrorRef.current(error);
    }
  }, [
    playTransport,
    projectStore,
    publishPlayhead,
    publishPlayingClipId,
  ]);

  const stopPlayback = useCallback((): void => {
    allowAutoAdvanceRef.current = false;
    transportRef.current?.stop();
    allowAutoAdvanceRef.current = true;
    publishPlayingClipId(null);
    setStatus("stopped");
  }, [publishPlayingClipId]);

  const togglePlayback = useCallback((): void => {
    const transport = transportRef.current;

    if (transport === null) {
      return;
    }

    if (transport.status === "playing") {
      transport.pause();
      return;
    }

    const position = normalizePlayheadPosition(
      projectStore.getState(),
      playheadPosition.get(),
    );

    if (
      transport.status === "paused"
      && loadedClipIdRef.current === position.clipId
    ) {
      const clip = getClip(projectStore.getState(), position.clipId);
      const startTick = resolvePlaybackStartTick(
        position.tick,
        clip.timeline.durationTicks,
        clip.transportSettings,
      );

      publishPlayhead(position.clipId, startTick);
      publishPlayingClipId(position.clipId);
      playTransport(transport, position.clipId, startTick);
      return;
    }

    launchClip(position.clipId, position.tick);
  }, [
    launchClip,
    playTransport,
    playheadPosition,
    projectStore,
    publishPlayingClipId,
  ]);

  const toggleClipPlayback = useCallback((clipId: ClipId): void => {
    const transport = transportRef.current;

    if (
      transport !== null
      && transport.status === "playing"
      && loadedClipIdRef.current === clipId
    ) {
      stopPlayback();
      return;
    }

    launchClip(clipId, 0);
  }, [launchClip, stopPlayback]);

  const returnToStart = useCallback((): void => {
    const transport = transportRef.current;
    const state = projectStore.getState();
    const position = normalizePlayheadPosition(state, playheadPosition.get());

    if (transport === null) {
      return;
    }

    if (loadedClipIdRef.current !== position.clipId) {
      replaceTransportClip(transport, state, position.clipId, 0);
      loadedClipIdRef.current = position.clipId;

      if (transport.status !== "stopped") {
        publishPlayingClipId(position.clipId);
      }
    } else {
      publishPlayhead(position.clipId, 0);
      transport.seek(0);
    }

    publishPlayhead(position.clipId, 0);
  }, [
    playheadPosition,
    projectStore,
    publishPlayhead,
    publishPlayingClipId,
  ]);

  const seek = useCallback((tick: Tick): void => {
    const transport = transportRef.current;
    const state = projectStore.getState();
    const targetClip = getClip(state, state.workspace.activeClipId);
    const normalizedTick = clampTick(tick, targetClip.timeline.durationTicks);

    if (transport === null) {
      publishPlayhead(targetClip.id, normalizedTick);
      return;
    }

    try {
      if (loadedClipIdRef.current !== targetClip.id) {
        replaceTransportClip(
          transport,
          state,
          targetClip.id,
          normalizedTick,
        );
        loadedClipIdRef.current = targetClip.id;
        publishPlayhead(targetClip.id, normalizedTick);

        if (transport.status !== "stopped") {
          publishPlayingClipId(targetClip.id);
        }
      } else {
        publishPlayhead(targetClip.id, normalizedTick);
        transport.seek(normalizedTick);
      }
    } catch (error: unknown) {
      allowAutoAdvanceRef.current = false;
      transport.stop();
      allowAutoAdvanceRef.current = true;
      publishPlayingClipId(null);
      setStatus("stopped");
      onErrorRef.current(error);
    }
  }, [
    projectStore,
    publishPlayhead,
    publishPlayingClipId,
  ]);

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
    playingClipId,
    togglePlayback,
    toggleClipPlayback,
    stopPlayback,
    returnToStart,
    seek,
    auditionPitch,
    previewInstrumentGain,
    previewInstrumentSettings,
    previewMasterGain,
  };
}

function normalizePlayheadPosition(
  state: ProjectState,
  position: PlayheadPosition,
): PlayheadPosition {
  const clip = state.clipsById[position.clipId]
    ?? getClip(state, state.workspace.activeClipId);

  return {
    clipId: clip.id,
    tick: clampTick(position.tick, clip.timeline.durationTicks),
  };
}

function clampTick(tick: Tick, durationTicks: Tick): Tick {
  return Math.max(0, Math.min(tick, durationTicks));
}

function didPlaybackStateChange(
  state: ProjectState,
  previousState: ProjectState,
  clipId: ClipId,
): boolean {
  const clip = state.clipsById[clipId];
  const previousClip = previousState.clipsById[clipId];

  if (
    clip === undefined
    || previousClip === undefined
    || state.clock !== previousState.clock
    || clip.timeline !== previousClip.timeline
    || clip.tracksByInstrumentId !== previousClip.tracksByInstrumentId
    || clip.transportSettings !== previousClip.transportSettings
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
    const instrumentState = clip.instrumentStatesById[instrumentId];
    const previousInstrumentState =
      previousClip.instrumentStatesById[instrumentId];

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

function replaceTransportClip(
  transport: AudioWorkletTransport,
  state: ProjectState,
  clipId: ClipId,
  positionTickOverride?: Tick,
): void {
  const clip = getClip(state, clipId);

  transport.replacePlaybackState(
    compilePlaybackPlan(
      state,
      createClipPlaybackSource(clip),
    ),
    clip.transportSettings,
    positionTickOverride,
  );
}
