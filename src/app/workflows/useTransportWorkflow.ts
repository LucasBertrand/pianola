import {
  useCallback,
} from "react";
import {
  getActiveClip,
  getActiveClipDurationTicks,
  getTicksPerMeasure,
  MAXIMUM_MEASURE_COUNT,
  MINIMUM_MEASURE_COUNT,
  type LoopRegion,
} from "../../domain/model";
import type {
  PianoRollControllerPort,
} from "../../interaction/piano-roll-controller-port";
import type {
  EditorRuntime,
} from "../editor-runtime";

export interface TransportWorkflowOptions {
  readonly runtime: EditorRuntime;
  readonly getController: () => PianoRollControllerPort | null;
  readonly seekPlayback: (tick: number) => void;
}

export interface TransportWorkflow {
  readonly insertMeasureAtPlayhead: () => void;
  readonly removeMeasureAtPlayhead: () => void;
  readonly commitMasterGain: (gain: number) => void;
  readonly toggleMasterMute: () => void;
  readonly commitMasterTuning: (tuningFrequencyHz: number) => void;
  readonly commitProjectTitle: (input: HTMLInputElement) => void;
  readonly toggleLoop: () => void;
  readonly commitLoopRegion: (loop: LoopRegion) => void;
}

export function useTransportWorkflow({
  runtime,
  getController,
  seekPlayback,
}: TransportWorkflowOptions): TransportWorkflow {
  const prepareStructuralEdit = useCallback((): void => {
    const controller = getController();

    controller?.cancel();
    controller?.clearSelection();
  }, [getController]);

  const insertMeasureAtPlayhead = useCallback((): void => {
    const state = runtime.projectStore.getState();
    const activeClip = getActiveClip(state);

    if (activeClip.measureCount >= MAXIMUM_MEASURE_COUNT) {
      return;
    }

    const measureTicks = getTicksPerMeasure(activeClip.transportSettings);
    const measureIndex = Math.min(
      activeClip.measureCount - 1,
      Math.floor(runtime.playheadTick.get() / measureTicks),
    );

    prepareStructuralEdit();
    runtime.editorCommands.dispatch(
      [{
        type: "InsertMeasure",
        measureIndex,
      }],
      `Insert measure before ${measureIndex + 1}`,
    );
  }, [prepareStructuralEdit, runtime]);

  const removeMeasureAtPlayhead = useCallback((): void => {
    const state = runtime.projectStore.getState();
    const activeClip = getActiveClip(state);

    if (activeClip.measureCount <= MINIMUM_MEASURE_COUNT) {
      return;
    }

    const measureTicks = getTicksPerMeasure(activeClip.transportSettings);
    const measureIndex = Math.min(
      activeClip.measureCount - 1,
      Math.floor(runtime.playheadTick.get() / measureTicks),
    );
    const currentPlayheadTick = runtime.playheadTick.get();

    prepareStructuralEdit();
    const nextState = runtime.editorCommands.dispatch(
      [{
        type: "RemoveMeasure",
        measureIndex,
      }],
      `Remove measure ${measureIndex + 1}`,
    );

    if (nextState !== null) {
      const boundedPlayheadTick = Math.min(
        currentPlayheadTick,
        getActiveClipDurationTicks(nextState),
      );

      if (boundedPlayheadTick !== currentPlayheadTick) {
        seekPlayback(boundedPlayheadTick);
      }
    }
  }, [prepareStructuralEdit, runtime, seekPlayback]);

  const commitMasterGain = useCallback((gain: number): void => {
    runtime.editorCommands.dispatch(
      [{
        type: "UpdateMasterGain",
        gain,
      }],
      "Update master gain",
    );
  }, [runtime]);

  const toggleMasterMute = useCallback((): void => {
    const muted = runtime.projectStore.getState().masterBus.muted;

    runtime.editorCommands.dispatch(
      [{
        type: "SetMasterMuted",
        muted: !muted,
      }],
      muted ? "Unmute master bus" : "Mute master bus",
    );
  }, [runtime]);

  const commitMasterTuning = useCallback(
    (tuningFrequencyHz: number): void => {
      runtime.editorCommands.dispatch(
        [{
          type: "UpdateMasterTuning",
          tuningFrequencyHz,
        }],
        "Update master tuning",
      );
    },
    [runtime],
  );

  const commitProjectTitle = useCallback(
    (input: HTMLInputElement): void => {
      const title = input.value.trim();
      const currentTitle = runtime.projectStore.getState().title;

      if (title.length === 0) {
        input.value = currentTitle;
        return;
      }

      if (title !== currentTitle) {
        runtime.editorCommands.dispatch(
          [{
            type: "UpdateProjectTitle",
            title,
          }],
          "Rename project",
        );
      }
    },
    [runtime],
  );

  const toggleLoop = useCallback((): void => {
    runtime.editorCommands.dispatch(
      [{
        type: "SetLoopEnabled",
        enabled:
          !getActiveClip(runtime.projectStore.getState())
            .transportSettings.loopEnabled,
      }],
      "Toggle loop",
    );
  }, [runtime]);

  const commitLoopRegion = useCallback((loop: LoopRegion): void => {
    runtime.editorCommands.dispatch(
      [{
        type: "UpdateLoop",
        loop,
      }],
      "Update loop region",
    );
  }, [runtime]);

  return {
    insertMeasureAtPlayhead,
    removeMeasureAtPlayhead,
    commitMasterGain,
    toggleMasterMute,
    commitMasterTuning,
    commitProjectTitle,
    toggleLoop,
    commitLoopRegion,
  };
}
