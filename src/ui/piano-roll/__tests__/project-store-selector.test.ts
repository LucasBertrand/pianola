import { describe, expect, test } from "vitest";
import type {
  ProjectStoreListener,
} from "../../../application/history/project-store";
import {
  createBlankEditorSessionState,
} from "../../../use-cases/project-files/create-initial-project";
import {
  createProjectStoreSelectorAdapter,
} from "../project-store-selector";

describe("project store selector adapter", () => {
  test("keeps the selected snapshot reference stable", () => {
    const source = new SelectorTestStore();
    const adapter = createProjectStoreSelectorAdapter(
      source,
      (state) => state.workspace,
    );
    const first = adapter.getSnapshot();

    source.publish({ ...source.getState(), title: "Renamed" });

    expect(adapter.getSnapshot()).toBe(first);
  });

  test("does not notify when an unrelated projection changes", () => {
    const source = new SelectorTestStore();
    const adapter = createProjectStoreSelectorAdapter(
      source,
      (state) => state.workspace.activeClipId,
    );
    let notifications = 0;
    const unsubscribe = adapter.subscribe(() => {
      notifications += 1;
    });

    source.publish({ ...source.getState(), title: "Renamed" });
    expect(notifications).toBe(0);

    unsubscribe();
  });

  test("notifies once and publishes the new reference when selected state changes", () => {
    const source = new SelectorTestStore();
    const adapter = createProjectStoreSelectorAdapter(
      source,
      (state) => state.title,
    );
    let notifications = 0;
    const unsubscribe = adapter.subscribe(() => {
      notifications += 1;
    });

    source.publish({ ...source.getState(), title: "Renamed" });

    expect(notifications).toBe(1);
    expect(adapter.getSnapshot()).toBe("Renamed");
    unsubscribe();
  });
});

class SelectorTestStore {
  private state = createBlankEditorSessionState();
  private readonly listeners = new Set<ProjectStoreListener>();

  public getState(): ReturnType<typeof createBlankEditorSessionState> {
    return this.state;
  }

  public subscribe(listener: ProjectStoreListener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  public publish(state: ReturnType<typeof createBlankEditorSessionState>): void {
    const previousState = this.state;
    this.state = state;

    for (const listener of this.listeners) {
      listener(state, previousState, {
        transactionId: "selector-test",
        label: "Selector test",
        createdAt: 0,
        commands: [],
      });
    }
  }
}
