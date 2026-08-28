import React, {
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  createPortal,
} from "react-dom";

export type ProjectInspectorSection = "instruments" | "clips";

export interface PianoRollWorkspaceLayoutProps {
  readonly appShellRef: RefObject<HTMLElement | null>;
  readonly stageRef: RefObject<HTMLDivElement | null>;
  readonly productName: string;
  readonly inspectorOpen: boolean;
  readonly inspectorSection: ProjectInspectorSection;
  readonly header: ReactNode;
  readonly renderToolbar: () => ReactNode;
  readonly pianoKeyboard: ReactNode;
  readonly ruler: ReactNode;
  readonly layers: ReactNode;
  readonly globalLasso: ReactNode;
  readonly playhead: ReactNode;
  readonly viewportControls: ReactNode;
  readonly inspectorResizeHandle: ReactNode;
  readonly renderInspector: (
    setToolbarHost: (element: HTMLDivElement | null) => void,
  ) => ReactNode;
  readonly overlays: ReactNode;
}

export function getPianoRollWorkspaceClassName(
  inspectorOpen: boolean,
  inspectorSection: ProjectInspectorSection,
): string {
  return `workspace${inspectorOpen ? " is-project-inspector-open" : ""}${
    inspectorOpen && inspectorSection === "clips"
      ? " is-clips-inspector-open"
      : ""
  }`;
}

/** Owns workspace DOM placement and the inspector-toolbar portal only. */
export function PianoRollWorkspaceLayout({
  appShellRef,
  stageRef,
  productName,
  inspectorOpen,
  inspectorSection,
  header,
  renderToolbar,
  pianoKeyboard,
  ruler,
  layers,
  globalLasso,
  playhead,
  viewportControls,
  inspectorResizeHandle,
  renderInspector,
  overlays,
}: PianoRollWorkspaceLayoutProps): React.JSX.Element {
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);

  return (
    <main
      ref={appShellRef}
      className="app-shell"
      aria-label={productName}
      data-project-revision="0"
    >
      {header}
      <section
        className={getPianoRollWorkspaceClassName(
          inspectorOpen,
          inspectorSection,
        )}
      >
        <div className="editor-panel">
          {toolbarHost === null
            ? null
            : createPortal(renderToolbar(), toolbarHost)}
          <div className="roll-frame">
            {pianoKeyboard}
            <div ref={stageRef} className="roll-stage">
              {ruler}
              <div className="canvas-host">{layers}</div>
              {globalLasso}
              {playhead}
            </div>
          </div>
          {viewportControls}
        </div>
        {inspectorResizeHandle}
        {renderInspector(setToolbarHost)}
      </section>
      {overlays}
    </main>
  );
}
