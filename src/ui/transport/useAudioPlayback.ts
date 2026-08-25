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
  const queuedClipIdRef = useRef<ClipId | null>(null);
  const playingClipIdRef = useRef<ClipId | null>(null);

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
          onStatusChange(nextStatus, sourceClipId, positionTick) {
            const sourceChanged = loadedClipIdRef.current !== sourceClipId;

            loadedClipIdRef.current = sourceClipId;
            publishPlayhead(sourceClipId, positionTick);

            if (sourceChanged) {
              queuedClipIdRef.current = null;

              try {
                synchronizeAutoAdvanceQueue(
                  transport,
                  projectStore.getState(),
                  sourceClipId,
                  queuedClipIdRef,
                );
              } catch (error: unknown) {
                transport.clearQueuedPlaybackState();
                queuedClipIdRef.current = null;
                onErrorRef.current(error);
              }
            }

            if (nextStatus === "stopped") {
              publishPlayingClipId(null);
            } else {
              publishPlayingClipId(sourceClipId);
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
      synchronizeAutoAdvanceQueue(
        transport,
        state,
        initialClip.id,
        queuedClipIdRef,
      );
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
        transport.stop();
        publishPlayingClipId(null);
        queuedClipIdRef.current = null;
        setStatus("stopped");
        return;
      }

      const sourcePosition = normalizePlayheadPosition(
        state,
        playheadPosition.get(),
      );
      publishPlayhead(sourcePosition.clipId, sourcePosition.tick);

      const loadedClipId = loadedClipIdRef.current;
      const playbackStateChanged = loadedClipId === null
        || didPlaybackStateChange(state, previousState, loadedClipId);

      if (
        loadedClipIdRef.current === sourcePosition.clipId
        && !playbackStateChanged
      ) {
        const nextClipId = getAutoAdvanceTargetClipId(
          state,
          sourcePosition.clipId,
        );
        const queuedPlaybackChanged = nextClipId !== null
          && didPlaybackStateChange(state, previousState, nextClipId);

        if (
          nextClipId !== queuedClipIdRef.current
          || queuedPlaybackChanged
          || state.clipHierarchy !== previousState.clipHierarchy
          || state.autoAdvanceEnabled !== previousState.autoAdvanceEnabled
          || state.masterBus.gain !== previousState.masterBus.gain
        ) {
          synchronizeAutoAdvanceQueue(
            transport,
            state,
            sourcePosition.clipId,
            queuedClipIdRef,
          );
        }

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
        synchronizeAutoAdvanceQueue(
          transport,
          state,
          sourcePosition.clipId,
          queuedClipIdRef,
        );
      } catch (error: unknown) {
        transport.stop();
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
        queuedClipIdRef.current = null;
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

      if (transport.status === "playing" && clipId !== null) {
        publishPlayhead(clipId, transport.getPositionTick());
      }

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

      replaceTransportClip(transport, state, clipId, normalizedTick);
      loadedClipIdRef.current = clipId;
      synchronizeAutoAdvanceQueue(
        transport,
        state,
        clipId,
        queuedClipIdRef,
      );
      publishPlayhead(clipId, normalizedTick);
      publishPlayingClipId(clipId);

      if (alreadyPlaying) {
        setStatus("playing");
      } else {
        playTransport(transport, clipId, normalizedTick);
      }
    } catch (error: unknown) {
      transport.stop();
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
    transportRef.current?.stop();
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
      synchronizeAutoAdvanceQueue(
        transport,
        state,
        position.clipId,
        queuedClipIdRef,
      );

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
        synchronizeAutoAdvanceQueue(
          transport,
          state,
          targetClip.id,
          queuedClipIdRef,
        );
        publishPlayhead(targetClip.id, normalizedTick);

        if (transport.status !== "stopped") {
          publishPlayingClipId(targetClip.id);
        }
      } else {
        publishPlayhead(targetClip.id, normalizedTick);
        transport.seek(normalizedTick);
      }
    } catch (error: unknown) {
      transport.stop();
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
    if (
      instrument === undefined
      || previousInstrument === undefined
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

function synchronizeAutoAdvanceQueue(
  transport: AudioWorkletTransport,
  state: ProjectState,
  currentClipId: ClipId,
  queuedClipIdRef: { current: ClipId | null },
): void {
  const nextClipId = getAutoAdvanceTargetClipId(state, currentClipId);

  if (nextClipId === null) {
    transport.clearQueuedPlaybackState();
    queuedClipIdRef.current = null;
    return;
  }

  const nextClip = getClip(state, nextClipId);

  transport.queuePlaybackState(
    compilePlaybackPlan(
      state,
      createClipPlaybackSource(nextClip),
    ),
    nextClip.transportSettings,
  );
  queuedClipIdRef.current = nextClipId;
}
