import {
  describe,
  expect,
  test,
} from "vitest";
import {
  ProjectStore,
} from "../../../domain/project-store";
import {
  createTestProject,
} from "../../../../tests/support/test-builders";
import {
  InMemoryProjectRepository,
} from "../../../infrastructure/persistence/memory/in-memory-project-repository";
import {
  DIRECT_STORED_PROJECT_CODEC,
} from "../../../infrastructure/persistence/codecs/direct-stored-project-codec";
import {
  createDefaultPersistedEditorWorkspace,
} from "../project-workspace";
import {
  ProjectAutosave,
} from "../project-autosave";
import type {
  AutosaveScheduler,
} from "../../../application/ports/autosave-scheduler";

describe("project autosave", () => {
  test("saves command, Undo and Redo as successive revisions", async () => {
    const initial = createTestProject();
    const repository = new InMemoryProjectRepository(
      DIRECT_STORED_PROJECT_CODEC,
    );
    await repository.save({
      documentId: "autosave-project",
      revision: 0,
      updatedAt: "2026-08-22T09:00:00.000Z",
      document: initial,
      workspace: createDefaultPersistedEditorWorkspace(initial),
    }, null);
    const store = new ProjectStore(initial);
    let time = 0;
    const autosave = new ProjectAutosave({
      documentId: "autosave-project",
      initialRevision: 1,
      repository,
      scheduler: NOOP_SCHEDULER,
      capture: () => ({
        document: store.getState(),
        workspace: createDefaultPersistedEditorWorkspace(store.getState()),
      }),
      now: () => `2026-08-22T09:00:0${++time}.000Z`,
    });
    store.subscribe(() => autosave.markDirty());

    store.dispatch({
      transactionId: "rename",
      createdAt: 1,
      commands: [{ type: "UpdateProjectTitle", title: "Renamed" }],
    });
    await autosave.flush();
    expect((await repository.load("autosave-project"))?.document.title)
      .toBe("Renamed");

    store.undo();
    await autosave.flush();
    expect((await repository.load("autosave-project"))?.document.title)
      .toBe(initial.title);

    store.redo();
    await autosave.flush();
    await expect(repository.load("autosave-project")).resolves.toMatchObject({
      revision: 4,
      document: { title: "Renamed" },
    });
  });

  test("queues a change made while a save is in flight", async () => {
    const initial = createTestProject();
    const repository = new InMemoryProjectRepository(
      DIRECT_STORED_PROJECT_CODEC,
    );
    await repository.save({
      documentId: "queued-autosave",
      revision: 0,
      updatedAt: "2026-08-22T09:00:00.000Z",
      document: initial,
      workspace: createDefaultPersistedEditorWorkspace(initial),
    }, null);
    let title = "First";
    const autosave = new ProjectAutosave({
      documentId: "queued-autosave",
      initialRevision: 1,
      repository,
      scheduler: NOOP_SCHEDULER,
      capture: () => ({
        document: { ...initial, title },
        workspace: createDefaultPersistedEditorWorkspace(initial),
      }),
      now: () => new Date().toISOString(),
    });

    autosave.markDirty();
    const first = autosave.flush();
    title = "Second";
    autosave.markDirty();
    await first;
    await autosave.flush();

    await expect(repository.load("queued-autosave")).resolves.toMatchObject({
      revision: 3,
      document: { title: "Second" },
    });
  });
});

const NOOP_SCHEDULER: AutosaveScheduler = {
  schedule() {
    return 1;
  },
  cancel() {},
};
