import {
  useCallback,
} from "react";
import type {
  ApplicationDialogState,
} from "../../../use-cases/dialogs/application-dialog-port";
import type {
  MarkerCollisionResolutionRequest,
} from "../../../use-cases/piano-roll/timeline/marker-collision-resolution";

export interface MarkerCollisionDialogWorkflowOptions {
  readonly showDialog: (dialog: ApplicationDialogState | null) => void;
}

/** Presents the cancel-or-overwrite decision for occupied marker anchors. */
export function useMarkerCollisionDialogWorkflow({
  showDialog,
}: MarkerCollisionDialogWorkflowOptions): (
  request: MarkerCollisionResolutionRequest,
) => void {
  return useCallback((request: MarkerCollisionResolutionRequest): void => {
    const collisionLabel = request.collisions.length === 1
      ? "one collision"
      : `${String(request.collisions.length)} collisions`;

    showDialog({
      title: "Resolve marker collision",
      message:
        `This edit creates ${collisionLabel}. Overwrite replaces the destination markers before completing the edit.`,
      confirmLabel: "Overwrite markers",
      alternateLabel: null,
      cancelLabel: "Cancel",
      tone: "default",
      onConfirm: request.onOverwrite,
      onAlternate: null,
    });
  }, [showDialog]);
}
