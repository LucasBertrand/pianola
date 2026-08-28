import type {
  EncodedStoredProject,
  StoredProjectCodec,
} from "../../../application/ports/stored-project-codec";
import {
  type StoredProject,
} from "../../../application/ports/project-repository";
import {
  ProjectPersistenceError,
  type ProjectPersistenceErrorCode,
} from "../codecs/project-persistence-error";

interface PendingWorkerRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: Error) => void;
}

interface WorkerResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly code: ProjectPersistenceErrorCode | null;
  };
}

export class WorkerStoredProjectCodec implements StoredProjectCodec {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingWorkerRequest>();
  private sequence = 0;

  public constructor() {
    this.worker = new Worker(
      new URL("./persistence-worker.ts", import.meta.url),
      { type: "module", name: "pianola-persistence" },
    );
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);

      if (pending === undefined) {
        return;
      }

      this.pending.delete(response.id);

      if (response.ok) {
        pending.resolve(response.value);
      } else {
        const error = response.error?.code === null
          || response.error?.code === undefined
          ? new Error(
              response.error?.message ?? "Persistence worker failed.",
            )
          : new ProjectPersistenceError(
              response.error.code,
              response.error.message,
            );
        error.name = response.error?.name ?? "Error";
        pending.reject(error);
      }
    };
    this.worker.onerror = () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("Persistence worker is unavailable."));
      }

      this.pending.clear();
    };
  }

  public encode(snapshot: StoredProject): Promise<EncodedStoredProject> {
    return this.request<EncodedStoredProject>({
      operation: "encode",
      snapshot,
    });
  }

  public decode(serialized: string): Promise<StoredProject> {
    return this.request<StoredProject>({
      operation: "decode",
      serialized,
    });
  }

  public dispose(): void {
    this.worker.terminate();
    this.pending.clear();
  }

  private request<T>(
    request: Record<string, unknown>,
  ): Promise<T> {
    this.sequence += 1;
    const id = this.sequence;

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve(value) {
          resolve(value as T);
        },
        reject,
      });
      this.worker.postMessage({ ...request, id });
    });
  }
}
