import {
  EDITOR_CONSTANTS,
} from "../config/editor-config";
import type {
  SelectionMode,
} from "../editor/interactions/gestures/gesture-draft";
import type {
  NoteColorMode,
} from "../editor/model/note-color-mode";

export const USER_SETTINGS_FORMAT =
  "app.pianola.user-settings";
export const USER_SETTINGS_SCHEMA_VERSION = 1;

export type ShortcutActionId =
  | "editor.redo"
  | "editor.undo"
  | "transport.toggle";

export interface ShortcutBinding {
  readonly code: string;
  readonly control: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

export interface UserSettings {
  readonly schemaVersion: typeof USER_SETTINGS_SCHEMA_VERSION;
  readonly selectionMode: SelectionMode;
  readonly noteColorMode: NoteColorMode;
  readonly pitchPreviewEnabled: boolean;
  readonly shortcuts: Readonly<
    Record<ShortcutActionId, ShortcutBinding>
  >;
}

export interface UserSettingsRepository {
  load(): Promise<UserSettings>;
  update(
    transform: (current: UserSettings) => UserSettings,
  ): Promise<UserSettings>;
}

export const DEFAULT_USER_SETTINGS: UserSettings = Object.freeze({
  schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
  selectionMode: "replace",
  noteColorMode: EDITOR_CONSTANTS.defaultNoteColorMode,
  pitchPreviewEnabled:
    EDITOR_CONSTANTS.defaultPitchPreviewEnabled,
  shortcuts: Object.freeze({
    "editor.undo": Object.freeze({
      code: "KeyZ",
      control: true,
      shift: false,
      alt: false,
      meta: false,
    }),
    "editor.redo": Object.freeze({
      code: "KeyZ",
      control: true,
      shift: true,
      alt: false,
      meta: false,
    }),
    "transport.toggle": Object.freeze({
      code: "Space",
      control: false,
      shift: false,
      alt: false,
      meta: false,
    }),
  }),
});

export function cloneUserSettings(
  settings: UserSettings,
): UserSettings {
  return {
    ...settings,
    shortcuts: Object.fromEntries(
      Object.entries(settings.shortcuts).map(
        ([actionId, binding]) => [actionId, { ...binding }],
      ),
    ) as unknown as UserSettings["shortcuts"],
  };
}
