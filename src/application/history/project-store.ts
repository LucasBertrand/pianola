import {
  projectReducer,
} from "../../domain/commands/reducer";
import type { Transaction } from "../../domain/commands/transaction";
import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import {
  type ClipId,
} from "../../domain/identifiers";
import {
  getClipPlaybackOrder,
} from "../../domain/clips/clip-hierarchy";
import {
  type ProjectDocument,
  type EditorSessionState,
} from "../../domain/project/project-document";

export type ProjectStoreListener = (
  state: EditorSessionState,
  previousState: EditorSessionState,
  transaction: Transaction,
) => void;

export interface ProjectStorePort {
  getState(): EditorSessionState;
  dispatch(transaction: Transaction): EditorSessionState;
  selectClip(clipId: ClipId): EditorSessionState;
  replaceState(state: EditorSessionState, label?: string): EditorSessionState;
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): EditorSessionState;
  redo(): EditorSessionState;
  subscribe(listener: ProjectStoreListener): () => void;
}

export class ProjectStore implements ProjectStorePort {
  private currentState: EditorSessionState;
  private readonly pastDocuments: ProjectDocument[] = [];
  private readonly futureDocuments: ProjectDocument[] = [];
  private readonly listeners = new Set<ProjectStoreListener>();
  private historySequence = 0;

  public constructor(initialState: EditorSessionState) {
    this.currentState = initialState;
  }

  public getState(): EditorSessionState {
    return this.currentState;
  }

  public dispatch(transaction: Transaction): EditorSessionState {
    const previousState = this.currentState;
    const nextState = projectReducer(previousState, transaction);

    if (nextState === previousState) {
      return previousState;
    }

    this.pastDocuments.push(toProjectDocument(previousState));

    if (
      this.pastDocuments.length
      > PROJECT_CONSTANTS.maximumHistoryEntries
    ) {
      this.pastDocuments.shift();
    }

    this.futureDocuments.length = 0;
    this.currentState = preserveWorkspace(nextState, previousState);
    this.notify(this.currentState, previousState, transaction);

    return this.currentState;
  }

  public selectClip(clipId: ClipId): EditorSessionState {
    if (
      this.currentState.clipsById[clipId] === undefined
      || this.currentState.workspace.activeClipId === clipId
    ) {
      return this.currentState;
    }

    const previousState = this.currentState;
    this.currentState = {
      ...previousState,
      workspace: { ...previousState.workspace, activeClipId: clipId },
    };
    this.notify(
      this.currentState,
      previousState,
      this.createHistoryTransaction("Select clip"),
    );
    return this.currentState;
  }

  public replaceState(
    state: EditorSessionState,
    label = "Replace project",
  ): EditorSessionState {
    const previousState = this.currentState;

    this.pastDocuments.length = 0;
    this.futureDocuments.length = 0;
    this.currentState = {
      ...state,
      revision: previousState.revision + 1,
    };
    this.notify(
      this.currentState,
      previousState,
      this.createHistoryTransaction(label),
    );

    return this.currentState;
  }

  public canUndo(): boolean {
    return this.pastDocuments.length > 0;
  }

  public canRedo(): boolean {
    return this.futureDocuments.length > 0;
  }

  public undo(): EditorSessionState {
    const previousSnapshot = this.pastDocuments.pop();

    if (previousSnapshot === undefined) {
      return this.currentState;
    }

    const previousState = this.currentState;
    this.futureDocuments.push(toProjectDocument(previousState));
    this.currentState = {
      ...previousSnapshot,
      workspace: resolveWorkspace(previousSnapshot, previousState),
      revision: previousState.revision + 1,
    };
    this.notify(
      this.currentState,
      previousState,
      this.createHistoryTransaction("Undo"),
    );

    return this.currentState;
  }

  public redo(): EditorSessionState {
    const nextSnapshot = this.futureDocuments.pop();

    if (nextSnapshot === undefined) {
      return this.currentState;
    }

    const previousState = this.currentState;
    this.pastDocuments.push(toProjectDocument(previousState));

    if (
      this.pastDocuments.length
      > PROJECT_CONSTANTS.maximumHistoryEntries
    ) {
      this.pastDocuments.shift();
    }

    this.currentState = {
      ...nextSnapshot,
      workspace: resolveWorkspace(nextSnapshot, previousState),
      revision: previousState.revision + 1,
    };
    this.notify(
      this.currentState,
      previousState,
      this.createHistoryTransaction("Redo"),
    );

    return this.currentState;
  }

  public subscribe(listener: ProjectStoreListener): () => void {
    this.listeners.add(listener);

    return (): void => {
      this.listeners.delete(listener);
    };
  }

  private createHistoryTransaction(label: string): Transaction {
    this.historySequence += 1;
    const timestamp = Date.now();

    return {
      transactionId:
        `history-${timestamp}-${this.historySequence}`,
      label,
      createdAt: timestamp,
      commands: [],
    };
  }

  private notify(
    state: EditorSessionState,
    previousState: EditorSessionState,
    transaction: Transaction,
  ): void {
    for (const listener of this.listeners) {
      listener(state, previousState, transaction);
    }
  }
}

function toProjectDocument(state: EditorSessionState): ProjectDocument {
  const { workspace: _workspace, ...projectDocument } = state;
  return projectDocument;
}

function preserveWorkspace(
  snapshot: EditorSessionState,
  currentState: EditorSessionState,
): EditorSessionState {
  return {
    ...snapshot,
    workspace: resolveWorkspace(snapshot, currentState),
  };
}

function resolveWorkspace(
  projectDocument: ProjectDocument,
  currentState: EditorSessionState,
): EditorSessionState["workspace"] {
  if (
    projectDocument.clipsById[currentState.workspace.activeClipId]
      !== undefined
  ) {
    return currentState.workspace;
  }

  const fallbackClipId = getClipPlaybackOrder(projectDocument.clipHierarchy)[0];

  if (fallbackClipId === undefined) {
    throw new Error("A project document must contain at least one clip.");
  }

  return { ...currentState.workspace, activeClipId: fallbackClipId };
}
