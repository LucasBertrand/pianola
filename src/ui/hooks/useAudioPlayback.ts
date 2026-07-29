import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ProjectState,
  Tick,
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
  SubtractiveAudioEngine,
} from "../../audio/subtractive-audio-engine";
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
  readonly previewMasterGain: (gain: number) => void;
  readonly beginSeekGesture: () => void;
  readonly previewSeek: (tick: Tick) => void;
  readonly commitSeekGesture: (tick: Tick) => void;
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
  const resumeAfterSeekGestureRef = useRef(false);

  onErrorRef.current = onError;

  useEffect(() => {
    let scheduler: LookaheadScheduler;

    try {
      const state = projectStore.getState();
      const snapshot = compilePlaybackSnapshot(state);
      const engine = new SubtractiveAudioEngine(
        DEFAULT_AUDIO_ENGINE_CONFIG,
        snapshot,
      );

      scheduler = new LookaheadScheduler(
        engine,
        snapshot,
        state.transportSettings,
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
          scheduler.replacePlaybackState(
            compilePlaybackSnapshot(state),
            state.transportSettings,
          );
        } catch (error: unknown) {
          scheduler.stop();
          onErrorRef.current(error);
        }
      },
    );

    return (): void => {
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
    resumeAfterSeekGestureRef.current = false;
    schedulerRef.current?.stop();
  }, []);

  const returnToStart = useCallback((): void => {
    resumeAfterSeekGestureRef.current = false;
    schedulerRef.current?.seek(0);
  }, []);

  const seek = useCallback((tick: Tick): void => {
    resumeAfterSeekGestureRef.current = false;
    schedulerRef.current?.seek(tick);
  }, []);

  const previewMasterGain = useCallback((gain: number): void => {
    schedulerRef.current?.previewMasterGain(gain);
  }, []);

  const beginSeekGesture = useCallback((): void => {
    const scheduler = schedulerRef.current;

    if (scheduler === null) {
      return;
    }

    resumeAfterSeekGestureRef.current =
      scheduler.status === "playing";
    scheduler.pause();
  }, []);

  const previewSeek = useCallback((tick: Tick): void => {
    playheadTick.set(tick);
  }, [
    playheadTick,
  ]);

  const commitSeekGesture = useCallback((tick: Tick): void => {
    const scheduler = schedulerRef.current;

    if (scheduler === null) {
      return;
    }

    const shouldResume = resumeAfterSeekGestureRef.current;

    resumeAfterSeekGestureRef.current = false;
    scheduler.seek(tick);

    if (shouldResume) {
      void scheduler.play(tick).catch(() => {
        // The scheduler reports initialization errors through onError.
      });
    }
  }, []);

  return {
    status,
    togglePlayback,
    stopPlayback,
    returnToStart,
    seek,
    previewMasterGain,
    beginSeekGesture,
    previewSeek,
    commitSeekGesture,
  };
}

function didPlaybackStateChange(
  state: ProjectState,
  previousState: ProjectState,
): boolean {
  if (
    state.measureCount !== previousState.measureCount
    || state.tracksByVoiceId !== previousState.tracksByVoiceId
    || state.transportSettings !== previousState.transportSettings
  ) {
    return true;
  }

  if (state.voicesById === previousState.voicesById) {
    return false;
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

    if (
      voice === undefined
      || previousVoice === undefined
      || voice.muted !== previousVoice.muted
      || voice.solo !== previousVoice.solo
      || voice.gain !== previousVoice.gain
      || voice.pan !== previousVoice.pan
      || voice.instrument !== previousVoice.instrument
    ) {
      return true;
    }
  }

  return false;
}
