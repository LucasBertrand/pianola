export const PIANOLA_DATABASE_NAME = "pianola";
export const PIANOLA_DATABASE_VERSION = 1;

export interface PianolaLayoutMigration {
  readonly sourceVersion: number;
  readonly targetVersion: number;
}

export const PIANOLA_STORES = Object.freeze({
  projectCatalog: "project-catalog",
  projectGenerations: "project-generations",
  userSettings: "user-settings",
  diagnostics: "diagnostics",
} as const);

export class PianolaIndexedDb {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private layoutMigrationValue: PianolaLayoutMigration | null = null;

  public constructor(
    private readonly factory: IDBFactory = globalThis.indexedDB,
    private readonly databaseName = PIANOLA_DATABASE_NAME,
  ) {}

  public get layoutMigration(): PianolaLayoutMigration | null {
    return this.layoutMigrationValue;
  }

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
    return this.openVersionedDatabase(true);
  }

  private openVersionedDatabase(
    allowIncompatibleReset: boolean,
  ): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.factory.open(
        this.databaseName,
        PIANOLA_DATABASE_VERSION,
      );

      request.onupgradeneeded = (event) => {
        const database = request.result;

        const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

        if (oldVersion !== 0) {
          this.layoutMigrationValue = {
            sourceVersion: oldVersion,
            targetVersion: PIANOLA_DATABASE_VERSION,
          };
        }

        createCurrentObjectStores(database);
      };

      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => {
        const error = request.error ?? new Error("Unable to open IndexedDB.");

        if (
          allowIncompatibleReset
          && error instanceof DOMException
          && error.name === "VersionError"
        ) {
          void this.deleteDatabase()
            .then(() => this.openVersionedDatabase(false))
            .then(resolve, reject);
          return;
        }

        reject(error);
      };
      request.onblocked = () => reject(
        new Error("IndexedDB upgrade is blocked by another window."),
      );
    });
  }

  private deleteDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = this.factory.deleteDatabase(this.databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(
        request.error ?? new Error("Unable to reset IndexedDB."),
      );
      request.onblocked = () => reject(
        new Error("IndexedDB reset is blocked by another window."),
      );
    });
  }
}

function createCurrentObjectStores(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(PIANOLA_STORES.projectCatalog)) {
    database.createObjectStore(
      PIANOLA_STORES.projectCatalog,
      { keyPath: "documentId" },
    );
  }

  if (!database.objectStoreNames.contains(PIANOLA_STORES.projectGenerations)) {
    database.createObjectStore(
      PIANOLA_STORES.projectGenerations,
      { keyPath: ["documentId", "revision"] },
    );
  }

  if (!database.objectStoreNames.contains(PIANOLA_STORES.userSettings)) {
    database.createObjectStore(
      PIANOLA_STORES.userSettings,
      { keyPath: "key" },
    );
  }

  if (!database.objectStoreNames.contains(PIANOLA_STORES.diagnostics)) {
    database.createObjectStore(
      PIANOLA_STORES.diagnostics,
      { keyPath: "id", autoIncrement: true },
    );
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
