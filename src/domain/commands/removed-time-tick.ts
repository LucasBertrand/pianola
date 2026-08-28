/** Collapses a tick through a half-open removed time range. */
export function collapseTickForRemovedTime(
  tick: number,
  removalStartTick: number,
  removalEndTick: number,
): number {
  if (tick <= removalStartTick) return tick;
  if (tick >= removalEndTick) return tick - removalEndTick + removalStartTick;
  return removalStartTick;
}
