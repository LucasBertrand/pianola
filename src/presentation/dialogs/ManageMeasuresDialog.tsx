import React, { useState } from "react";

export interface ManageMeasuresDialogProps {
  readonly operation: "insert" | "remove";
  readonly maximumCountByPosition: Readonly<Record<"before" | "after", number>>;
  readonly onConfirm: (count: number, position: "before" | "after") => void;
  readonly onCancel: () => void;
}

export function ManageMeasuresDialog({
  operation,
  maximumCountByPosition,
  onConfirm,
  onCancel,
}: ManageMeasuresDialogProps): React.JSX.Element {
  const [count, setCount] = useState<number>(1);
  const [position, setPosition] = useState<"before" | "after">(
    maximumCountByPosition.after > 0 ? "after" : "before",
  );
  const maximumCount = maximumCountByPosition[position];
  const isRemoval = operation === "remove";

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

          if (
            Number.isSafeInteger(count)
            && count >= 1
            && count <= maximumCount
          ) {
            onConfirm(count, position);
          }
        }}
      >
        <div className="application-dialog-heading" style={{ marginBottom: "1rem" }}>
          <span className="application-dialog-mark" aria-hidden="true">
            {isRemoval ? "−" : "+"}
          </span>
          <h2 id="manage-measures-dialog-title">
            {isRemoval ? "Remove measures" : "Add measures"}
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
              max={maximumCount}
              step={1}
              autoFocus
              aria-label={`Number of measures to ${operation}`}
              style={{ flex: "1 1 auto", minWidth: 0, textAlign: "center" }}
              onChange={(event) => {
                const val = event.currentTarget.valueAsNumber;
                if (
                  Number.isSafeInteger(val)
                  && val > 0
                  && val <= maximumCount
                ) {
                  setCount(val);
                } else if (event.currentTarget.value === "") {
                  // Allow clearing the input temporarily
                  setCount("" as unknown as number);
                }
              }}
              onBlur={() => {
                if (!Number.isSafeInteger(count) || count < 1) {
                  setCount(1);
                } else if (count > maximumCount) {
                  setCount(maximumCount);
                }
              }}
            />
            <button
              type="button"
              className="application-dialog-button"
              style={{ padding: "0 1rem", margin: 0, minWidth: "2.5rem" }}
              disabled={count >= maximumCount}
              onClick={() => setCount((c) => Number.isSafeInteger(c)
                ? Math.min(maximumCount, c + 1)
                : 1)}
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
              const nextPosition = event.currentTarget.value as "before" | "after";

              setPosition(nextPosition);
              setCount((currentCount) => Math.min(
                Number.isSafeInteger(currentCount) ? currentCount : 1,
                maximumCountByPosition[nextPosition],
              ));
            }}
          >
            <option
              value="before"
              disabled={maximumCountByPosition.before === 0}
            >
              Before current measure
            </option>
            <option
              value="after"
              disabled={maximumCountByPosition.after === 0}
            >
              After current measure
            </option>
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
            {isRemoval ? "Remove" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
