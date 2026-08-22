import type {
  ProjectDocument,
} from "../../domain/project/project-document";
import type {
  ProjectRepository,
  ProjectWorkspaceState,
  StoredProject,
} from "../../persistence/project-persistence-model";

export type ProjectSaveStatus =
  | { readonly state: "saved"; readonly savedAt: string }
  | { readonly state: "saving" }
  | { readonly state: "unsaved" }
  | { readonly state: "error"; readonly error: Error };

export interface AutosaveScheduler {
  schedule(callback: () => void, delayMilliseconds: number): unknown;
  cancel(handle: unknown): void;
}

export interface ProjectAutosaveSnapshot {
  readonly document: ProjectDocument;
  readonly workspace: ProjectWorkspaceState;
}

export interface ProjectAutosaveOptions {
  readonly documentId: string;
  readonly initialRevision: number;
  readonly repository: ProjectRepository;
  readonly scheduler: AutosaveScheduler;
  readonly capture: () => ProjectAutosaveSnapshot;
  readonly now: () => string;
  readonly debounceMilliseconds?: number;
  readonly maximumDelayMilliseconds?: number;
}

export class ProjectAutosave {
  private revision: number;
  private dirtySequence = 0;
  private savedSequence = 0;
  private debounceHandle: unknown = null;
  private maximumDelayHandle: unknown = null;
  private activeSave: Promise<void> | null = null;
  private status: ProjectSaveStatus;
  private readonly listeners = new Set<
    (status: ProjectSaveStatus) => void
  >();
  private readonly debounceMilliseconds: number;
  private readonly maximumDelayMilliseconds: number;

  public constructor(private readonly options: ProjectAutosaveOptions) {
    this.revision = options.initialRevision;
    this.status = { state: "saved", savedAt: options.now() };
    this.debounceMilliseconds = options.debounceMilliseconds ?? 750;
    this.maximumDelayMilliseconds =
      options.maximumDelayMilliseconds ?? 5_000;
  }

  public getRevision(): number {
    return this.revision;
  }

  public getStatus(): ProjectSaveStatus {
    return this.status;
  }

  public subscribe(
    listener: (status: ProjectSaveStatus) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public markDirty(): void {
    this.dirtySequence += 1;
    this.publish({ state: "unsaved" });

    if (this.debounceHandle !== null) {
      this.options.scheduler.cancel(this.debounceHandle);
    }

    this.debounceHandle = this.options.scheduler.schedule(
      () => {
        this.debounceHandle = null;
        void this.flush().catch(() => undefined);
      },
      this.debounceMilliseconds,
    );

    if (this.maximumDelayHandle === null) {
      this.maximumDelayHandle = this.options.scheduler.schedule(
        () => {
          this.maximumDelayHandle = null;
          void this.flush().catch(() => undefined);
        },
        this.maximumDelayMilliseconds,
      );
    }
  }

  public flush(): Promise<void> {
    this.cancelTimers();

    if (this.activeSave !== null) {
      return this.activeSave.then(() => {
        if (this.savedSequence < this.dirtySequence) {
          return this.flush();
        }

        return undefined;
      });
    }

    if (this.savedSequence >= this.dirtySequence) {
      return Promise.resolve();
    }

    const savingSequence = this.dirtySequence;
    const snapshot = this.options.capture();
    const updatedAt = this.options.now();
    const storedProject: StoredProject = {
      documentId: this.options.documentId,
      revision: this.revision,
      updatedAt,
      document: snapshot.document,
      workspace: snapshot.workspace,
    };
    this.publish({ state: "saving" });
    const save = this.options.repository.save(
      storedProject,
      this.revision,
    ).then((storedRevision) => {
      this.revision = storedRevision.revision;
      this.savedSequence = savingSequence;

      if (this.savedSequence === this.dirtySequence) {
        this.publish({
          state: "saved",
          savedAt: storedRevision.updatedAt,
        });
      } else {
        this.publish({ state: "unsaved" });
      }
    }).catch((error: unknown) => {
      this.publish({
        state: "error",
        error: error instanceof Error
          ? error
          : new Error("Project autosave failed."),
      });
      throw error;
    }).finally(() => {
      this.activeSave = null;
    });
    this.activeSave = save;
    return save;
  }

  public async dispose(): Promise<void> {
    this.cancelTimers();
    await this.flush();
    this.listeners.clear();
  }

  private cancelTimers(): void {
    if (this.debounceHandle !== null) {
      this.options.scheduler.cancel(this.debounceHandle);
      this.debounceHandle = null;
    }

    if (this.maximumDelayHandle !== null) {
      this.options.scheduler.cancel(this.maximumDelayHandle);
      this.maximumDelayHandle = null;
    }
  }

  private publish(status: ProjectSaveStatus): void {
    this.status = status;

    for (const listener of this.listeners) {
      listener(status);
    }
  }
}
