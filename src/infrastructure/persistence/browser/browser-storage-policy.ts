import {
  ProjectPersistenceError,
} from "../../persistence/project-persistence-model";

export async function requestPersistentBrowserStorage(): Promise<boolean> {
  if (navigator.storage?.persist === undefined) {
    return false;
  }

  return navigator.storage.persist();
}

export async function assertStorageCapacity(
  proposedBytes: number,
): Promise<void> {
  if (navigator.storage?.estimate === undefined) {
    return;
  }

  const estimate = await navigator.storage.estimate();

  if (
    estimate.quota !== undefined
    && estimate.usage !== undefined
    && estimate.quota - estimate.usage < proposedBytes
  ) {
    throw new ProjectPersistenceError(
      "QUOTA_EXCEEDED",
      "The browser reports insufficient storage space.",
    );
  }
}
