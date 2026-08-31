import React, {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type InputHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  endSliderPointerSession,
  moveSliderPointerSession,
  startSliderPointerSession,
  type SliderPointerSession,
} from "./slider-pointer-session";
import {
  getSliderValueFromNavigationKey,
  normalizeSliderValue,
  type SliderStep,
  type SliderValueConstraints,
} from "./slider-value";

type NativeSliderProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  | "children"
  | "defaultValue"
  | "max"
  | "min"
  | "onChange"
  | "onInput"
  | "onKeyDown"
  | "onLostPointerCapture"
  | "onPointerCancel"
  | "onPointerDown"
  | "onPointerMove"
  | "onPointerUp"
  | "step"
  | "type"
  | "value"
>;

export interface SliderProps extends NativeSliderProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: SliderStep;
  readonly onPreview?: (value: number) => void;
  readonly onCommit?: (value: number) => void;
}

/**
 * Accessible range input with a relative, captured pointer gesture.
 * Pointer previews stay transient until one commit on release.
 */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    value,
    min,
    max,
    step = 1,
    className,
    disabled,
    onPreview,
    onCommit,
    ...inputProps
  },
  forwardedRef,
): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sessionRef = useRef<SliderPointerSession | null>(null);
  const setInputRef = useCallback((input: HTMLInputElement | null): void => {
    inputRef.current = input;

    if (typeof forwardedRef === "function") {
      forwardedRef(input);
    } else if (forwardedRef !== null) {
      forwardedRef.current = input;
    }
  }, [forwardedRef]);
  const initialConstraints: SliderValueConstraints = {
    minimum: min,
    maximum: max,
    step,
  };

  useEffect(() => {
    const input = inputRef.current;

    if (input !== null && sessionRef.current === null) {
      setInputValue(input, normalizeSliderValue(
        value,
        getInputConstraints(input),
      ));
    }
  }, [max, min, step, value]);

  const previewValue = (input: HTMLInputElement, nextValue: number): void => {
    const appliedValue = setInputValue(input, nextValue);

    input.dispatchEvent(new Event("input", { bubbles: true }));
    onPreview?.(appliedValue);
  };
  const commitValue = (input: HTMLInputElement, nextValue: number): void => {
    const appliedValue = setInputValue(input, nextValue);

    input.dispatchEvent(new Event("change", { bubbles: true }));
    onCommit?.(appliedValue);
  };
  const releasePointer = (
    input: HTMLInputElement,
    pointerId: number,
  ): void => {
    if (input.hasPointerCapture(pointerId)) {
      input.releasePointerCapture(pointerId);
    }
  };
  const cancelSession = (
    event: ReactPointerEvent<HTMLInputElement>,
  ): void => {
    const session = sessionRef.current;

    if (session === null) {
      return;
    }

    const restoredValue = endSliderPointerSession(
      session,
      event.pointerId,
      "cancel",
    );

    if (restoredValue === null) {
      return;
    }

    sessionRef.current = null;
    releasePointer(event.currentTarget, event.pointerId);

    if (restoredValue !== session.currentValue) {
      previewValue(event.currentTarget, restoredValue);
    }
  };

  return (
    <input
      {...inputProps}
      ref={setInputRef}
      className={className === undefined ? "slider" : `slider ${className}`}
      type="range"
      min={min}
      max={max}
      step={step}
      defaultValue={normalizeSliderValue(value, initialConstraints)}
      disabled={disabled}
      onPointerDownCapture={(event) => {
        if (
          disabled
          || sessionRef.current !== null
          || !event.isPrimary
          || (event.pointerType === "mouse" && event.button !== 0)
        ) {
          return;
        }

        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        sessionRef.current = startSliderPointerSession(
          event.pointerId,
          event.clientX,
          event.currentTarget.valueAsNumber,
          event.currentTarget.getBoundingClientRect().width,
        );
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMoveCapture={(event) => {
        const session = sessionRef.current;

        if (session === null || session.pointerId !== event.pointerId) {
          return;
        }

        event.preventDefault();
        const movedSession = moveSliderPointerSession(
          session,
          event.pointerId,
          event.clientX,
          getInputConstraints(event.currentTarget),
        );

        sessionRef.current = movedSession;

        if (movedSession.currentValue !== session.currentValue) {
          previewValue(event.currentTarget, movedSession.currentValue);
        }
      }}
      onPointerUpCapture={(event) => {
        const session = sessionRef.current;

        if (session === null) {
          return;
        }

        const committedValue = endSliderPointerSession(
          session,
          event.pointerId,
          "commit",
        );

        if (committedValue === null) {
          return;
        }

        event.preventDefault();
        sessionRef.current = null;
        releasePointer(event.currentTarget, event.pointerId);
        commitValue(event.currentTarget, committedValue);
      }}
      onPointerCancelCapture={cancelSession}
      onLostPointerCaptureCapture={cancelSession}
      onKeyDown={(event) => {
        if (disabled || sessionRef.current !== null) {
          return;
        }

        const nextValue = getSliderValueFromNavigationKey(
          event.currentTarget.valueAsNumber,
          event.key,
          getInputConstraints(event.currentTarget),
        );

        if (nextValue === null) {
          return;
        }

        event.preventDefault();

        if (nextValue !== event.currentTarget.valueAsNumber) {
          previewValue(event.currentTarget, nextValue);
          commitValue(event.currentTarget, nextValue);
        }
      }}
    />
  );
});

function getInputConstraints(input: HTMLInputElement): SliderValueConstraints {
  const minimum = input.min === "" ? 0 : Number(input.min);
  const maximum = input.max === "" ? 100 : Number(input.max);
  const parsedStep = Number(input.step);
  const step = input.step === "any"
    ? "any"
    : Number.isFinite(parsedStep) && parsedStep > 0
      ? parsedStep
      : 1;

  return { minimum, maximum, step };
}

function setInputValue(input: HTMLInputElement, value: number): number {
  input.value = String(value);
  return input.valueAsNumber;
}
