import React from "react";

export interface AutoFitViewportButtonProps {
  readonly onAutoFit: () => void;
}

export function AutoFitViewportButton({
  onAutoFit,
}: AutoFitViewportButtonProps): React.JSX.Element {
  return (
    <button
      className="auto-fit-trigger pitch-snap-toggle"
      type="button"
      title="Auto-fit viewport"
      aria-label="Auto-fit viewport"
      onClick={onAutoFit}
    >
      <svg
        className="pitch-snap-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 3h6v6" />
        <path d="M9 21H3v-6" />
        <path d="M21 3l-7 7" />
        <path d="M3 21l7-7" />
      </svg>
    </button>
  );
}
