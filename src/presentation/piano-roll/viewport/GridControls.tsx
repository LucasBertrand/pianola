import React from "react";
import {
  createGridSettings,
  parseGridSubdivision,
  type GridSettings,
} from "../../../editor-core/model/grid-settings";
import {
  EDITOR_CONSTANTS,
} from "../../../editor-core/model/editor-constants";
import type {
  MutableRenderSignal,
} from "../../../editor-core/model/render-signal";

export interface GridControlsProps {
  readonly gridSettings: MutableRenderSignal<GridSettings>;
}

/** Bridges the grid signal to the two uncontrolled select elements. */
export function GridControls({
  gridSettings,
}: GridControlsProps): React.JSX.Element {
  const gridSelectRef = React.useRef<HTMLSelectElement | null>(null);
  const subdivisionSelectRef = React.useRef<HTMLSelectElement | null>(null);

  React.useEffect(() => {
    const updateGridControl = (): void => {
      const settings = gridSettings.get();

      if (gridSelectRef.current !== null) {
        gridSelectRef.current.value = String(settings.baseResolutionTicks);
      }

      if (subdivisionSelectRef.current !== null) {
        subdivisionSelectRef.current.value = settings.subdivision;
      }
    };
    const unsubscribeGrid = gridSettings.subscribe(updateGridControl);

    updateGridControl();
    return unsubscribeGrid;
  }, [gridSettings]);

  const handleGridChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>): void => {
      const baseResolutionTicks = Number(event.currentTarget.value);

      if (
        Number.isSafeInteger(baseResolutionTicks)
        && baseResolutionTicks > 0
      ) {
        gridSettings.set(
          createGridSettings(
            baseResolutionTicks,
            gridSettings.get().subdivision,
          ),
        );
      }
    },
    [gridSettings],
  );
  const handleSubdivisionChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>): void => {
      const subdivision = parseGridSubdivision(event.currentTarget.value);

      if (subdivision === null) {
        return;
      }

      gridSettings.set(
        createGridSettings(
          gridSettings.get().baseResolutionTicks,
          subdivision,
        ),
      );
    },
    [gridSettings],
  );

  return (
    <div
      className="grid-control"
      aria-label="Grid settings"
    >
      <div className="grid-control-header">
        <select
          ref={gridSelectRef}
          className="grid-control-select"
          defaultValue="240"
          onChange={handleGridChange}
          aria-label="Grid resolution"
        >
          {EDITOR_CONSTANTS.gridResolutionOptions.map((option) => (
            <option key={option.ticks} value={option.ticks}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          ref={subdivisionSelectRef}
          className="grid-control-select"
          defaultValue="straight"
          onChange={handleSubdivisionChange}
          aria-label="Grid subdivision"
        >
          {EDITOR_CONSTANTS.gridSubdivisionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
