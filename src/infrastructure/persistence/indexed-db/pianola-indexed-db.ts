export const PIANOLA_DATABASE_NAME = "pianola";
export const PIANOLA_DATABASE_VERSION = 1;

export const PIANOLA_STORES = Object.freeze({
  projectCatalog: "project-catalog",
  projectGenerations: "project-generations",
  userSettings: "user-settings",
  diagnostics: "diagnostics",
} as const);

export class PianolaIndexedDb {
  private databasePromise: Promise<IDBDatabase> | null = null;

  public constructor(
    private readonly factory: IDBFactory = globalThis.indexedDB,
    private readonly databaseName = PIANOLA_DATABASE_NAME,
  ) {}

  public open(): Promise<IDBDatabase> {
    if (this.databasePromise === null) {
      this.databasePromise = this.openDatabase();
    }

    return this.databasePromise;
  }

  public close(): void {
    if (this.databasePromise !== null) {
      void this.databasePromise.then((database) => database.close());
      this.databasePromise = null;
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.factory.open(
        this.databaseName,
        PIANOLA_DATABASE_VERSION,
      );

      request.onupgradeneeded = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(
          PIANOLA_STORES.projectCatalog,
        )) {
          database.createObjectStore(
            PIANOLA_STORES.projectCatalog,
            { keyPath: "documentId" },
          );
        }

        if (!database.objectStoreNames.contains(
          PIANOLA_STORES.projectGenerations,
        )) {
          database.createObjectStore(
            PIANOLA_STORES.projectGenerations,
            { keyPath: ["documentId", "revision"] },
          );
        }

        if (!database.objectStoreNames.contains(
          PIANOLA_STORES.userSettings,
        )) {
          database.createObjectStore(
            PIANOLA_STORES.userSettings,
            { keyPath: "key" },
          );
        }

        if (!database.objectStoreNames.contains(
          PIANOLA_STORES.diagnostics,
        )) {
          database.createObjectStore(
            PIANOLA_STORES.diagnostics,
            { keyPath: "id", autoIncrement: true },
          );
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(
        request.error ?? new Error("Unable to open IndexedDB."),
      );
      request.onblocked = () => reject(
        new Error("IndexedDB upgrade is blocked by another window."),
      );
    });
  }
}

export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error ?? new Error("IndexedDB request failed."),
    );
  });
}

export function idbTransaction(
  transaction: IDBTransaction,
): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
      transaction.error ?? new Error("IndexedDB transaction was aborted."),
    );
    transaction.onerror = () => reject(
      transaction.error ?? new Error("IndexedDB transaction failed."),
    );
  });
}
