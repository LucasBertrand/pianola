import {
  useCallback,
  useRef,
} from "react";
import {
  createNoteCollisionResolutionPlan,
  type NoteCollisionResolutionMode,
} from "../../../domain/note-collision";
import type {
  EditorRuntime,
} from "../../../editor/runtime/editor-runtime";
import type {
  ApplicationDialogState,
  ShowApplicationAlert,
} from "../../../use-cases/dialogs/application-dialog-port";
import type {
  NoteCollisionResolutionRequest,
} from "../../../use-cases/piano-roll/notes/note-collision-resolution";

export interface NoteCollisionDialogWorkflowOptions {
  readonly runtime: EditorRuntime;
  readonly showDialog: (dialog: ApplicationDialogState | null) => void;
  readonly alert: ShowApplicationAlert;
}

/** Turns a note overlap into an explicit merge-or-slice transaction. */
export function useNoteCollisionDialogWorkflow({
  runtime,
  showDialog,
  alert,
}: NoteCollisionDialogWorkflowOptions): (
  request: NoteCollisionResolutionRequest,
) => void {
  const transactionSequenceRef = useRef(0);

  return useCallback((request: NoteCollisionResolutionRequest): void => {
    const resolveCollision = (
      mode: NoteCollisionResolutionMode,
    ): void => {
      const timestamp = Date.now();
      const plan = createNoteCollisionResolutionPlan(
        runtime.projectStore.getState(),
        request.clipId,
        {
          originalNotes: request.originalNotes,
          proposedNotes: request.proposedNotes,
        },
        mode,
        `${timestamp}-${transactionSequenceRef.current + 1}`,
      );
      const resultingSelectionNoteIds = [
        ...plan.resultingSelectionNoteIds,
        ...(request.retainedSelectionNoteIds ?? []),
      ];

      try {
        transactionSequenceRef.current += 1;
        const nextState = runtime.editorCommands.dispatch(
          [
            ...(request.prefixCommands ?? []),
            ...plan.commands,
          ],
          mode === "merge"
            ? `${request.label}: merge collisions`
            : `${request.label}: slice collisions`,
          {
            clipId: request.clipId,
            noteIds: resultingSelectionNoteIds,
          },
        );

        if (nextState !== null) {
          request.onResolved(
            nextState,
            resultingSelectionNoteIds,
          );
        }
      } catch (error: unknown) {
        alert(
          "Collision resolution unavailable",
          error instanceof Error
            ? error.message
            : "The note collision could not be resolved.",
          "danger",
        );
      }
    };
    const collisionLabel = request.collisionCount === 1
      ? "one collision"
      : `${request.collisionCount} collisions`;

    showDialog({
      title: "Resolve note collision",
      message:
        `This edit creates ${collisionLabel}. Merge creates continuous notes covering each overlap. Slice keeps the edited notes and cuts existing notes at their start and end anchors.`,
      confirmLabel: "Merge notes",
      alternateLabel: "Slice at anchors",
      cancelLabel: "Cancel",
      tone: "default",
      onConfirm(): void {
        resolveCollision("merge");
      },
      onAlternate(): void {
        resolveCollision("slice");
      },
    });
  }, [alert, runtime, showDialog]);
}
