import type {
  CoordinateConverter,
} from "../geometry/converter";
import type {
  SpatialTouchEnvelope,
} from "../geometry/spatial-index";
import type {
  PointerKind,
} from "./core/input";

/** Converts a CSS-pixel touch target into musical-space hit margins. */
export function createTouchEnvelope(
  converter: CoordinateConverter,
  pointerType: PointerKind,
  mouseRadiusCssPixels: number,
  touchRadiusCssPixels: number,
): SpatialTouchEnvelope {
  const radiusCssPixels =
    pointerType === "touch"
      ? touchRadiusCssPixels
      : mouseRadiusCssPixels;
  const tickRadius = Math.abs(
    converter.cssPixelXToTick(radiusCssPixels)
      - converter.cssPixelXToTick(0),
  );

  return {
    tickRadius,
    pitchRadius: 0,
  };
}
