import {
  useCallback,
  useState,
} from "react";
import type {
  Tick,
} from "../../domain/identifiers";
import {
  getActiveClip,
} from "../../domain/project/project-document";
import type {
  TimeSignature,
} from "../../domain/transport/time-map";
import type {
  EditorRuntime,
} from "../../editor/runtime/editor-runtime";
import {
  createMarkerDraft,
  planMarkerDeletionCommands,
  planMarkerDraftCommands,
  planMarkerMoveCommands,
  type TimeMapMarkerDraft,
} from "../../use-cases/piano-roll/timeline/time-map-marker-plans";
import type { TonalPatternId } from "../../music/pitch-snap";

export interface TimeMapMarkerWorkflow {
  readonly draft: TimeMapMarkerDraft | null;
  readonly openMarker: (tick: Tick) => void;
  readonly openMarkerAtPlayhead: () => void;
  readonly moveMarker: (fromTick: Tick, toTick: Tick) => void;
  readonly setDraftBpm: (bpm: number) => void;
  readonly setDraftTimeSignature: (timeSignature: TimeSignature) => void;
  readonly setDraftTonicPitchClass: (tonicPitchClass: number) => void;
  readonly setDraftPatternId: (patternId: TonalPatternId) => void;
  readonly setDraftScaleDegreeIndex: (scaleDegreeIndex: number | null) => void;
  readonly confirmDraft: () => void;
  readonly deleteDraft: () => void;
  readonly cancelDraft: () => void;
}

import type {
  ShowApplicationAlert,
} from "../../use-cases/dialogs/application-dialog-port";

export interface TimeMapMarkerWorkflowOptions {
  readonly runtime: EditorRuntime;
  readonly alert: ShowApplicationAlert;
}

/**
 * Owns the marker dialog draft and turns validated gestures into single
 * transactions. The document never changes while a dialog or drag is open.
 */
export function useTimeMapMarkerWorkflow({
  runtime,
  alert,
}: TimeMapMarkerWorkflowOptions): TimeMapMarkerWorkflow {
  const [draft, setDraft] = useState<TimeMapMarkerDraft | null>(null);

  const openMarker = useCallback(
    (tick: Tick): void => {
      const state = runtime.projectStore.getState();

      setDraft(
        createMarkerDraft(state, getActiveClip(state).id, tick),
      );
    },
    [runtime],
  );
  const moveMarker = useCallback(
    (fromTick: Tick, toTick: Tick): void => {
      const state = runtime.projectStore.getState();
      const clipId = getActiveClip(state).id;
      let commands;
      try {
        commands = planMarkerMoveCommands(state, clipId, fromTick, toTick);
      } catch (error) {
        if (error instanceof Error) {
          alert("Invalid move", error.message, "danger");
        }
        return;
      }
      
      if (commands.length === 0) {
        return;
      }

      runtime.editorCommands.dispatch(commands, "Move marker");
    },
    [runtime, alert],
  );
  const setDraftBpm = useCallback((bpm: number): void => {
    setDraft((current) => current === null ? null : { ...current, bpm });
  }, []);
  const setDraftTimeSignature = useCallback(
    (timeSignature: TimeSignature): void => {
      setDraft((current) =>
        current === null ? null : { ...current, timeSignature });
    },
    [],
  );
  const setDraftTonicPitchClass = useCallback((tonicPitchClass: number): void => {
    setDraft((current) => current === null ? null : { ...current, tonicPitchClass });
  }, []);
  const setDraftPatternId = useCallback((patternId: TonalPatternId): void => {
    setDraft((current) => current === null ? null : { ...current, patternId });
  }, []);
  const setDraftScaleDegreeIndex = useCallback((scaleDegreeIndex: number | null): void => {
    setDraft((current) => current === null ? null : { ...current, scaleDegreeIndex });
  }, []);
  const confirmDraft = useCallback((): void => {
    if (draft === null) {
      return;
    }

    const state = runtime.projectStore.getState();
    const clipId = getActiveClip(state).id;
    const commands = planMarkerDraftCommands(state, clipId, draft);

    setDraft(null);

    if (commands.length === 0) {
      return;
    }

    runtime.editorCommands.dispatch(
      commands,
      draft.mode === "create" ? "Add marker" : "Edit marker",
    );
  }, [draft, runtime]);
  const deleteDraft = useCallback((): void => {
    if (draft === null || !draft.canDelete) {
      return;
    }

    const state = runtime.projectStore.getState();
    const clipId = getActiveClip(state).id;
    const commands = planMarkerDeletionCommands(
      state,
      clipId,
      draft.startTick,
    );

    setDraft(null);

    if (commands.length === 0) {
      return;
    }

    runtime.editorCommands.dispatch(commands, "Delete marker");
  }, [draft, runtime]);
  const cancelDraft = useCallback((): void => {
    setDraft(null);
  }, []);

  const openMarkerAtPlayhead = useCallback((): void => {
    const state = runtime.projectStore.getState();
    const tick = runtime.playheadTick.get();

    setDraft(
      createMarkerDraft(state, getActiveClip(state).id, tick),
    );
  }, [runtime]);

  return {
    draft,
    openMarker,
    openMarkerAtPlayhead,
    moveMarker,
    setDraftBpm,
    setDraftTimeSignature,
    setDraftTonicPitchClass,
    setDraftPatternId,
    setDraftScaleDegreeIndex,
    confirmDraft,
    deleteDraft,
    cancelDraft,
  };
}
