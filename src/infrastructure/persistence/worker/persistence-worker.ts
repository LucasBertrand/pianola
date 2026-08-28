/// <reference lib="webworker" />

import type {
  StoredProject,
} from "../../../application/ports/project-repository";
import {
  ProjectPersistenceError,
} from "../codecs/project-persistence-error";
import {
  parseStoredProject,
  serializeStoredProject,
} from "../codecs/stored-project-codec";
import {
  parseProjectSnapshot,
} from "../../project-files/pianola/parsing/parse-project";

type WorkerRequest =
  | {
      readonly id: number;
      readonly operation: "decode";
      readonly serialized: string;
    }
  | {
      readonly id: number;
      readonly operation: "encode";
      readonly snapshot: StoredProject;
    };

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    const value = request.operation === "encode"
      ? serializeStoredProject(request.snapshot, parseProjectSnapshot)
      : parseStoredProject(request.serialized, parseProjectSnapshot);
    workerScope.postMessage({ id: request.id, ok: true, value });
  } catch (error: unknown) {
    workerScope.postMessage({
      id: request.id,
      ok: false,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error
          ? error.message
          : "Persistence worker failed.",
        code: error instanceof ProjectPersistenceError
          ? error.code
          : null,
      },
    });
  }
};

export {};
