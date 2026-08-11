import React from "react";
import {
  MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
  MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
} from "../../domain/model";

const SUBTRACTIVE_POLYPHONY_OPTIONS = Array.from(
  {
    length:
      MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY
      - MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY
      + 1,
  },
  (_, index) => MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY + index,
);

export interface SubtractivePolyphonySelectProps {
  readonly value: number;
  readonly instrumentName: string;
  readonly onCommit: (value: number) => void;
}

/** Controls the active clip's subtractive synthesizer polyphony. */
export function SubtractivePolyphonySelect({
  value,
  instrumentName,
  onCommit,
}: SubtractivePolyphonySelectProps): React.JSX.Element {
  return (
    <label
      className="subtractive-polyphony-control"
      title={`Subtractive synth polyphony for ${instrumentName}`}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <span aria-hidden="true">×</span>
      <select
        value={value}
        aria-label={`Subtractive synth polyphony for ${instrumentName}`}
        onChange={(event) => {
          onCommit(Number(event.currentTarget.value));
        }}
      >
        {SUBTRACTIVE_POLYPHONY_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
