import {
  ProjectPersistenceError,
} from "./project-persistence-model";
import {
  parseUserSettingsEnvelope,
  recoverDefaultUserSettings,
  serializeUserSettings,
} from "./user-settings-codec";
import {
  cloneUserSettings,
  type UserSettings,
  type UserSettingsRepository,
} from "./user-settings-model";

export interface InMemoryUserSettingsStorage {
  serialized: string | null;
  diagnostic: string | null;
}

export class InMemoryUserSettingsRepository
implements UserSettingsRepository {
  private operation = Promise.resolve();

  public constructor(
    public readonly storage: InMemoryUserSettingsStorage = {
      serialized: null,
      diagnostic: null,
    },
  ) {}

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
      this.storage.serialized = serialized;
      return cloneUserSettings(validated);
    });
  }

  private async loadCurrent(): Promise<UserSettings> {
    if (this.storage.serialized === null) {
      return recoverDefaultUserSettings();
    }

    try {
      return cloneUserSettings(
        parseUserSettingsEnvelope(this.storage.serialized).settings,
      );
    } catch (error: unknown) {
      if (
        error instanceof ProjectPersistenceError
        && error.code === "FUTURE_VERSION"
      ) {
        throw error;
      }

      this.storage.diagnostic = this.storage.serialized;
      const defaults = recoverDefaultUserSettings();
      this.storage.serialized = serializeUserSettings(
        defaults,
        new Date().toISOString(),
      );
      return defaults;
    }
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
