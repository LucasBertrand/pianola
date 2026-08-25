export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
}

export interface RadialSegmentTransform {
  readonly rotation: string;
  readonly counterRotation: string;
}

export interface RadialDividerEndPoint {
  readonly x: number;
  readonly y: number;
}

const ARC_APPROXIMATION_STEPS = 8;

/**
 * Distributes any number of commands around the circle while keeping their
 * labels upright. The first command is centered at twelve o'clock.
 */
export function getRadialSegmentTransform(
  index: number,
  itemCount: number,
): RadialSegmentTransform {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError("The radial menu index must be a positive integer.");
  }

  if (!Number.isInteger(itemCount) || itemCount < 1 || index >= itemCount) {
    throw new RangeError("The radial menu item count must include the index.");
  }

  const angle = (360 / itemCount) * index;

  return {
    rotation: `${angle}deg`,
    counterRotation: `${-angle}deg`,
  };
}

/** Builds a circular sector polygon centered at twelve o'clock. */
export function getRadialSegmentClipPath(itemCount: number): string {
  if (!Number.isInteger(itemCount) || itemCount < 1) {
    throw new RangeError("The radial menu must contain at least one item.");
  }

  const halfArc = Math.PI / itemCount;
  const points = ["50% 50%"];

  for (let step = 0; step <= ARC_APPROXIMATION_STEPS; step += 1) {
    const angle = -Math.PI / 2 - halfArc
      + (halfArc * 2 * step) / ARC_APPROXIMATION_STEPS;
    const x = 50 + Math.cos(angle) * 50;
    const y = 50 + Math.sin(angle) * 50;

    points.push(`${formatPercent(x)}% ${formatPercent(y)}%`);
  }

  return `polygon(${points.join(", ")})`;
}

/** Returns one sector boundary on a 100 × 100 SVG coordinate system. */
export function getRadialDividerEndPoint(
  index: number,
  itemCount: number,
): RadialDividerEndPoint {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError("The radial divider index must be a positive integer.");
  }

  if (!Number.isInteger(itemCount) || itemCount < 1 || index >= itemCount) {
    throw new RangeError("The radial menu item count must include the divider.");
  }

  const angle = -Math.PI / 2 - Math.PI / itemCount
    + (Math.PI * 2 * index) / itemCount;

  return {
    x: 50 + Math.cos(angle) * 50,
    y: 50 + Math.sin(angle) * 50,
  };
}

function formatPercent(value: number): string {
  return Number(value.toFixed(3)).toString();
}
