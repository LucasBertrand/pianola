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
  planMarkerMove,
  type TimeMapMarkerDraft,
} from "../../use-cases/piano-roll/timeline/time-map-marker-plans";
import type { TonalPatternId, TonalPatternType } from "../../music/pitch-snap";

export interface TimeMapMarkerWorkflow {
  readonly draft: TimeMapMarkerDraft | null;
  readonly openMarker: (tick: Tick) => void;
  readonly selectMarker: (tick: Tick, mode: SelectionMode) => void;
  readonly openMarkerAtPlayhead: () => void;
  readonly moveMarker: (fromTick: Tick, toTick: Tick) => void;
  readonly setDraftTempoIncluded: (included: boolean) => void;
  readonly setDraftMeterIncluded: (included: boolean) => void;
  readonly setDraftScaleIncluded: (included: boolean) => void;
  readonly setDraftBpm: (bpm: number) => void;
  readonly setDraftTimeSignature: (timeSignature: TimeSignature) => void;
  readonly setDraftRootNote: (rootNote: string) => void;
  readonly setDraftPatternId: (patternId: TonalPatternId) => void;
  readonly setDraftPatternType: (patternType: TonalPatternType) => void;
  readonly confirmDraft: () => void;
  readonly deleteDraft: () => void;
  readonly cancelDraft: () => void;
}

import type {
  ShowApplicationAlert,
} from "../../use-cases/dialogs/application-dialog-port";
import type {
  PianoRollControllerPort,
} from "../../editor/interactions/piano-roll-controller-port";
import type {
  NoteCollisionResolutionRequest,
} from "../../use-cases/piano-roll/notes/note-collision-resolution";
import {
  NoteGestureWorkflow,
} from "../../use-cases/piano-roll/notes/note-gesture-workflow";
import {
  buildRepositionedNotes,
} from "../../editor/interactions/gestures/note-gesture-math";
import {
  resolvePitchSnapSettings,
} from "../../use-cases/piano-roll/timeline/pitch-snap-resolution";
import type {
  MarkerCollisionResolutionRequest,
} from "../../use-cases/piano-roll/timeline/marker-collision-resolution";
import {
  createSelectedMarkerGroup,
} from "../../editor/selection/editor-selection";
import type {
  SelectionMode,
} from "../../editor/interactions/gestures/gesture-draft";
import {
  applyTimeMapMarkerSelection,
} from "./time-map-marker-selection";

export interface TimeMapMarkerWorkflowOptions {
  readonly runtime: EditorRuntime;
  readonly alert: ShowApplicationAlert;
  readonly getController: () => PianoRollControllerPort | null;
  readonly resolveCollision: (
    request: NoteCollisionResolutionRequest,
  ) => void;
  readonly resolveMarkerCollision: (
    request: MarkerCollisionResolutionRequest,
  ) => void;
}

/**
 * Owns the marker dialog draft and turns validated gestures into single
 * transactions. The document never changes while a dialog or drag is open.
 */
