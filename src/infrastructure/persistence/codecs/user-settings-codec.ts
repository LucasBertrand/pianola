import {
  USER_SETTINGS_SCHEMA_VERSION,
  type ShortcutActionId,
  type ShortcutBinding,
  type UserSettings,
} from "../../../application/ports/user-settings-repository";
import {
  ProjectPersistenceError,
} from "./project-persistence-error";
import {
  parsePersistenceJson,
  readPersistenceBoolean,
  readPersistenceInteger,
  readPersistenceIsoDate,
  readPersistenceRecord,
  readPersistenceString,
} from "./persistence-codec-readers";
import {
  parsePersonalInstrumentPresetLibrary,
} from "./personal-instrument-preset-codec";

export const USER_SETTINGS_FORMAT = "app.pianola.user-settings.v1";

const ACTION_IDS = [
  "editor.redo",
  "editor.undo",
  "transport.toggle",
] as const satisfies readonly ShortcutActionId[];
const RESERVED_SHORTCUTS = new Set([
  "F4:false:false:true:false",
  "F5:false:false:false:false",
  "KeyL:true:false:false:false",
  "KeyQ:false:false:false:true",
  "KeyR:true:false:false:false",
  "KeyW:true:false:false:false",
]);
const MODIFIER_ONLY_CODES = new Set([
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
]);

export interface UserSettingsEnvelope {
  readonly format: typeof USER_SETTINGS_FORMAT;
  readonly schemaVersion: typeof USER_SETTINGS_SCHEMA_VERSION;
  readonly updatedAt: string;
  readonly settings: UserSettings;
}

export function serializeUserSettings(
  settings: UserSettings,
  updatedAt: string,
): string {
  const validated = parseUserSettings(settings, "$.settings");
  return JSON.stringify({
    format: USER_SETTINGS_FORMAT,
    schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
    updatedAt,
    settings: validated,
  } satisfies UserSettingsEnvelope);
}

export function parseUserSettingsEnvelope(
  serialized: string,
): UserSettingsEnvelope {
  const source = readPersistenceRecord(
    parsePersistenceJson(serialized),
    "$",
  );
  const format = readPersistenceString(source["format"], "$.format", 64);

  const version = readPersistenceInteger(
    source["schemaVersion"],
    "$.schemaVersion",
    1,
  );

  if (version > USER_SETTINGS_SCHEMA_VERSION) {
    throw new ProjectPersistenceError(
      "FUTURE_VERSION",
      `User settings version ${version} is newer than this application.`,
    );
  }

  if (version !== USER_SETTINGS_SCHEMA_VERSION || format !== USER_SETTINGS_FORMAT) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      "Stored user settings use an unknown format or version.",
    );
  }

  return {
    format: USER_SETTINGS_FORMAT,
    schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
    updatedAt: readPersistenceIsoDate(source["updatedAt"], "$.updatedAt"),
    settings: parseUserSettings(source["settings"], "$.settings"),
  };
}

export function parseUserSettings(
  source: unknown,
  path: string,
): UserSettings {
  const settings = readPersistenceRecord(source, path);
  const version = readPersistenceInteger(
    settings["schemaVersion"],
    `${path}.schemaVersion`,
    1,
  );

  if (version !== USER_SETTINGS_SCHEMA_VERSION) {
    throw new ProjectPersistenceError(
      version > USER_SETTINGS_SCHEMA_VERSION
        ? "FUTURE_VERSION"
        : "INVALID_DATA",
      `Unsupported user settings version ${version}.`,
    );
  }

  const selectionMode = readPersistenceString(
    settings["selectionMode"],
    `${path}.selectionMode`,
    16,
  );
  const noteColorMode = readPersistenceString(
    settings["noteColorMode"],
    `${path}.noteColorMode`,
    16,
  );

  if (
    selectionMode !== "replace"
    && selectionMode !== "add"
    && selectionMode !== "subtract"
  ) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      "Unsupported selection mode in user settings.",
    );
  }

  if (noteColorMode !== "instrument" && noteColorMode !== "pitch") {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      "Unsupported note color mode in user settings.",
    );
  }

  const noteLabelMode = readPersistenceString(
    settings["noteLabelMode"],
    `${path}.noteLabelMode`,
    16,
  );

  if (noteLabelMode !== "pitch" && noteLabelMode !== "degree") {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      "Unsupported note label mode in user settings.",
    );
  }

  const sourceShortcuts = readPersistenceRecord(
    settings["shortcuts"],
    `${path}.shortcuts`,
  );
  const actualActions = Object.keys(sourceShortcuts).sort();
  const expectedActions = [...ACTION_IDS].sort();

  if (
    actualActions.length !== expectedActions.length
    || actualActions.some(
      (actionId, index) => actionId !== expectedActions[index],
    )
  ) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      "User settings contain missing or unknown shortcut actions.",
    );
  }

  const shortcuts = {} as Record<ShortcutActionId, ShortcutBinding>;
  const signatures = new Set<string>();

  for (const actionId of ACTION_IDS) {
    const binding = parseShortcutBinding(
      sourceShortcuts[actionId],
      `${path}.shortcuts.${actionId}`,
    );
    const signature = shortcutSignature(binding);

    if (
      RESERVED_SHORTCUTS.has(signature)
      || MODIFIER_ONLY_CODES.has(binding.code)
    ) {
      throw new ProjectPersistenceError(
        "INVALID_DATA",
        `Shortcut for ${actionId} is reserved or inaccessible.`,
      );
    }

    if (signatures.has(signature)) {
      throw new ProjectPersistenceError(
        "INVALID_DATA",
        "Two shortcut actions cannot use the same binding.",
      );
    }

    signatures.add(signature);
    shortcuts[actionId] = binding;
  }

  const personalPresetLibrary = parsePersonalInstrumentPresetLibrary(
    settings["personalInstrumentPresetsById"],
    settings["personalInstrumentPresetOrder"],
    `${path}.personalInstrumentPresets`,
  );

  return {
    schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
    selectionMode,
    noteColorMode,
    noteLabelMode,
    pitchPreviewEnabled: readPersistenceBoolean(
      settings["pitchPreviewEnabled"],
      `${path}.pitchPreviewEnabled`,
    ),
    personalInstrumentPresetsById: personalPresetLibrary.presetsById,
    personalInstrumentPresetOrder: personalPresetLibrary.presetOrder,
    shortcuts,
  };
}

function parseShortcutBinding(
  source: unknown,
  path: string,
): ShortcutBinding {
  const binding = readPersistenceRecord(source, path);
  const code = readPersistenceString(
    binding["code"],
    `${path}.code`,
    64,
  );

  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(code)) {
    throw new ProjectPersistenceError(
      "INVALID_DATA",
      `Shortcut code is invalid. Location: ${path}.code.`,
    );
  }

  return {
    code,
    control: readPersistenceBoolean(
      binding["control"],
      `${path}.control`,
    ),
    shift: readPersistenceBoolean(
      binding["shift"],
      `${path}.shift`,
    ),
    alt: readPersistenceBoolean(binding["alt"], `${path}.alt`),
    meta: readPersistenceBoolean(binding["meta"], `${path}.meta`),
  };
}

function shortcutSignature(binding: ShortcutBinding): string {
  return [
    binding.code,
    binding.control,
    binding.shift,
    binding.alt,
    binding.meta,
  ].join(":");
}
