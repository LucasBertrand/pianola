import {
  ProjectPersistenceError,
} from "../persistence/codecs/project-persistence-error";
import {
  readPersistenceRecord,
} from "../persistence/codecs/persistence-codec-readers";

const LEGACY_BUILT_IN_PRESET_IDS: Readonly<Record<string, string>> = {
  "subtractive-sawtooth": "synth-sawtooth",
  "subtractive-sine": "synth-sine",
  "subtractive-triangle": "synth-triangle",
  "subtractive-warm-pad": "synth-warm-pad",
  "subtractive-pulse-bass": "synth-pulse-bass",
  "subtractive-bright-pluck": "synth-bright-pluck",
};

/** Migrates only the instrument vocabulary owned by project schema 1. */
export function migrateProjectDocumentV1ToV2(
  source: unknown,
  path: string,
): Readonly<Record<string, unknown>> {
  const document = readPersistenceRecord(source, path);
  const projectInstruments = readPersistenceRecord(
    document["projectInstrumentsById"],
    `${path}.projectInstrumentsById`,
  );
  const presets = readPersistenceRecord(
    document["instrumentPresetsById"],
    `${path}.instrumentPresetsById`,
  );

  return {
    ...document,
    schemaVersion: document["schemaVersion"] === 1
      ? 2
      : document["schemaVersion"],
    projectInstrumentsById: Object.fromEntries(
      Object.entries(projectInstruments).map(([instrumentId, value]) => {
        const instrumentPath =
          `${path}.projectInstrumentsById.${instrumentId}`;
        const projectInstrument = readPersistenceRecord(
          value,
          instrumentPath,
        );

        return [instrumentId, {
          ...projectInstrument,
          instrument: migrateSynthConfig(
            projectInstrument["instrument"],
            `${instrumentPath}.instrument`,
          ),
        }];
      }),
    ),
    instrumentPresetsById: migratePresetRecords(presets, path),
    instrumentPresetOrder: migratePresetOrder(
      document["instrumentPresetOrder"],
    ),
  };
}

function migratePresetRecords(
  presets: Readonly<Record<string, unknown>>,
  documentPath: string,
): Readonly<Record<string, unknown>> {
  const migrated: Record<string, unknown> = {};

  for (const [presetId, value] of Object.entries(presets)) {
    const nextPresetId = LEGACY_BUILT_IN_PRESET_IDS[presetId] ?? presetId;

    if (migrated[nextPresetId] !== undefined) {
      throw new ProjectPersistenceError(
        "INVALID_DATA",
        `Preset migration would create duplicate ID "${nextPresetId}".`,
      );
    }

    const presetPath =
      `${documentPath}.instrumentPresetsById.${presetId}`;
    const preset = readPersistenceRecord(value, presetPath);

    migrated[nextPresetId] = {
      ...preset,
      id: preset["id"] === presetId ? nextPresetId : preset["id"],
      kind: migrateSynthKind(preset["kind"]),
      config: migrateSynthConfig(
        preset["config"],
        `${presetPath}.config`,
      ),
    };
  }

  return migrated;
}

function migratePresetOrder(source: unknown): unknown {
  if (!Array.isArray(source)) {
    return source;
  }

  return source.map((presetId) => (
    typeof presetId === "string"
      ? LEGACY_BUILT_IN_PRESET_IDS[presetId] ?? presetId
      : presetId
  ));
}

function migrateSynthConfig(
  source: unknown,
  path: string,
): Readonly<Record<string, unknown>> {
  const config = readPersistenceRecord(source, path);

  return {
    ...config,
    kind: migrateSynthKind(config["kind"]),
  };
}

function migrateSynthKind(source: unknown): unknown {
  return source === "subtractive" ? "synth" : source;
}
