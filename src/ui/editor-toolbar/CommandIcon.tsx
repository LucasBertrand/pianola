import React from "react";

interface CommandIconProps {
  readonly kind:
    | "copy"
    | "cut"
    | "paste"
    | "slice"
    | "mute"
    | "unmute"
    | "play"
    | "pause"
    | "marker";
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
    case "mute":
      return <><path d="M5 10h4l4-4v12l-4-4H5Z" /><path d="m16 9 4 6M20 9l-4 6" /></>;
    case "unmute":
      return <><path d="M5 10h4l4-4v12l-4-4H5Z" /><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>;
    case "pause":
      return <><path d="M9 7v10M15 7v10" /></>;
    case "play":
      return <path d="m9 6 9 6-9 6Z" />;
    case "marker":
      return <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" /></>;
  }
}
