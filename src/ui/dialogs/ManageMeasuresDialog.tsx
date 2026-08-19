import React, { useState } from "react";

export interface ManageMeasuresDialogProps {
  readonly onConfirm: (count: number, position: "before" | "after") => void;
  readonly onCancel: () => void;
}

export function ManageMeasuresDialog({
  onConfirm,
  onCancel,
}: ManageMeasuresDialogProps): React.JSX.Element {
  const [count, setCount] = useState<number>(1);
  const [position, setPosition] = useState<"before" | "after">("after");

  return (
    <div className="application-dialog-backdrop">
      <form
        className="application-dialog"
        data-tone="default"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-measures-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(count, position);
        }}
      >
        <div className="application-dialog-heading" style={{ marginBottom: "1rem" }}>
          <span className="application-dialog-mark" aria-hidden="true">
            +
          </span>
          <h2 id="manage-measures-dialog-title">
            Add measures
          </h2>
        </div>

        <div className="instrument-preset-dialog-control">
          <span>Number of measures</span>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
            <button
              type="button"
              className="application-dialog-button"
              style={{ padding: "0 1rem", margin: 0, minWidth: "2.5rem" }}
              disabled={count <= 1}
              onClick={() => setCount((c) => Math.max(1, c - 1))}
              aria-label="Decrease measures"
            >
              -
            </button>
            <input
              type="number"
              value={count}
              min={1}
              step={1}
              autoFocus
              aria-label="Number of measures to insert"
              style={{ flex: "1 1 auto", minWidth: 0, textAlign: "center" }}
              onChange={(event) => {
                const val = event.currentTarget.valueAsNumber;
                if (Number.isSafeInteger(val) && val > 0) {
                  setCount(val);
                } else if (event.currentTarget.value === "") {
                  // Allow clearing the input temporarily
                  setCount("" as unknown as number);
                }
              }}
              onBlur={() => {
                if (!Number.isSafeInteger(count) || count < 1) {
                  setCount(1);
                }
              }}
            />
            <button
              type="button"
              className="application-dialog-button"
              style={{ padding: "0 1rem", margin: 0, minWidth: "2.5rem" }}
              onClick={() => setCount((c) => Number.isSafeInteger(c) ? c + 1 : 1)}
              aria-label="Increase measures"
            >
              +
            </button>
          </div>
        </div>

        <label className="instrument-preset-dialog-control">
          <span>Position</span>
          <select
            value={position}
            aria-label="Position relative to current measure"
            onChange={(event) => {
              setPosition(event.currentTarget.value as "before" | "after");
            }}
          >
            <option value="before">Before current measure</option>
            <option value="after">After current measure</option>
          </select>
        </label>

        <div className="application-dialog-actions">
          <button
            className="application-dialog-button"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="application-dialog-button is-primary"
            type="submit"
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
