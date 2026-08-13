import {
  projectReducer,
  type Transaction,
} from "./commands";
import {
  PROJECT_CONSTANTS,
} from "../config/domain-limits";
import type {
  ProjectState,
} from "./model";

export type ProjectStoreListener = (
  state: ProjectState,
  previousState: ProjectState,
  transaction: Transaction,
) => void;

export interface ProjectStorePort {
  getState(): ProjectState;
  dispatch(transaction: Transaction): ProjectState;
  replaceState(state: ProjectState, label?: string): ProjectState;
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): ProjectState;
  redo(): ProjectState;
  subscribe(listener: ProjectStoreListener): () => void;
}

export class ProjectStore implements ProjectStorePort {
  private currentState: ProjectState;
  private readonly pastStates: ProjectState[] = [];
  private readonly futureStates: ProjectState[] = [];
  private readonly listeners = new Set<ProjectStoreListener>();
  private historySequence = 0;

  public constructor(initialState: ProjectState) {
    this.currentState = initialState;
  }

  public getState(): ProjectState {
    return this.currentState;
  }

  public dispatch(transaction: Transaction): ProjectState {
    const previousState = this.currentState;
    const nextState = projectReducer(previousState, transaction);

    if (nextState === previousState) {
      return previousState;
    }

    if (isClipActivationTransaction(transaction)) {
      // Navigation changes the editing context without invalidating redo or
      // consuming an undo step. Musical edits remain globally ordered.
      this.currentState = nextState;
      this.notify(nextState, previousState, transaction);
      return nextState;
    }

    this.pastStates.push(previousState);

    if (
      this.pastStates.length
      > PROJECT_CONSTANTS.maximumHistoryEntries
    ) {
      this.pastStates.shift();
    }

    this.futureStates.length = 0;
    this.currentState = nextState;
    this.notify(nextState, previousState, transaction);

    return nextState;
  }

  public replaceState(
    state: ProjectState,
    label = "Replace project",
  ): ProjectState {
    const previousState = this.currentState;

    this.pastStates.length = 0;
    this.futureStates.length = 0;
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
    return this.pastStates.length > 0;
  }

  public canRedo(): boolean {
    return this.futureStates.length > 0;
  }

  public undo(): ProjectState {
    const previousSnapshot = this.pastStates.pop();

    if (previousSnapshot === undefined) {
      return this.currentState;
    }

    const previousState = this.currentState;
    this.futureStates.push(previousState);
    this.currentState = {
      ...preserveActiveClip(previousSnapshot, previousState),
      revision: previousState.revision + 1,
    };
    this.notify(
      this.currentState,
      previousState,
      this.createHistoryTransaction("Undo"),
    );

    return this.currentState;
  }

  public redo(): ProjectState {
    const nextSnapshot = this.futureStates.pop();

    if (nextSnapshot === undefined) {
      return this.currentState;
    }

    const previousState = this.currentState;
    this.pastStates.push(previousState);

    if (
      this.pastStates.length
      > PROJECT_CONSTANTS.maximumHistoryEntries
    ) {
      this.pastStates.shift();
    }

    this.currentState = {
      ...preserveActiveClip(nextSnapshot, previousState),
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
    state: ProjectState,
    previousState: ProjectState,
    transaction: Transaction,
  ): void {
    for (const listener of this.listeners) {
      listener(state, previousState, transaction);
    }
  }
}

function isClipActivationTransaction(
  transaction: Transaction,
): boolean {
  return (
    transaction.commands.length === 1
    && transaction.commands[0]?.type === "ActivateClip"
  );
}

function preserveActiveClip(
  snapshot: ProjectState,
  currentState: ProjectState,
): ProjectState {
  // Undo/redo restores musical data globally while keeping the user's current
  // editing context whenever that clip still exists in the target snapshot.
  return snapshot.clipsById[currentState.activeClipId] === undefined
    ? snapshot
    : {
        ...snapshot,
        activeClipId: currentState.activeClipId,
      };
}
