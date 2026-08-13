/** Native document limits and browser download behavior. */
export const FILE_CONSTANTS = Object.freeze({
  nativeProjectFormat: "app.pianola.native-project",
  nativeProjectVersion: 1,
  nativeProjectExtension: ".pianola",
  nativeProjectMaximumBytes: 32 * 1024 * 1024,
  objectUrlRevokeDelayMs: 1_000,
} as const);
