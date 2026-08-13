import type {
  Note,
  Tick,
} from "./model";
import {
  SelectionTransformationError,
  transformNoteSelection,
  type SelectionTransformationKind,
} from "./selection-transformations";

export type NoteTransformationSourceKind = "clip" | "pattern";

/** Identifies the musical source transformed by a pure operation. */
export interface NoteTransformationTarget {
  readonly sourceKind: NoteTransformationSourceKind;
  readonly sourceId: string;
  readonly durationTicks: Tick;
}

export interface TargetedNoteTransformationPlan {
  readonly target: NoteTransformationTarget;
  readonly transformation: SelectionTransformationKind;
  readonly notes: readonly Note[];
}

/**
 * Builds an immutable transformation projection without reading project or
 * workspace state. The same engine can therefore target clips and future
 * pattern sources.
 */
export function createTargetedNoteTransformationPlan(
  target: NoteTransformationTarget,
  notes: readonly Note[],
  transformation: SelectionTransformationKind,
): TargetedNoteTransformationPlan {
  if (target.sourceId.trim().length === 0) {
    throw new SelectionTransformationError(
      "A transformation target must have a source identifier.",
    );
  }

  if (!Number.isSafeInteger(target.durationTicks) || target.durationTicks <= 0) {
    throw new SelectionTransformationError(
      "A transformation target must have a positive duration.",
    );
  }

  return {
    target: { ...target },
    transformation,
    notes: transformNoteSelection(
      notes,
      transformation,
      target.durationTicks,
    ),
  };
}
