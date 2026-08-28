import type {
  PianoRollCommand,
} from "../../domain/commands/command-types";
import type { Transaction } from "../../domain/commands/transaction";
import {
  type ClipId,
  type NoteId,
} from "../../domain/identifiers";
import { type EditorSessionState } from "../../domain/project/project-document";
import type {
  ProjectStorePort,
} from "./project-store";
import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import {
  EditorSelection,
  type SelectedTimeMapMarkerGroup,
} from "../../editor/selection/editor-selection";

export interface EditorSelectionHistoryTarget {
  readonly clipId: ClipId;
  readonly noteIds: readonly NoteId[];
  readonly markerGroups?: readonly SelectedTimeMapMarkerGroup[];
}

interface EditorSelectionHistoryEntry {
  readonly before: EditorSelectionHistoryTarget;
  readonly after: EditorSelectionHistoryTarget;
}

/** Read-only project access exposed across the application boundary. */
export interface ProjectStateReader {
  getState(): EditorSessionState;
}

/**
 * Commits semantic editor commands without exposing transaction bookkeeping
 * to React components or pointer-input adapters.
 */
export interface EditorCommandPort extends ProjectStateReader {
  selectClip(clipId: ClipId): EditorSessionState;
  replaceState(state: EditorSessionState, label?: string): EditorSessionState;
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): EditorSessionState;
  redo(): EditorSessionState;
  dispatch(
    commands: readonly PianoRollCommand[],
    label: string,
    selectionAfter?: EditorSelectionHistoryTarget,
  ): EditorSessionState | null;
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

  public getState(): EditorSessionState {
    return this.projectStore.getState();
  }

  public selectClip(clipId: ClipId): EditorSessionState {
    return this.projectStore.selectClip(clipId);
  }

  public replaceState(
    state: EditorSessionState,
    label?: string,
  ): EditorSessionState {
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

  public undo(): EditorSessionState {
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

  public redo(): EditorSessionState {
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
  ): EditorSessionState | null {
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
          : cloneSelectionTarget({
              ...selectionAfter,
              markerGroups:
                selectionAfter.markerGroups
                ?? selectionBefore.markerGroups
                ?? [],
            }),
      });
      this.trimPastSelectionEntries();
      this.futureSelectionEntries.length = 0;
    }

    return nextState;
  }

  private captureSelection(
    state: EditorSessionState,
  ): EditorSelectionHistoryTarget {
    return {
      clipId: state.workspace.activeClipId,
      noteIds: this.selection.notes.map((note) => note.id),
      markerGroups: cloneMarkerGroups(this.selection.markerGroups),
    };
  }

  private restoreSelection(
    state: EditorSessionState,
    target: EditorSelectionHistoryTarget,
  ): void {
    if (target.clipId !== state.workspace.activeClipId) {
      this.selection.clear();
      return;
    }

    this.selection.replaceFromIdentifiers(
      state,
      target.noteIds,
      target.markerGroups ?? [],
      () => true,
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
    markerGroups: cloneMarkerGroups(target.markerGroups ?? []),
  };
}

function cloneMarkerGroups(
  groups: readonly SelectedTimeMapMarkerGroup[],
): SelectedTimeMapMarkerGroup[] {
  return groups.map((group) => ({
    startTick: group.startTick,
    kinds: group.kinds.slice(),
  }));
}
