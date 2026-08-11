import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getActiveClip,
  type ProjectState,
  type SubtractiveSynthConfig,
  type Tick,
  type VoiceId,
} from "../../domain/model";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import type {
  PlaybackStatus,
} from "../../audio/contracts";
import {
  DEFAULT_AUDIO_ENGINE_CONFIG,
  LookaheadScheduler,
} from "../../audio/lookahead-scheduler";
import {
  compilePlaybackSnapshot,
} from "../../audio/playback-snapshot";
import {
  WebAudioEngine,
} from "../../audio/web-audio-engine";
import type {
  MutableRenderSignal,
} from "../rendering/render-signal";

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
    voiceId: VoiceId,
    pitch: number,
  ) => void;
  readonly previewVoiceGain: (
    voiceId: VoiceId,
    gain: number,
  ) => void;
  readonly previewVoiceInstrument: (
    voiceId: VoiceId,
    instrument: SubtractiveSynthConfig,
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
  const schedulerRef = useRef<LookaheadScheduler | null>(null);
  const instrumentPreviewFrameRef = useRef(0);
  const pendingInstrumentPreviewRef = useRef<{
    readonly voiceId: VoiceId;
    readonly instrument: SubtractiveSynthConfig;
  } | null>(null);

  onErrorRef.current = onError;

  useEffect(() => {
    let scheduler: LookaheadScheduler;

    try {
      const state = projectStore.getState();
      const snapshot = compilePlaybackSnapshot(state);
      const engine = new WebAudioEngine(
        DEFAULT_AUDIO_ENGINE_CONFIG,
        snapshot,
      );

      scheduler = new LookaheadScheduler(
        engine,
        snapshot,
        getActiveClip(state).transportSettings,
        {
          onStatusChange(nextStatus, positionTick) {
            setStatus(nextStatus);
            playheadTick.set(positionTick);
          },
          onError(error) {
            onErrorRef.current(error);
          },
        },
        undefined,
        playheadTick.get(),
      );
      schedulerRef.current = scheduler;
      setStatus("stopped");
    } catch (error: unknown) {
      onErrorRef.current(error);
      return undefined;
    }

    const unsubscribe = projectStore.subscribe(
      (state, previousState) => {
        const activeClip = getActiveClip(state);
        const previousActiveClip = getActiveClip(previousState);

        if (
          (
            state.voicesById !== previousState.voicesById
            || state.activeClipId !== previousState.activeClipId
            || activeClip.voiceStatesById
              !== previousActiveClip.voiceStatesById
          )
          && instrumentPreviewFrameRef.current !== 0
        ) {
          cancelAnimationFrame(instrumentPreviewFrameRef.current);
          instrumentPreviewFrameRef.current = 0;
          pendingInstrumentPreviewRef.current = null;
        }

        if (
          state.masterBus.gain
          !== previousState.masterBus.gain
        ) {
          scheduler.previewMasterGain(state.masterBus.gain);
        }

        if (!didPlaybackStateChange(state, previousState)) {
          return;
        }

        try {
          const clipChanged =
            state.activeClipId !== previousState.activeClipId;

          scheduler.replacePlaybackState(
            compilePlaybackSnapshot(state),
            activeClip.transportSettings,
            clipChanged ? playheadTick.get() : undefined,
          );
        } catch (error: unknown) {
          scheduler.stop();
          onErrorRef.current(error);
        }
      },
    );

    return (): void => {
      if (instrumentPreviewFrameRef.current !== 0) {
        cancelAnimationFrame(instrumentPreviewFrameRef.current);
        instrumentPreviewFrameRef.current = 0;
      }

      pendingInstrumentPreviewRef.current = null;
      unsubscribe();
      void scheduler.dispose().catch(() => {
        // Teardown errors cannot be surfaced after the UI has unmounted.
      });

      if (schedulerRef.current === scheduler) {
        schedulerRef.current = null;
      }
    };
  }, [
    playheadTick,
    projectStore,
  ]);

  useEffect(() => {
    const scheduler = schedulerRef.current;

    if (scheduler === null || status !== "playing") {
      return undefined;
    }

    let animationFrame = 0;

    const publishPosition = (): void => {
      if (scheduler.status !== "playing") {
        return;
      }

      playheadTick.set(scheduler.getPositionTick());
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
    const scheduler = schedulerRef.current;

    if (scheduler === null) {
      return;
    }

    if (scheduler.status === "playing") {
      scheduler.pause();
      return;
    }

    void scheduler.play(playheadTick.get()).catch(() => {
      // The scheduler reports initialization errors through onError.
    });
  }, [
    playheadTick,
  ]);

  const stopPlayback = useCallback((): void => {
    schedulerRef.current?.stop();
  }, []);

  const returnToStart = useCallback((): void => {
    schedulerRef.current?.seek(0);
  }, []);

  const seek = useCallback((tick: Tick): void => {
    schedulerRef.current?.seek(tick);
  }, []);

  const auditionPitch = useCallback((
    voiceId: VoiceId,
    pitch: number,
  ): void => {
    const scheduler = schedulerRef.current;

    if (scheduler === null) {
      return;
    }

    void scheduler.auditionPitch(voiceId, pitch).catch((error: unknown) => {
      onErrorRef.current(error);
    });
  }, []);

  const previewVoiceGain = useCallback((
    voiceId: VoiceId,
    gain: number,
  ): void => {
    try {
      schedulerRef.current?.previewVoiceGain(voiceId, gain);
    } catch (error: unknown) {
      onErrorRef.current(error);
    }
  }, []);

  const previewVoiceInstrument = useCallback((
    voiceId: VoiceId,
    instrument: SubtractiveSynthConfig,
  ): void => {
    pendingInstrumentPreviewRef.current = {
      voiceId,
      instrument,
    };

    if (instrumentPreviewFrameRef.current !== 0) {
      return;
    }

    instrumentPreviewFrameRef.current = requestAnimationFrame(() => {
      instrumentPreviewFrameRef.current = 0;
      const preview = pendingInstrumentPreviewRef.current;

      pendingInstrumentPreviewRef.current = null;

      if (preview === null) {
        return;
      }

      const state = projectStore.getState();
      const voice = state.voicesById[preview.voiceId];
      const activeClip = getActiveClip(state);
      const voiceState = activeClip.voiceStatesById[preview.voiceId];
      const scheduler = schedulerRef.current;

      if (
        voice === undefined
        || voiceState === undefined
        || scheduler === null
      ) {
        return;
      }

      try {
        scheduler.previewPlaybackSnapshot(
          compilePlaybackSnapshot({
            ...state,
            clipsById: {
              ...state.clipsById,
              [activeClip.id]: {
                ...activeClip,
                voiceStatesById: {
                  ...activeClip.voiceStatesById,
                  [preview.voiceId]: {
                    ...voiceState,
                    instrument: preview.instrument,
                  },
                },
              },
            },
          }),
        );
      } catch (error: unknown) {
        onErrorRef.current(error);
      }
    });
  }, [projectStore]);

  const previewMasterGain = useCallback((gain: number): void => {
    schedulerRef.current?.previewMasterGain(gain);
  }, []);

  return {
    status,
    togglePlayback,
    stopPlayback,
    returnToStart,
    seek,
    auditionPitch,
    previewVoiceGain,
    previewVoiceInstrument,
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
    state.activeClipId !== previousState.activeClipId
    || activeClip.measureCount !== previousActiveClip.measureCount
    || activeClip.tracksByVoiceId !== previousActiveClip.tracksByVoiceId
    || activeClip.transportSettings !== previousActiveClip.transportSettings
    || state.masterBus.muted !== previousState.masterBus.muted
    || state.masterBus.tuningFrequencyHz
      !== previousState.masterBus.tuningFrequencyHz
  ) {
    return true;
  }

  if (state.voiceOrder !== previousState.voiceOrder) {
    return true;
  }

  for (
    let voiceIndex = 0;
    voiceIndex < state.voiceOrder.length;
    voiceIndex += 1
  ) {
    const voiceId = state.voiceOrder[voiceIndex];

    if (voiceId === undefined) {
      continue;
    }

    const voice = state.voicesById[voiceId];
    const previousVoice = previousState.voicesById[voiceId];
    const voiceState = activeClip.voiceStatesById[voiceId];
    const previousVoiceState =
      previousActiveClip.voiceStatesById[voiceId];

    if (
      voice === undefined
      || previousVoice === undefined
      || voiceState === undefined
      || previousVoiceState === undefined
      || voice.pan !== previousVoice.pan
      || voiceState.gain !== previousVoiceState.gain
      || voiceState.muted !== previousVoiceState.muted
      || voiceState.solo !== previousVoiceState.solo
      || voiceState.instrument !== previousVoiceState.instrument
    ) {
      return true;
    }
  }

  return false;
}
