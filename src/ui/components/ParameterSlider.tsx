import React, {
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  EDITOR_CONSTANTS,
} from "../../config/program-constants";

const ENVELOPE_SLIDER_CURVE_EXPONENT =
  EDITOR_CONSTANTS.envelopeSliderCurveExponent;

export interface ParameterSliderProps {
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly formatValue: (value: number) => string;
  readonly onCommit: (value: number) => void;
}

export function ParameterSlider(
  props: ParameterSliderProps,
): React.JSX.Element {
  const {
    label,
    value,
    minimum,
    maximum,
    step,
    formatValue,
    onCommit,
  } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef<HTMLElement | null>(null);
  const lastCommittedValueRef = useRef(value);

  const updateVisual = useCallback((nextValue: number): void => {
    if (valueRef.current !== null) {
      valueRef.current.textContent = formatValue(nextValue);
    }
  }, [
    formatValue,
  ]);

  useEffect(() => {
    if (inputRef.current !== null) {
      inputRef.current.value = String(
        parameterValueToSliderPosition(
          value,
          minimum,
          maximum,
        ),
      );
    }

    lastCommittedValueRef.current = value;
    updateVisual(value);
  }, [
    updateVisual,
    value,
  ]);

  const commitValue = (): void => {
    const sliderPosition = Number(inputRef.current?.value);

    if (!Number.isFinite(sliderPosition)) {
      return;
    }

    const nextValue = sliderPositionToParameterValue(
      sliderPosition,
      minimum,
      maximum,
      step,
    );

    if (
      !Number.isFinite(nextValue)
      || nextValue === lastCommittedValueRef.current
    ) {
      return;
    }

    lastCommittedValueRef.current = nextValue;
    onCommit(nextValue);
  };

  return (
    <label
      className="parameter"
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <div className="parameter-copy">
        <span>{label}</span>
        <strong ref={valueRef}>{formatValue(value)}</strong>
      </div>
      <div className="parameter-input-vertical">
        <input
          ref={inputRef}
          className="parameter-input"
          type="range"
          min="0"
          max="1"
          step={EDITOR_CONSTANTS.parameterSliderPositionStep}
          defaultValue={parameterValueToSliderPosition(
            value,
            minimum,
            maximum,
          )}
          aria-label={label}
          onInput={(event) => {
            updateVisual(
              sliderPositionToParameterValue(
                Number(event.currentTarget.value),
                minimum,
                maximum,
                step,
              ),
            );
          }}
          onContextMenu={(event) => {
            event.preventDefault();
          }}
          onPointerUp={commitValue}
          onPointerCancel={commitValue}
          onBlur={commitValue}
          onKeyUp={commitValue}
        />
      </div>
    </label>
  );
}

function parameterValueToSliderPosition(
  value: number,
  minimum: number,
  maximum: number,
): number {
  const range = maximum - minimum;

  if (range <= 0) {
    return 0;
  }

  const normalizedValue = Math.min(
    1,
    Math.max(0, (value - minimum) / range),
  );

  return normalizedValue ** (
    1 / ENVELOPE_SLIDER_CURVE_EXPONENT
  );
}

function sliderPositionToParameterValue(
  position: number,
  minimum: number,
  maximum: number,
  step: number,
): number {
  const normalizedPosition = Math.min(
    1,
    Math.max(0, Number.isFinite(position) ? position : 0),
  );
  const rawValue =
    minimum
    + (maximum - minimum)
      * normalizedPosition ** ENVELOPE_SLIDER_CURVE_EXPONENT;
  const steppedValue =
    minimum
    + Math.round((rawValue - minimum) / step) * step;

  return Math.min(
    maximum,
    Math.max(minimum, Number(steppedValue.toFixed(6))),
  );
}


