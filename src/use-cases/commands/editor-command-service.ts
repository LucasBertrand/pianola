import type {
  PianoRollCommand,
} from "../../domain/commands/command-types";
import type { Transaction } from "../../domain/commands/transaction";
import {
  type ClipId,
} from "../../domain/identifiers";
import {
  type ProjectState,
} from "../../domain/project/project-document";
import type {
  ProjectStorePort,
} from "../../domain/project-store";

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
  dispatch(
    commands: readonly PianoRollCommand[],
    label: string,
  ): ProjectState | null;
}

/**
 * Owns transaction identity for every editor entry point. One shared service
 * prevents UI modules from maintaining competing timestamp and sequence
 * schemes while preserving the store's existing undo/redo semantics.
 */
export class EditorCommandService implements EditorCommandPort {
  private sequence = 0;

  public constructor(
    private readonly projectStore: ProjectStorePort,
  ) {}

  public getState(): ProjectState {
    return this.projectStore.getState();
  }

  public selectClip(clipId: ClipId): ProjectState {
    return this.projectStore.selectClip(clipId);
  }

  public dispatch(
    commands: readonly PianoRollCommand[],
    label: string,
  ): ProjectState | null {
    if (commands.length === 0) {
      return null;
    }

    this.sequence += 1;
    const timestamp = Date.now();
    const transaction: Transaction = {
      transactionId: `editor-${timestamp}-${this.sequence}`,
      label,
      createdAt: timestamp,
      commands,
    };

    return this.projectStore.dispatch(transaction);
  }
}
