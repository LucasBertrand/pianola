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
  LookaheadScheduler,
} from "../../audio/lookahead-scheduler";
import {
  DEFAULT_AUDIO_ENGINE_CONFIG,
} from "../../audio/default-audio-engine-config";
import {
  compilePlaybackPlan,
} from "../../audio/playback-snapshot";
import {
  createClipPlaybackSource,
} from "../../audio/playback-source";
import {
  WebAudioEngine,
} from "../../audio/web-audio-engine";
import type {
  MutableRenderSignal,
} from "../../editor/model/render-signal";
import type {
  InstrumentConfig,
} from "../../domain/instruments/instrument";
import {
  clearInstrumentSettingsPreview,
  EMPTY_INSTRUMENT_SETTINGS_PREVIEW,
  setInstrumentSettingsPreview,
} from "../../audio/instrument-settings-preview";

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
  const schedulerRef = useRef<LookaheadScheduler | null>(null);
  const instrumentSettingsPreviewRef = useRef(
    EMPTY_INSTRUMENT_SETTINGS_PREVIEW,
  );
  const pendingInstrumentPreviewIdRef = useRef<InstrumentId | null>(null);
  const instrumentPreviewFrameRef = useRef<number | null>(null);

  onErrorRef.current = onError;

  useEffect(() => {
    let scheduler: LookaheadScheduler;

    try {
      const state = projectStore.getState();
      const activeClip = getActiveClip(state);
      const snapshot = compilePlaybackPlan(
        state,
        createClipPlaybackSource(activeClip),
        instrumentSettingsPreviewRef.current,
      );
      const engine = new WebAudioEngine(
        DEFAULT_AUDIO_ENGINE_CONFIG,
        snapshot,
      );

      scheduler = new LookaheadScheduler(
        engine,
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
            state.workspace.activeClipId !== previousState.workspace.activeClipId;

          scheduler.replacePlaybackState(
            compilePlaybackPlan(
              state,
              createClipPlaybackSource(activeClip),
              instrumentSettingsPreviewRef.current,
            ),
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

  useEffect(() => (): void => {
    if (instrumentPreviewFrameRef.current !== null) {
      cancelAnimationFrame(instrumentPreviewFrameRef.current);
      instrumentPreviewFrameRef.current = null;
    }
  }, []);

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
    instrumentId: InstrumentId,
    pitch: number,
  ): void => {
    const scheduler = schedulerRef.current;

    if (scheduler === null) {
      return;
    }

    void scheduler.auditionPitch(instrumentId, pitch).catch((error: unknown) => {
      onErrorRef.current(error);
    });
  }, []);

  const previewInstrumentGain = useCallback((
    instrumentId: InstrumentId,
    gain: number,
  ): void => {
    try {
      schedulerRef.current?.previewInstrumentGain(instrumentId, gain);
    } catch (error: unknown) {
      onErrorRef.current(error);
    }
  }, []);

  const previewInstrumentSettings = useCallback((
    instrumentId: InstrumentId,
    config: InstrumentConfig | null,
  ): void => {
    instrumentSettingsPreviewRef.current = config === null
      ? clearInstrumentSettingsPreview(
          instrumentSettingsPreviewRef.current,
          instrumentId,
        )
      : setInstrumentSettingsPreview(
          instrumentSettingsPreviewRef.current,
          instrumentId,
          config,
        );

    pendingInstrumentPreviewIdRef.current = instrumentId;

    if (instrumentPreviewFrameRef.current !== null) {
      return;
    }

    instrumentPreviewFrameRef.current = requestAnimationFrame(() => {
      instrumentPreviewFrameRef.current = null;
      const pendingInstrumentId = pendingInstrumentPreviewIdRef.current;
      const scheduler = schedulerRef.current;

      pendingInstrumentPreviewIdRef.current = null;

      if (scheduler === null || pendingInstrumentId === null) {
        return;
      }

      try {
        const state = projectStore.getState();
        const activeClip = getActiveClip(state);

        scheduler.replaceInstrumentPreview(
          compilePlaybackPlan(
            state,
            createClipPlaybackSource(activeClip),
            instrumentSettingsPreviewRef.current,
          ),
          activeClip.transportSettings,
          pendingInstrumentId,
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
