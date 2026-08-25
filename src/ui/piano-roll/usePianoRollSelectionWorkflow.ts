import {
  useCallback,
  useRef,
} from "react";
import type {
  EditorCommandPort,
} from "../../use-cases/commands/editor-command-service";
import {
  buildAddNoteCommands,
  buildDeleteNoteCommands,
} from "../../use-cases/piano-roll/notes/note-edit-commands";
import type {
  NoteCollisionResolutionRequest,
  PreparedNoteCollisionResolution,
} from "../../use-cases/piano-roll/notes/note-collision-resolution";
import {
  buildDeleteClipboardMarkerCommands,
  buildSliceCommandsForNotesAtTicks,
  buildTransformCommandsForNotes,
  canPlacePastedTimelineContent,
  createPastedMarkerGroups,
  createPastedNotes,
  findNotesByIds,
  getRequiredMeasureCountForTimelineContent,
  planPastedMarkerCommands,
} from "../../use-cases/piano-roll/selection/selection-edit-plans";
import {
  CommandRejectedError,
} from "../../domain/commands/command-errors";
import {
  getActiveClip,
  type ProjectState,
} from "../../domain/project/project-document";
import {
  getMeasureCount,
} from "../../domain/transport/time-map";
import {
  type NoteId,
  type InstrumentId,
} from "../../domain/identifiers";
import { isNoteEditable } from "../../domain/notes/note";
import {
  countNoteEditCollisions,
  hasNoteEditCollisions,
} from "../../domain/note-collision";
import {
  SelectionTransformationError,
  transformNoteSelection,
  type SelectionTransformationKind,
} from "../../domain/selection-transformations";
import type {
  PianoRollControllerPort,
} from "../../editor/interactions/piano-roll-controller-port";
import type {
  ShowApplicationAlert,
} from "../../use-cases/dialogs/application-dialog-port";
import {
  usePianoRollClipboard,
} from "./usePianoRollClipboard";
import {
  usePianoRollSelectionCommands,
} from "./usePianoRollSelectionCommands";
import {
  usePianoRollInstrumentTransfer,
} from "./usePianoRollInstrumentTransfer";
import type {
  EditorSelection,
} from "../../editor/selection/editor-selection";
import type {
  MarkerCollisionResolutionRequest,
} from "../../use-cases/piano-roll/timeline/marker-collision-resolution";

export interface PianoRollSelectionWorkflowOptions {
  readonly commands: EditorCommandPort;
  readonly selection: EditorSelection;
  readonly getController: () => PianoRollControllerPort | null;
  readonly getPlayheadTick: () => number;
  readonly getGridResolutionTicks: () => number;
  readonly resolveCollision: (
    request: NoteCollisionResolutionRequest,
  ) => void;
  readonly resolveMarkerCollision: (
    request: MarkerCollisionResolutionRequest,
  ) => void;
  readonly alert: ShowApplicationAlert;
}

export interface PianoRollSelectionWorkflow {
  readonly clipboardAvailable: boolean;
  readonly clearClipboard: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly copy: () => void;
  readonly cut: () => void;
  readonly remove: () => void;
  readonly toggleFrozen: () => void;
  readonly transform: (
    kind: SelectionTransformationKind,
    label: string,
  ) => void;
  readonly sliceAtPlayhead: () => void;
  readonly sliceAtLoopAnchors: () => void;
  readonly paste: () => void;
  readonly transferToInstrument: (instrumentId: InstrumentId) => void;
}

