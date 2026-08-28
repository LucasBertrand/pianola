/** The stop-at-end control is the inverse of automatic clip advance. */
export function isStopAtEndEnabled(autoAdvanceEnabled: boolean): boolean {
  return !autoAdvanceEnabled;
}
