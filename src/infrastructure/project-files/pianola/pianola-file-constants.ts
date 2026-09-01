/** Pianola document limits and browser download behavior. */
export const FILE_CONSTANTS = Object.freeze({
  pianolaProjectFormat: "app.pianola.project",
  pianolaProjectVersion: 2,
  pianolaProjectExtension: ".pianola",
  pianolaProjectMaximumBytes: 32 * 1024 * 1024,
  objectUrlRevokeDelayMs: 1_000,
} as const);