export function useTimeMapMarkerWorkflow({
  runtime,
  alert,
  getController,
  resolveCollision,
  resolveMarkerCollision,
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
  const selectMarker = useCallback((
    tick: Tick,
    mode: SelectionMode,
  ): void => {
    const timeMap = getActiveClip(runtime.projectStore.getState())
      .timeline.timeMap;
    const group = createSelectedMarkerGroup(
      tick,
      timeMap.tempoMarkers.some((marker) => marker.startTick === tick),
      timeMap.scaleMarkers.some((marker) => marker.startTick === tick),
    );

    if (
      group !== null
      && applyTimeMapMarkerSelection(runtime.selection, group, mode)
    ) {
      getController()?.refreshSelection();
    }
  }, [getController, runtime]);
  const moveMarker = useCallback(
    (fromTick: Tick, toTick: Tick): void => {
      const state = runtime.projectStore.getState();
      const clipId = getActiveClip(state).id;

      if (runtime.selection.hasMarkerGroup(fromTick)) {
        const deltaTicks = toTick - fromTick;
        const activeClip = getActiveClip(state);
        const workflow = new NoteGestureWorkflow(
          runtime.editorCommands,
          runtime.selection,
          {
            onCollision: resolveCollision,
            onMarkerCollision: resolveMarkerCollision,
            onTransactionRejected(error): void {
              alert(
                "Invalid move",
                error instanceof Error
                  ? error.message
                  : "The timeline selection could not be moved.",
                "danger",
              );
            },
            onSelectionChanged(): void {
              getController()?.refreshSelection();
            },
          },
        );
        const result = workflow.commitMove(
          buildRepositionedNotes(
            runtime.selection.notes,
            deltaTicks,
            0,
            (tick) => resolvePitchSnapSettings(
              activeClip.timeline.timeMap,
              runtime.pitchSnapSettings.get(),
              tick,
            ),
          ),
          deltaTicks,
        );

        if (result === "committed") {
          getController()?.refreshSelection();
        }
        return;
      }

      const commitStandaloneMove = (overwriteCollisions: boolean): void => {
        try {
          const currentState = runtime.projectStore.getState();
          const plan = planMarkerMove(
            currentState,
            clipId,
            fromTick,
            toTick,
            overwriteCollisions,
          );

          if (plan.collisions.length > 0 && !overwriteCollisions) {
            resolveMarkerCollision({
              label: "Move marker",
              collisions: plan.collisions,
              onOverwrite(): void {
                commitStandaloneMove(true);
              },
            });
            return;
          }

          if (plan.commands.length > 0) {
            runtime.editorCommands.dispatch(plan.commands, "Move marker");
          }
        } catch (error: unknown) {
          alert(
            "Invalid move",
            error instanceof Error
              ? error.message
              : "The marker could not be moved.",
            "danger",
          );
        }
      };

      commitStandaloneMove(false);
    },
    [
      alert,
      getController,
      resolveCollision,
      resolveMarkerCollision,
      runtime,
    ],
  );
  const setDraftBpm = useCallback((bpm: number): void => {
    setDraft((current) => current === null ? null : { ...current, bpm });
  }, []);
  const setDraftTempoIncluded = useCallback((included: boolean): void => {
    setDraft((current) =>
      current === null || !current.canChangeMarkerTypes
        ? current
        : { ...current, tempoIncluded: included });
  }, []);
  const setDraftMeterIncluded = useCallback((included: boolean): void => {
    setDraft((current) =>
      current === null || !current.canChangeMarkerTypes
        ? current
        : { ...current, meterIncluded: included });
  }, []);
  const setDraftScaleIncluded = useCallback((included: boolean): void => {
    setDraft((current) =>
      current === null || !current.canChangeMarkerTypes
        ? current
        : { ...current, scaleIncluded: included });
  }, []);
  const setDraftTimeSignature = useCallback(
    (timeSignature: TimeSignature): void => {
      setDraft((current) =>
        current === null ? null : { ...current, timeSignature });
    },
    [],
  );
  const setDraftRootNote = useCallback((rootNote: string): void => {
    setDraft((current) => current === null ? null : { ...current, rootNote });
  }, []);
  const setDraftPatternId = useCallback((patternId: TonalPatternId): void => {
    setDraft((current) => current === null ? null : { ...current, patternId });
  }, []);
  const setDraftPatternType = useCallback((patternType: TonalPatternType): void => {
    setDraft((current) => current === null ? null : { ...current, patternType });
  }, []);
  const confirmDraft = useCallback((): void => {
    if (draft === null) {
      return;
    }

    try {
      const state = runtime.projectStore.getState();
      const clipId = getActiveClip(state).id;
      const commands = planMarkerDraftCommands(state, clipId, draft);

      if (commands.length > 0) {
        runtime.editorCommands.dispatch(
          commands,
          draft.mode === "create" ? "Add marker" : "Edit marker",
        );
      }

      setDraft(null);
    } catch (error: unknown) {
      alert(
        "Marker edit unavailable",
        error instanceof Error
          ? error.message
          : "The marker could not be edited.",
        "danger",
      );
    }
  }, [alert, draft, runtime]);
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
    selectMarker,
    openMarkerAtPlayhead,
    moveMarker,
    setDraftTempoIncluded,
    setDraftMeterIncluded,
    setDraftScaleIncluded,
    setDraftBpm,
    setDraftTimeSignature,
    setDraftRootNote,
    setDraftPatternId,
    setDraftPatternType,
    confirmDraft,
    deleteDraft,
    cancelDraft,
  };
}
