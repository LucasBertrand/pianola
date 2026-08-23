import {
  useCallback,
} from "react";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import {
  getClipDurationTicks,
  MAXIMUM_MEASURE_COUNT,
  MINIMUM_MEASURE_COUNT,
} from "../../domain/clips/clip";
import {
  getMeasureSpanAtTick,
  getMeasureSpans,
} from "../../domain/transport/time-map";
import {
  type LoopRegion,
} from "../../domain/transport/transport";
import type {
  PianoRollControllerPort,
} from "../../editor/interactions/piano-roll-controller-port";
import type {
  EditorRuntime,
} from "../../editor/runtime/editor-runtime";

export interface TransportWorkflowOptions {
  readonly runtime: EditorRuntime;
  readonly getController: () => PianoRollControllerPort | null;
  readonly seekPlayback: (tick: number) => void;
}

export interface TransportWorkflow {
  readonly insertMeasuresAtPlayhead: (count: number, position: "before" | "after") => void;
  readonly removeMeasureAtPlayhead: () => void;
  readonly commitMasterGain: (gain: number) => void;
  readonly toggleMasterMute: () => void;
  readonly commitMasterTuning: (tuningFrequencyHz: number) => void;
  readonly commitProjectTitle: (input: HTMLInputElement) => void;
  readonly toggleLoop: () => void;
  readonly toggleAutoAdvance: () => void;
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

  const insertMeasuresAtPlayhead = useCallback((count: number, position: "before" | "after"): void => {
    const state = runtime.projectStore.getState();
    const activeClip = getActiveClip(state);
    const spans = getMeasureSpans(
      state.clock.ppqn,
      activeClip.timeline.timeMap,
      activeClip.timeline.durationTicks,
    );
    const measureCount = spans.length;

    if (measureCount + count > MAXIMUM_MEASURE_COUNT) {
      return;
    }

    const span = getMeasureSpanAtTick(
      state.clock.ppqn,
      activeClip.timeline.timeMap,
      activeClip.timeline.durationTicks,
      runtime.playheadTick.get(),
    );

    const measureIndex = position === "before" ? span.index : span.index + 1;
    const referenceSpan = spans[measureIndex] ?? spans[spans.length - 1];

    if (referenceSpan === undefined) {
      return;
    }

    const insertionTick = measureIndex === spans.length
      ? referenceSpan.endTick
      : referenceSpan.startTick;
    const insertedTicks =
      (referenceSpan.endTick - referenceSpan.startTick) * count;
    const currentPlayheadTick = runtime.playheadTick.get();

    prepareStructuralEdit();
    const nextState = runtime.editorCommands.dispatch(
      [{
        type: "InsertMeasure",
        clipId: activeClip.id,
        measureIndex,
        count,
      }],
      `Insert ${count} measure(s) ${position} measure ${span.index + 1}`,
    );

    if (
      nextState !== null
      && currentPlayheadTick >= insertionTick
    ) {
      seekPlayback(currentPlayheadTick + insertedTicks);
    }
  }, [prepareStructuralEdit, runtime, seekPlayback]);

  const removeMeasureAtPlayhead = useCallback((): void => {
    const state = runtime.projectStore.getState();
    const activeClip = getActiveClip(state);
    const measureCount = getMeasureSpans(
      state.clock.ppqn,
      activeClip.timeline.timeMap,
      activeClip.timeline.durationTicks,
    ).length;

    if (measureCount <= MINIMUM_MEASURE_COUNT) {
      return;
    }

    const span = getMeasureSpanAtTick(
      state.clock.ppqn,
      activeClip.timeline.timeMap,
      activeClip.timeline.durationTicks,
      runtime.playheadTick.get(),
    );
    const measureIndex = span.index;
    const removalStartTick = span.startTick;
    const removalEndTick = span.endTick;
    const currentPlayheadTick = runtime.playheadTick.get();

    prepareStructuralEdit();
    const nextState = runtime.editorCommands.dispatch(
      [{
        type: "RemoveMeasure",
        clipId: activeClip.id,
        measureIndex,
      }],
      `Remove measure ${measureIndex + 1}`,
    );

    if (nextState !== null) {
      const collapsedPlayheadTick = currentPlayheadTick <= removalStartTick
        ? currentPlayheadTick
        : currentPlayheadTick >= removalEndTick
          ? currentPlayheadTick - removalEndTick + removalStartTick
          : removalStartTick;
      const boundedPlayheadTick = Math.min(
        collapsedPlayheadTick,
        getClipDurationTicks(getActiveClip(nextState)),
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
    const state = runtime.projectStore.getState();
    const activeClip = getActiveClip(state);
    runtime.editorCommands.dispatch(
      [{
        type: "SetLoopEnabled",
        clipId: activeClip.id,
        enabled: !activeClip.transportSettings.loopEnabled,
      }],
      "Toggle loop",
    );
  }, [runtime]);

  const commitLoopRegion = useCallback((loop: LoopRegion): void => {
    const activeClip = getActiveClip(runtime.projectStore.getState());
    runtime.editorCommands.dispatch(
      [{
        type: "UpdateLoop",
        clipId: activeClip.id,
        loop,
      }],
      "Update loop region",
    );
  }, [runtime]);

  const toggleAutoAdvance = useCallback((): void => {
    const state = runtime.projectStore.getState();

    runtime.editorCommands.dispatch(
      [{
        type: "SetAutoAdvanceEnabled",
        enabled: !state.autoAdvanceEnabled,
      }],
      "Toggle project auto-advance",
    );
  }, [runtime]);

  return {
    insertMeasuresAtPlayhead,
    removeMeasureAtPlayhead,
    commitMasterGain,
    toggleMasterMute,
    commitMasterTuning,
    commitProjectTitle,
    toggleLoop,
    toggleAutoAdvance,
    commitLoopRegion,
  };
}
