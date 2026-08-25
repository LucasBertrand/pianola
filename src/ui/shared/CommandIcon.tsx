import React from "react";

interface CommandIconProps {
  readonly kind:
    | "copy"
    | "cut"
    | "paste"
    | "slice"
    | "disable"
    | "enable"
    | "play"
    | "pause";
}

/** Small dependency-free line icons sharing the menu's visual language. */
export function CommandIcon({ kind }: CommandIconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      {renderIconPaths(kind)}
    </svg>
  );
}

function renderIconPaths(kind: CommandIconProps["kind"]): React.ReactNode {
  switch (kind) {
    case "copy":
      return <><rect x="8" y="8" width="10" height="10" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>;
    case "cut":
      return <><circle cx="6" cy="7" r="3" /><circle cx="6" cy="17" r="3" /><path d="m8.7 8.4 10.3 6.2" /><path d="m8.7 15.6 10.3-6.2" /></>;
    case "paste":
      return <><path d="M9 5h6M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2H9V5Z" /><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /></>;
    case "slice":
      return <><path d="M5 4v16M19 4v16M5 12h14" /><path d="m9 9 3 3-3 3M15 9l-3 3 3 3" /></>;
    case "disable":
      return <><circle cx="12" cy="12" r="8" /><path d="m6.4 6.4 11.2 11.2" /></>;
    case "enable":
      return <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.3 2.3 4.8-5" /></>;
    case "pause":
      return <><path d="M9 7v10M15 7v10" /></>;
    case "play":
      return <path d="m9 6 9 6-9 6Z" />;
  }
}
