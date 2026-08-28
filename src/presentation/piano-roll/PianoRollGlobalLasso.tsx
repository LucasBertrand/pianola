import React, {
  type CSSProperties,
  type RefObject,
} from "react";
import {
  APPLICATION_COLORS,
} from "../styles/application-colors";

export interface PianoRollGlobalLassoProps {
  readonly elementRef: RefObject<HTMLDivElement | null>;
}

const GLOBAL_LASSO_STYLE: CSSProperties = {
  position: "absolute",
  zIndex: 10,
  top: "50px",
  left: 0,
  display: "none",
  border: `1px solid ${APPLICATION_COLORS.interaction.lassoBorder}`,
  background: APPLICATION_COLORS.interaction.lassoFill,
  boxShadow:
    `0 0 0 1px ${APPLICATION_COLORS.interaction.lassoInnerShadow}`,
  pointerEvents: "none",
  boxSizing: "border-box",
  willChange: "transform, width, height",
};

/** One uninterrupted lasso spanning the grid and the ruler. */
export function PianoRollGlobalLasso({
  elementRef,
}: PianoRollGlobalLassoProps): React.JSX.Element {
  return (
    <div
      ref={elementRef}
      className="interaction-lasso is-global"
      style={GLOBAL_LASSO_STYLE}
      aria-hidden="true"
    />
  );
}
