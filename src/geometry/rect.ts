/** Musical rectangle used for viewport culling and spatial queries. */
export interface Rect {
  readonly startTick: number;
  readonly endTick: number;
  readonly minPitch: number;
  readonly maxPitch: number;
}
