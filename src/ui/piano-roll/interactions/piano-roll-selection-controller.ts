import {
  getActiveClip,
} from "../../../domain/project/project-document";
import {
  type InstrumentId,
  type NoteId,
} from "../../../domain/identifiers";
import {
  isNoteEditable,
  type Note,
} from "../../../domain/notes/note";
import type {
  ViewportState,
} from "../../../editor/geometry/converter";
import type {
  PianoRollControllerPort,
} from "../../../editor/interactions/piano-roll-controller-port";
import type {
  PianoRollInteractionSession,
} from "../../../editor/interactions/piano-roll-interaction-session";
import type {
  ReadonlyRenderSignal,
} from "../../../editor/model/render-signal";
import type {
  EditorSelectionRequest,
} from "../../../editor/selection/editor-selection-requests";
import type {
  EditorCommandPort,
} from "../../../use-cases/commands/editor-command-service";
import type {
  InteractionVisualController,
} from "./interaction-visual-controller";

export interface PianoRollSelectionControllerOptions {
  readonly session: PianoRollInteractionSession;
  readonly viewport: ReadonlyRenderSignal<ViewportState>;
  readonly editorCommands: EditorCommandPort;
  readonly getVisuals: () => InteractionVisualController | null;
  readonly onSelectionChange:
    | ((
      hasSelection: boolean,
      soleInstrumentId: InstrumentId | null,
    ) => void)
    | undefined;
}

/** Owns the imperative selection API exposed outside the overlay. */
export class PianoRollSelectionController
implements PianoRollControllerPort {
  public constructor(
    private readonly options: PianoRollSelectionControllerOptions,
  ) {}

  public get selection() {
    return this.options.session.selection;
  }

  public showSelection(): void {
    const { session, viewport } = this.options;

    this.options.getVisuals()?.showSelection(
      session.selection.notes,
      session.synchronizeConverter(viewport.get(), viewport.version),
    );
    this.publishSelectionState();
  }

  public isNoteEditable(note: Note): boolean {
    return isNoteEditable(note);
  }

  public isSelectedNoteEditable(note: Note): boolean {
    return this.selection.has(note.id) && this.isNoteEditable(note);
  }

  public selectHitNote(note: Note, additive: boolean): void {
    if (!this.selection.has(note.id)) {
      if (!additive) {
        this.clearSelection();
      }

      this.selection.add(note);
    }

    this.showSelection();
  }

  public removeHitNote(noteId: NoteId): void {
    if (this.selection.delete(noteId)) {
      this.showSelection();
    }
  }

  public restoreGestureSelection(): void {
    if (
      this.options.session.restoreGestureSelectionOnce(
        () => true,
      )
    ) {
      this.showSelection();
    }
  }

  public handleRequest(request: EditorSelectionRequest): void {
    if (request.type === "clear") {
      this.clearSelection();
      return;
    }

    const state = this.options.editorCommands.getState();
    const activeClip = getActiveClip(state);
    const isSelectable = (): boolean => true;

    this.selection.reconcile(state, isSelectable);

    if (request.type === "selectAllNotes") {
      const notes: Note[] = [];

      for (const instrumentId of state.instrumentOrder) {
        const track = activeClip.tracksByInstrumentId[instrumentId];

        if (track === undefined) {
          continue;
        }

        notes.push(...Object.values(track.notesById));
      }

      this.selection.replace(notes);
      this.showSelection();
      return;
    }

    if (
      state.projectInstrumentsById[request.instrumentId] === undefined
    ) {
      this.showSelection();
      return;
    }

    this.selection.toggleInstrument(
      state,
      request.instrumentId,
      isSelectable,
    );
    this.showSelection();
  }

  public getSelectedNotes(): readonly Note[] {
    return this.selection.copyNotes();
  }

  public replaceSelection(notes: readonly Note[]): void {
    this.selection.replace(notes);
    this.showSelection();
  }

  public refreshSelection(): void {
    this.showSelection();
  }

  public removeInstrumentFromSelection(instrumentId: InstrumentId): void {
    this.selection.retain((note) => note.instrumentId !== instrumentId);
    this.showSelection();
  }

  public togglePitchSelection(pitch: number): void {
    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
      return;
    }

    const state = this.options.editorCommands.getState();
    const changed = this.selection.togglePitch(
      state,
      pitch,
      () => true,
    );

    if (changed) {
      this.showSelection();
    }
  }

  public cancel(): void {
    const visuals = this.options.getVisuals();

    visuals?.endDrag();
    visuals?.endResize();
    visuals?.endDraw();
    visuals?.endLasso();
    this.options.session.gesture.reset();
    this.showSelection();
  }

  public clearSelection(): void {
    this.selection.clear();
    this.options.getVisuals()?.clearSelection();
    this.options.onSelectionChange?.(false, null);
  }

  private publishSelectionState(): void {
    this.options.onSelectionChange?.(
      this.selection.size > 0,
      this.selection.getSoleInstrumentId(),
    );
  }
}
