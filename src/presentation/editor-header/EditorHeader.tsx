import React from "react";
import {
  EditorContextPanel,
  type EditorContextPanelProps,
} from "./EditorContextPanel";
import {
  EditorMasterBusControls,
  type EditorMasterBusControlsProps,
} from "./EditorMasterBusControls";
import {
  EditorProjectControls,
  type EditorProjectControlsProps,
} from "./EditorProjectControls";
import {
  EditorTransportControls,
  type EditorTransportControlsProps,
} from "./EditorTransportControls";

export interface EditorHeaderProps {
  readonly projectControls: EditorProjectControlsProps;
  readonly transportControls: EditorTransportControlsProps;
  readonly context: EditorContextPanelProps;
  readonly masterBus: EditorMasterBusControlsProps;
}

/** Composes the independent controls displayed in the editor header. */
export function EditorHeader({
  projectControls,
  transportControls,
  context,
  masterBus,
}: EditorHeaderProps): React.JSX.Element {
  return (
    <header className="app-header">
      <section
        className="left"
        aria-label="Project actions and transport"
      >
        <EditorProjectControls {...projectControls} />
        <EditorTransportControls {...transportControls} />
        <EditorContextPanel {...context} />
      </section>

      <section className="right" aria-label="Master bus">
        <EditorMasterBusControls {...masterBus} />
      </section>
    </header>
  );
}
