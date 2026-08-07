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
import {
  PianoRollGestureStateMachine,
} from "./core/gesture-state-machine";

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
  public readonly gesture = new PianoRollGestureStateMachine(
    this.draft,
  );
  public readonly selection = new EditorSelection();
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
    this.gesture.reset();
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