export function usePianoRollSelectionWorkflow({
  commands,
  selection,
  getController,
  getPlayheadTick,
  getGridResolutionTicks,
  resolveCollision,
  resolveMarkerCollision,
  alert,
}: PianoRollSelectionWorkflowOptions): PianoRollSelectionWorkflow {
  const sequenceRef = useRef(0);
  const {
    available: clipboardAvailable,
    get: getClipboard,
    copySelection: copyCurrentSelection,
    copy,
    clear: clearClipboard,
  } = usePianoRollClipboard(commands, selection);
  const {
    undo,
    redo,
    remove,
    toggleFrozen,
  } = usePianoRollSelectionCommands(
    commands,
    selection,
    getController,
  );
  const transferToInstrument = usePianoRollInstrumentTransfer({
    commands,
    getController,
    resolveCollision,
    alert,
  });

  const nextSequence = useCallback((): number => {
    sequenceRef.current += 1;
    return sequenceRef.current;
  }, []);

  const cut = useCallback((): void => {
    const clipboard = copyCurrentSelection();

    if (clipboard === null) {
      return;
    }

    const activeClip = getActiveClip(commands.getState());
    const cutCommands = [
      ...buildDeleteNoteCommands(activeClip.id, clipboard.notes),
      ...buildDeleteClipboardMarkerCommands(
        activeClip.id,
        clipboard.markerGroups,
      ),
    ];

    try {
      if (
        commands.dispatch(
          cutCommands,
          getClipboardActionLabel("Cut", clipboard),
          {
            clipId: activeClip.id,
            noteIds: [],
            markerGroups: [],
          },
        ) !== null
      ) {
        getController()?.clearSelection();
      }
    } catch (error: unknown) {
      alert(
        "Cut unavailable",
        error instanceof Error
          ? error.message
          : "The selected notes and markers could not be cut.",
        "danger",
      );
    }
  }, [alert, commands, copyCurrentSelection, getController]);

  const transform = useCallback(
    (
      kind: SelectionTransformationKind,
      label: string,
    ): void => {
      const controller = getController();
      const originalNotes = controller?.getSelectedNotes() ?? [];

      if (controller === null || originalNotes.length === 0) {
        return;
      }

      const state = commands.getState();
      const activeClip = getActiveClip(state);

      for (const note of originalNotes) {
        const instrument = state.projectInstrumentsById[note.instrumentId];

        if (
          instrument === undefined
          || !isNoteEditable(note)
        ) {
          alert(
            "Transformation unavailable",
            instrument === undefined
              ? "The selection contains a note whose instrument is unavailable."
              : `Unlock note "${note.id}" before transforming it.`,
          );
          return;
        }
      }

      try {
        const proposedNotes = transformNoteSelection(
          originalNotes,
          kind,
          activeClip.timeline.durationTicks,
        );
        const intent = {
          originalNotes,
          proposedNotes,
        } as const;

        if (hasNoteEditCollisions(state, activeClip.id, intent)) {
          resolveCollision({
            clipId: activeClip.id,
            label,
            collisionCount: countNoteEditCollisions(
              state,
              activeClip.id,
              intent,
            ),
            ...intent,
            onResolved(nextState, selectedNoteIds): void {
              controller.replaceSelection(
                findNotesByIds(
                  nextState,
                  activeClip.id,
                  selectedNoteIds,
                ),
              );
            },
          });
          return;
        }

        const nextState = commands.dispatch(
          buildTransformCommandsForNotes(activeClip.id, proposedNotes),
          label,
          {
            clipId: activeClip.id,
            noteIds: proposedNotes.map((note) => note.id),
          },
        );

        if (nextState !== null) {
          const noteIds: NoteId[] = [];

          for (const note of proposedNotes) {
            noteIds.push(note.id);
          }
          controller.replaceSelection(
            findNotesByIds(nextState, activeClip.id, noteIds),
          );
        }
      } catch (error: unknown) {
        alert(
          "Transformation unavailable",
          error instanceof SelectionTransformationError
            || error instanceof CommandRejectedError
            ? error.message
            : "The selected notes could not be transformed.",
          "danger",
        );
      }
    },
    [alert, commands, getController, resolveCollision],
  );

  const sliceAtTicks = useCallback((
    sliceTicks: readonly number[],
    label: string,
    unavailableMessage: string,
  ): void => {
    const controller = getController();
    const selectedNotes = controller?.getSelectedNotes() ?? [];

    if (controller === null || selectedNotes.length === 0) {
      return;
    }

    const clipId = getActiveClip(commands.getState()).id;
    const plan = buildSliceCommandsForNotesAtTicks(
      clipId,
      selectedNotes,
      sliceTicks,
      Date.now(),
      nextSequence(),
    );

    if (plan.commands.length === 0) {
      alert(
        "Slice unavailable",
        unavailableMessage,
      );
      return;
    }

    try {
      const nextState = commands.dispatch(
        plan.commands,
        label,
        { clipId, noteIds: plan.resultingNoteIds },
      );

      if (nextState !== null) {
        controller.replaceSelection(
          findNotesByIds(nextState, clipId, plan.resultingNoteIds),
        );
      }
    } catch (error: unknown) {
      alert(
        "Slice unavailable",
        error instanceof CommandRejectedError
          ? error.message
          : "The selected notes could not be sliced.",
        "danger",
      );
    }
  }, [alert, commands, getController, nextSequence]);

  const sliceAtPlayhead = useCallback((): void => {
    sliceAtTicks(
      [Math.round(getPlayheadTick())],
      "Slice selected notes at playhead",
      "The playhead must cross the interior of at least one selected note.",
    );
  }, [getPlayheadTick, sliceAtTicks]);

  const sliceAtLoopAnchors = useCallback((): void => {
    const loop = getActiveClip(commands.getState()).transportSettings.loop;

    sliceAtTicks(
      [loop.startTick, loop.endTick],
      "Slice selected notes at loop anchors",
      "At least one loop anchor must cross the interior of a selected note.",
    );
  }, [commands, sliceAtTicks]);

  const paste = useCallback((): void => {
    const clipboard = getClipboard();

    if (clipboard === null) {
      return;
    }

    const resolutionTicks = getGridResolutionTicks();
    const pasteTick =
      Math.round(getPlayheadTick() / resolutionTicks)
      * resolutionTicks;
    const timestamp = Date.now();
    const sequence = nextSequence();
    const pastedNotes = createPastedNotes(
      clipboard,
      pasteTick,
      timestamp,
      sequence,
    );
    const pastedMarkerGroups = createPastedMarkerGroups(
      clipboard,
      pasteTick,
    );
    const state = commands.getState();
    const activeClip = getActiveClip(state);
    const requiredMeasureCount =
      getRequiredMeasureCountForTimelineContent(
        state,
        activeClip.id,
        pastedNotes,
        pastedMarkerGroups,
      );
    const currentMeasureCount = getMeasureCount(
      state.clock.ppqn,
      activeClip.timeline.timeMap,
      activeClip.timeline.durationTicks,
    );
    const timelineCommands =
      requiredMeasureCount > currentMeasureCount
        ? [{
            type: "AppendMeasures" as const,
            clipId: activeClip.id,
            count: requiredMeasureCount - currentMeasureCount,
          }]
        : [];

    if (
      !canPlacePastedTimelineContent(
        state,
        activeClip.id,
        pastedNotes,
        pastedMarkerGroups,
      )
    ) {
      alert(
        "Paste unavailable",
        "Paste is unavailable because it exceeds the clip limit, contains an invalid timeline position, or targets an unavailable instrument.",
      );
      return;
    }

    let markerPlan: ReturnType<typeof planPastedMarkerCommands>;

    try {
      markerPlan = planPastedMarkerCommands(
        state,
        activeClip.id,
        pastedMarkerGroups,
      );
    } catch (error: unknown) {
      alert(
        "Paste unavailable",
        error instanceof Error
          ? error.message
          : "The copied markers could not be pasted.",
        "danger",
      );
      return;
    }

    const pasteLabel = getClipboardActionLabel("Paste", clipboard);
    const pastedNoteIds = pastedNotes.map((note) => note.id);
    const markerGroupsAfterPaste = markerPlan.resultingMarkerGroups;
    const noteCommands = buildAddNoteCommands(activeClip.id, pastedNotes);
    const applyPastedSelection = (
      nextState: ProjectState,
      selectedNoteIds: readonly NoteId[],
    ): void => {
      selection.replaceFromIdentifiers(
        nextState,
        selectedNoteIds,
        markerGroupsAfterPaste,
        () => true,
      );
      getController()?.refreshSelection();
    };
    const dispatchPaste = (
      pasteCommands: Parameters<EditorCommandPort["dispatch"]>[0],
      transactionLabel = pasteLabel,
      selectedNoteIds: readonly NoteId[] = pastedNoteIds,
    ): void => {
      try {
        const nextState = commands.dispatch(
          pasteCommands,
          transactionLabel,
          {
            clipId: activeClip.id,
            noteIds: selectedNoteIds,
            markerGroups: markerGroupsAfterPaste,
          },
        );

        if (nextState !== null) {
          applyPastedSelection(nextState, selectedNoteIds);
        }
      } catch (error: unknown) {
        alert(
          "Paste unavailable",
          error instanceof Error
            ? error.message
            : "The copied notes and markers could not be pasted.",
          "danger",
        );
      }
    };
    const requestMarkerOverwrite = (
      preparedNoteResolution?: PreparedNoteCollisionResolution,
    ): void => {
      resolveMarkerCollision({
        label: pasteLabel,
        collisions: markerPlan.collisions,
        onOverwrite(): void {
          dispatchPaste(
            [
              ...timelineCommands,
              ...markerPlan.overwriteCommands,
              ...(preparedNoteResolution?.commands ?? noteCommands),
            ],
            preparedNoteResolution?.transactionLabel ?? pasteLabel,
            preparedNoteResolution?.selectedNoteIds ?? pastedNoteIds,
          );
        },
      });
    };

    const intent = {
      originalNotes: [],
      proposedNotes: pastedNotes,
    } as const;

    if (hasNoteEditCollisions(state, activeClip.id, intent)) {
      resolveCollision({
        clipId: activeClip.id,
        label: pasteLabel,
        collisionCount: countNoteEditCollisions(
          state,
          activeClip.id,
          intent,
        ),
        ...intent,
        prefixCommands: [
          ...timelineCommands,
          ...markerPlan.commands,
        ],
        selectionAfterMarkerGroups: markerGroupsAfterPaste,
        onResolved(nextState, selectedNoteIds): void {
          applyPastedSelection(nextState, selectedNoteIds);
        },
        ...(markerPlan.collisions.length === 0
          ? {}
          : {
              onResolutionPrepared(
                resolution: PreparedNoteCollisionResolution,
              ): void {
                requestMarkerOverwrite(resolution);
              },
            }),
      });
      return;
    }

    if (markerPlan.collisions.length > 0) {
      requestMarkerOverwrite();
      return;
    }

    dispatchPaste(
      [
        ...timelineCommands,
        ...markerPlan.commands,
        ...noteCommands,
      ],
    );
  }, [
    alert,
    commands,
    getController,
    getGridResolutionTicks,
    getClipboard,
    getPlayheadTick,
    nextSequence,
    resolveCollision,
    resolveMarkerCollision,
    selection,
  ]);

  return {
    clipboardAvailable,
    clearClipboard,
    undo,
    redo,
    copy,
    cut,
    remove,
    toggleFrozen,
    transform,
    sliceAtPlayhead,
    sliceAtLoopAnchors,
    paste,
    transferToInstrument,
  };
}

function getClipboardActionLabel(
  action: "Cut" | "Paste",
  clipboard: {
    readonly notes: readonly unknown[];
    readonly markerGroups: readonly unknown[];
  },
): string {
  if (clipboard.notes.length > 0 && clipboard.markerGroups.length > 0) {
    return `${action} timeline selection`;
  }

  return clipboard.markerGroups.length > 0
    ? `${action} markers`
    : `${action} notes`;
}
