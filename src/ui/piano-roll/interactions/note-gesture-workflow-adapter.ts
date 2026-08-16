import {
  EDITOR_CONSTANTS,
} from "../../../config/editor-config";
import {
  type Note,
} from "../../../domain/notes/note";
import {
  type NoteId,
} from "../../../domain/identifiers";
import type {
  GestureCompletion,
} from "../../../editor/interactions/gestures/gesture-state-machine";
import {
  buildRepositionedNotes,
} from "../../../editor/interactions/gestures/note-gesture-math";
import type {
  EditorSelection,
} from "../../../editor/selection/editor-selection";
import type {
  EditorCommandPort,
} from "../../../use-cases/commands/editor-command-service";
import type {
  NoteCollisionResolutionRequest,
} from "../../../use-cases/piano-roll/notes/note-collision-resolution";
import {
  NoteGestureWorkflow,
} from "../../../use-cases/piano-roll/notes/note-gesture-workflow";

export interface NoteGestureWorkflowAdapterOptions {
  readonly editorCommands: EditorCommandPort;
  readonly selection: EditorSelection;
  readonly onSelectionChanged: () => void;
  readonly onCollision:
    | ((request: NoteCollisionResolutionRequest) => void)
    | undefined;
  readonly onTransactionRejected:
    | ((error: unknown) => void)
    | undefined;
}

/** Translates completed pointer gestures into the note workflow intentions. */
export class NoteGestureWorkflowAdapter {
  private readonly workflow: NoteGestureWorkflow;

  public constructor(
    private readonly options: NoteGestureWorkflowAdapterOptions,
  ) {
    this.workflow = new NoteGestureWorkflow(
      options.editorCommands,
      options.selection,
      {
        onCollision: options.onCollision,
        onTransactionRejected: options.onTransactionRejected,
        onSelectionChanged: options.onSelectionChanged,
      },
    );
  }

  public commitDelete(note: Note, includeSelection = true): boolean {
    const { selection } = this.options;
    const deleteSelection = includeSelection && selection.has(note.id);
    const result = this.workflow.commitDelete(
      deleteSelection ? selection.notes : [note],
      deleteSelection ? "Delete selected notes" : "Delete note",
    );

    if (result === "committed") {
      selection.clear();
      return true;
    }

    return false;
  }

  public commitMove(completion: GestureCompletion): void {
    if (completion.deltaTicks === 0 && completion.deltaPitch === 0) {
      return;
    }

    this.workflow.commitMove(
      buildRepositionedNotes(
        this.options.selection.notes,
        completion.deltaTicks,
        completion.deltaPitch,
        completion.getSnapSettingsAtTick,
      ),
    );
  }

  public commitResize(completion: GestureCompletion): void {
    if (completion.deltaTicks === 0) {
      return;
    }

    this.workflow.commitResize(
      completion.deltaTicks,
      completion.mode === "RESIZING_START" ? "start" : "end",
    );
  }

  public commitDraw(
    completion: GestureCompletion,
    noteId: NoteId,
  ): void {
    if (completion.drawInstrumentId === null) {
      return;
    }

    this.workflow.commitDraw({
      id: noteId,
      pitch: completion.drawPitch,
      startTick: completion.drawStartTick,
      durationTicks: completion.drawDurationTicks,
      velocity: EDITOR_CONSTANTS.defaultDrawVelocity,
      instrumentId: completion.drawInstrumentId,
      enabled: true,
    });
  }
}
