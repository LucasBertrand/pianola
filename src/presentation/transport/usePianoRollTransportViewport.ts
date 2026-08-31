import {
  useCallback,
  useEffect,
} from "react";
import type {
  EditorRuntime,
} from "../../application/editor-session/editor-runtime";
import type {
  Clip,
} from "../../domain/clips/clip";
import type {
  ClipId,
  InstrumentId,
} from "../../domain/identifiers";
import type {
  PianoRollControllerPort,
} from "../../editor-core/interactions/piano-roll-controller-port";
import {
  computeClipFitViewport,
} from "../../editor-core/viewport/compute-clip-fit-viewport";
import type {
  ShowApplicationAlert,
} from "../../application/dialogs/application-dialog-port";
import {
  getPlaybackFollowTargetClipId,
  resolvePlaybackFollowClipSelection,
  shouldReturnViewportToStart,
} from "./playback-follow-policy";
import {
  useAudioPlayback,
  type AudioPlaybackActions,
} from "./useAudioPlayback";
import {
  useTransportWorkflow,
  type TransportWorkflow,
} from "./useTransportWorkflow";
import {
  useViewportControls,
  type ViewportControls,
} from "../piano-roll/useViewportControls";

export interface PianoRollTransportViewport {
  readonly playback: AudioPlaybackActions;
  readonly transport: TransportWorkflow;
  readonly viewport: ViewportControls;
  readonly autoFit: () => void;
  readonly returnToStart: () => void;
  readonly auditionPitch: (pitch: number) => void;
}

export interface UsePianoRollTransportViewportOptions {
  readonly runtime: EditorRuntime;
  readonly activeClip: Clip;
  readonly inspectorOpen: boolean;
  readonly autoScrollEnabled: boolean;
  readonly selectedInstrumentId: InstrumentId | null;
  readonly getController: () => PianoRollControllerPort | null;
  readonly alert: ShowApplicationAlert;
}

/** Coordinates low-frequency transport state with direct viewport signals. */
export function usePianoRollTransportViewport({
  runtime,
  activeClip,
  inspectorOpen,
  autoScrollEnabled,
  selectedInstrumentId,
  getController,
  alert,
}: UsePianoRollTransportViewportOptions): PianoRollTransportViewport {
  const playback = useAudioPlayback({
    projectStore: runtime.projectStore,
    playheadPosition: runtime.playheadPosition,
    timeMapMarkerPreview: runtime.timeMapMarkerPreview,
    loopPreview: runtime.loopPreview,
    onError(error) {
      alert(
        "Playback unavailable",
        error instanceof Error && error.message.length > 0
          ? error.message
          : "The browser could not initialize the audio engine.",
        "danger",
      );
    },
  });
  const handleAutoFit = useCallback((): void => {
    runtime.viewport.set(computeClipFitViewport(
      activeClip,
      runtime.viewportWidth.get(),
      runtime.viewportHeight.get(),
    ));
  }, [activeClip, runtime]);
  const viewport = useViewportControls(
    runtime,
    inspectorOpen,
    autoScrollEnabled
      && playback.status === "playing"
      && playback.playingClipId === activeClip.id,
    playback.seek,
    handleAutoFit,
  );
  const transport = useTransportWorkflow({
    runtime,
    getController,
    seekPlayback: playback.seek,
  });
  const returnToStart = useCallback((): void => {
    playback.returnToStart();
    const currentViewport = runtime.viewport.get();

    if (
      shouldReturnViewportToStart(
        autoScrollEnabled,
        activeClip.id,
        playback.playingClipId,
      )
      && currentViewport.scrollX !== 0
    ) {
      viewport.publishViewport({ ...currentViewport, scrollX: 0 });
    }
  }, [
    activeClip.id,
    autoScrollEnabled,
    playback,
    runtime,
    viewport,
  ]);
  const auditionPitch = useCallback((pitch: number): void => {
    if (selectedInstrumentId !== null) {
      playback.auditionPitch(selectedInstrumentId, pitch);
    }
  }, [playback, selectedInstrumentId]);

  return {
    playback,
    transport,
    viewport,
    autoFit: handleAutoFit,
    returnToStart,
    auditionPitch,
  };
}

export interface UsePlaybackFollowSelectionOptions {
  readonly autoScrollEnabled: boolean;
  readonly playbackStatus: AudioPlaybackActions["status"];
  readonly activeClipId: ClipId;
  readonly playingClipId: ClipId | null;
  readonly selectClip: (clipId: ClipId) => void;
}

export function usePlaybackFollowSelection({
  autoScrollEnabled,
  playbackStatus,
  activeClipId,
  playingClipId,
  selectClip,
}: UsePlaybackFollowSelectionOptions): (clipId: ClipId) => void {
  const selectRequestedClip = useCallback((clipId: ClipId): void => {
    selectClip(resolvePlaybackFollowClipSelection(
      autoScrollEnabled,
      playbackStatus,
      clipId,
      playingClipId,
    ));
  }, [autoScrollEnabled, playbackStatus, playingClipId, selectClip]);

  useEffect(() => {
    const targetClipId = getPlaybackFollowTargetClipId(
      autoScrollEnabled,
      playbackStatus,
      activeClipId,
      playingClipId,
    );

    if (targetClipId !== null) {
      selectClip(targetClipId);
    }
  }, [
    activeClipId,
    autoScrollEnabled,
    playbackStatus,
    playingClipId,
    selectClip,
  ]);

  return selectRequestedClip;
}
