import {
  ProjectPersistenceError,
} from "../../persistence/project-persistence-model";
import {
  parseUserSettingsEnvelope,
  recoverDefaultUserSettings,
  serializeUserSettings,
} from "../../persistence/user-settings-codec";
import {
  cloneUserSettings,
  type UserSettings,
  type UserSettingsRepository,
} from "../../persistence/user-settings-model";
import {
  idbRequest,
  idbTransaction,
  PIANOLA_STORES,
  type PianolaIndexedDb,
} from "./pianola-indexed-db";

interface StoredSettingsRecord {
  readonly key: "current";
  readonly serialized: string;
}

export class IndexedDbUserSettingsRepository
implements UserSettingsRepository {
  private operation = Promise.resolve();

  public constructor(private readonly database: PianolaIndexedDb) {}

  public load(): Promise<UserSettings> {
    return this.enqueue(() => this.loadCurrent());
  }

  public update(
    transform: (current: UserSettings) => UserSettings,
  ): Promise<UserSettings> {
    return this.enqueue(async () => {
      const current = await this.loadCurrent();
      const serialized = serializeUserSettings(
        transform(cloneUserSettings(current)),
        new Date().toISOString(),
      );
      const validated = parseUserSettingsEnvelope(serialized).settings;
      await this.write(serialized);
      return cloneUserSettings(validated);
    });
  }

  private async loadCurrent(): Promise<UserSettings> {
    const database = await this.database.open();
    const transaction = database.transaction(
      PIANOLA_STORES.userSettings,
      "readonly",
    );
    const done = idbTransaction(transaction);
    const record = await idbRequest(
      transaction.objectStore(PIANOLA_STORES.userSettings).get("current"),
    ) as StoredSettingsRecord | undefined;
    await done;

    if (record === undefined) {
      return recoverDefaultUserSettings();
    }

    try {
      return cloneUserSettings(
        parseUserSettingsEnvelope(record.serialized).settings,
      );
    } catch (error: unknown) {
      if (
        error instanceof ProjectPersistenceError
        && error.code === "FUTURE_VERSION"
      ) {
        throw error;
      }

      const defaults = recoverDefaultUserSettings();
      await this.recoverInvalidSettings(record.serialized, defaults);
      return defaults;
    }
  }

  private async write(serialized: string): Promise<void> {
    const database = await this.database.open();
    const transaction = database.transaction(
      PIANOLA_STORES.userSettings,
      "readwrite",
    );
    const done = idbTransaction(transaction);
    transaction.objectStore(PIANOLA_STORES.userSettings).put({
      key: "current",
      serialized,
    } satisfies StoredSettingsRecord);
    await done;
  }

  private async recoverInvalidSettings(
    invalidSerialized: string,
    defaults: UserSettings,
  ): Promise<void> {
    const database = await this.database.open();
    const transaction = database.transaction(
      [PIANOLA_STORES.userSettings, PIANOLA_STORES.diagnostics],
      "readwrite",
    );
    const done = idbTransaction(transaction);
    transaction.objectStore(PIANOLA_STORES.diagnostics).add({
      kind: "invalid-user-settings",
      capturedAt: new Date().toISOString(),
      serialized: invalidSerialized,
    });
    transaction.objectStore(PIANOLA_STORES.userSettings).put({
      key: "current",
      serialized: serializeUserSettings(
        defaults,
        new Date().toISOString(),
      ),
    } satisfies StoredSettingsRecord);
    await done;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
