import {
  projectReducer,
  type Transaction,
} from "./commands";
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
}

export class ProjectStore implements ProjectStorePort {
  private currentState: ProjectState;
  private readonly listeners = new Set<ProjectStoreListener>();

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

    this.currentState = nextState;

    for (const listener of this.listeners) {
      listener(nextState, previousState, transaction);
    }

    return nextState;
  }

  public subscribe(listener: ProjectStoreListener): () => void {
    this.listeners.add(listener);

    return (): void => {
      this.listeners.delete(listener);
    };
  }
}
