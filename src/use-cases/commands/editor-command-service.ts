import type {
  PianoRollCommand,
} from "../../domain/commands/command-types";
import type { Transaction } from "../../domain/commands/transaction";
import {
  type ClipId,
  type NoteId,
} from "../../domain/identifiers";
import {
  getActiveClip,
  type ProjectState,
} from "../../domain/project/project-document";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import {
  EditorSelection,
} from "../../editor/selection/editor-selection";

export interface EditorSelectionHistoryTarget {
  readonly clipId: ClipId;
  readonly noteIds: readonly NoteId[];
}

interface EditorSelectionHistoryEntry {
  readonly before: EditorSelectionHistoryTarget;
  readonly after: EditorSelectionHistoryTarget;
}

/** Read-only project access exposed across the application boundary. */
export interface ProjectStateReader {
  getState(): ProjectState;
}

/**
 * Commits semantic editor commands without exposing transaction bookkeeping
 * to React components or pointer-input adapters.
 */
export interface EditorCommandPort extends ProjectStateReader {
  selectClip(clipId: ClipId): ProjectState;
  replaceState(state: ProjectState, label?: string): ProjectState;
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): ProjectState;
  redo(): ProjectState;
  dispatch(
    commands: readonly PianoRollCommand[],
    label: string,
    selectionAfter?: EditorSelectionHistoryTarget,
  ): ProjectState | null;
}

/**
 * Owns transaction identity and transient selection checkpoints for every
 * editor entry point. Selection checkpoints stay out of the project document
 * while making undo and redo restore the notes targeted by each intention.
 */
export class EditorCommandService implements EditorCommandPort {
  private sequence = 0;
  private readonly pastSelectionEntries: EditorSelectionHistoryEntry[] = [];
  private readonly futureSelectionEntries: EditorSelectionHistoryEntry[] = [];

  public constructor(
    private readonly projectStore: ProjectStorePort,
    private readonly selection: EditorSelection = new EditorSelection(),
  ) {}

  public getState(): ProjectState {
    return this.projectStore.getState();
  }

  public selectClip(clipId: ClipId): ProjectState {
    return this.projectStore.selectClip(clipId);
  }

  public replaceState(
    state: ProjectState,
    label?: string,
  ): ProjectState {
    this.pastSelectionEntries.length = 0;
    this.futureSelectionEntries.length = 0;
    this.selection.clear();

    return label === undefined
      ? this.projectStore.replaceState(state)
      : this.projectStore.replaceState(state, label);
  }

  public canUndo(): boolean {
    return this.projectStore.canUndo();
  }

  public canRedo(): boolean {
    return this.projectStore.canRedo();
  }

  public undo(): ProjectState {
    if (!this.projectStore.canUndo()) {
      return this.projectStore.getState();
    }

    const entry = this.pastSelectionEntries.pop();
    const state = this.projectStore.undo();

    if (entry === undefined) {
      this.selection.clear();
      this.futureSelectionEntries.length = 0;
      return state;
    }

    this.futureSelectionEntries.push(entry);
    this.restoreSelection(state, entry.before);
    return state;
  }

  public redo(): ProjectState {
    if (!this.projectStore.canRedo()) {
      return this.projectStore.getState();
    }

    const entry = this.futureSelectionEntries.pop();
    const state = this.projectStore.redo();

    if (entry === undefined) {
      this.selection.clear();
      this.pastSelectionEntries.length = 0;
      return state;
    }

    this.pastSelectionEntries.push(entry);
    this.trimPastSelectionEntries();
    this.restoreSelection(state, entry.after);
    return state;
  }

  public dispatch(
    commands: readonly PianoRollCommand[],
    label: string,
    selectionAfter?: EditorSelectionHistoryTarget,
  ): ProjectState | null {
    if (commands.length === 0) {
      return null;
    }

    const previousState = this.projectStore.getState();
    const selectionBefore = this.captureSelection(previousState);
    this.sequence += 1;
    const timestamp = Date.now();
    const transaction: Transaction = {
      transactionId: `editor-${timestamp}-${this.sequence}`,
      label,
      createdAt: timestamp,
      commands,
    };

    const nextState = this.projectStore.dispatch(transaction);

    if (nextState !== previousState) {
      this.pastSelectionEntries.push({
        before: selectionBefore,
        after: selectionAfter === undefined
          ? selectionBefore
          : cloneSelectionTarget(selectionAfter),
      });
      this.trimPastSelectionEntries();
      this.futureSelectionEntries.length = 0;
    }

    return nextState;
  }

  private captureSelection(
    state: ProjectState,
  ): EditorSelectionHistoryTarget {
    return {
      clipId: state.workspace.activeClipId,
      noteIds: this.selection.notes.map((note) => note.id),
    };
  }

  private restoreSelection(
    state: ProjectState,
    target: EditorSelectionHistoryTarget,
  ): void {
    if (target.clipId !== state.workspace.activeClipId) {
      this.selection.clear();
      return;
    }

    const activeClip = getActiveClip(state);

    this.selection.replaceFromNoteIds(
      state,
      target.noteIds,
      (note) =>
        activeClip.instrumentStatesById[note.instrumentId]?.locked === false,
    );
  }

  private trimPastSelectionEntries(): void {
    if (
      this.pastSelectionEntries.length
      > PROJECT_CONSTANTS.maximumHistoryEntries
    ) {
      this.pastSelectionEntries.shift();
    }
  }
}

function cloneSelectionTarget(
  target: EditorSelectionHistoryTarget,
): EditorSelectionHistoryTarget {
  return {
    clipId: target.clipId,
    noteIds: target.noteIds.slice(),
  };
}
