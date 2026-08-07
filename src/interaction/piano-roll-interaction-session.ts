import {
  EditorSelection,
  type NoteSelectionPredicate,
} from "../application/editor-selection";
import type {
  Note,
  NoteId,
} from "../domain/model";
import {
  CoordinateConverter,
  type ViewportState,
} from "../geometry/converter";
import {
  createInteractionDraft,
  type InteractionDraft,
} from "./core/state";

export interface InteractionTapState {
  noteId: NoteId | null;
  timeStamp: number;
  clientX: number;
  clientY: number;
}

/**
 * Stable, non-React state for one mounted piano-roll editor. High-frequency
 * mutable buffers live here so React hooks only bind lifecycle and callbacks.
 */
export class PianoRollInteractionSession {
  public readonly draft: InteractionDraft = createInteractionDraft();
  public readonly selection = new EditorSelection();
  public readonly collisionBuffer: Note[] = [];
  public readonly lassoBuffer: Note[] = [];
  public readonly tapState: InteractionTapState = {
    noteId: null,
    timeStamp: 0,
    clientX: 0,
    clientY: 0,
  };
  public readonly converter: CoordinateConverter;

  private readonly gestureSelectionSnapshot: Note[] = [];
  private converterVersion: number;
  private gestureSelectionRestored = false;
  private noteSequence = 0;

  public constructor(
    initialViewport: ViewportState,
    initialViewportVersion: number,
  ) {
    this.converter = new CoordinateConverter(initialViewport);
    this.converterVersion = initialViewportVersion;
  }

  public synchronizeConverter(
    viewport: ViewportState,
    viewportVersion: number,
  ): CoordinateConverter {
    if (this.converterVersion !== viewportVersion) {
      this.converter.setViewportState(viewport);
      this.converterVersion = viewportVersion;
    }

    return this.converter;
  }

  public resetDraft(): void {
    this.draft.mode = "IDLE";
    this.draft.pointerId = -1;
    this.draft.deltaTicks = 0;
    this.draft.deltaPitch = 0;
    this.draft.minimumResizeDeltaTicks = Number.NEGATIVE_INFINITY;
    this.draft.maximumResizeDeltaTicks = Number.POSITIVE_INFINITY;
    this.draft.maximumSelectedEndTick = 0;
    this.draft.originResizeTick = 0;
    this.draft.targetNoteId = null;
    this.draft.drawStartTick = 0;
    this.draft.drawPitch = 0;
    this.draft.drawDurationTicks = 0;
    this.draft.drawVoiceId = null;
    this.draft.additiveSelection = false;
    this.draft.selectionMode = "replace";
  }

  public captureGestureSelection(): void {
    this.gestureSelectionSnapshot.length = 0;

    for (const note of this.selection.notes) {
      this.gestureSelectionSnapshot.push(note);
    }

    this.gestureSelectionRestored = false;
  }

  public restoreGestureSelectionOnce(
    predicate: NoteSelectionPredicate,
  ): boolean {
    if (this.gestureSelectionRestored) {
      return false;
    }

    this.selection.clear();

    for (const note of this.gestureSelectionSnapshot) {
      if (predicate(note)) {
        this.selection.add(note);
      }
    }

    this.gestureSelectionRestored = true;
    return true;
  }

  public createNoteId(
    timestampMilliseconds: number,
  ): NoteId {
    this.noteSequence += 1;
    return `note-${timestampMilliseconds}-${this.noteSequence}`;
  }
}
