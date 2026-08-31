import type {
  Tick,
} from "../../../domain/identifiers";

/** Keeps a tick drag responsive after the raw pointer crosses a constraint. */
export class BoundedPointerTickPosition {
  private pointerTickOffset = 0;

  public constructor(
    private readonly originTick: Tick,
    private readonly constrainDelta: (deltaTicks: Tick) => Tick,
  ) {}

  public resolve(
    pointerTick: number,
    snapAbsoluteTick: (tick: number) => Tick,
  ): Tick {
    let rawTargetTick = pointerTick + this.pointerTickOffset;
    const rawDeltaTicks = rawTargetTick - this.originTick;
    const constrainedRawDeltaTicks = this.constrainDelta(rawDeltaTicks);

    if (constrainedRawDeltaTicks !== rawDeltaTicks) {
      rawTargetTick = this.originTick + constrainedRawDeltaTicks;
      this.pointerTickOffset = rawTargetTick - pointerTick;
    }

    const snappedDeltaTicks = snapAbsoluteTick(rawTargetTick) - this.originTick;
    return this.originTick + this.constrainDelta(snappedDeltaTicks);
  }
}
