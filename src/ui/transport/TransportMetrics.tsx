import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import type {
  EditorCommandPort,
} from "../../use-cases/commands/editor-command-service";
import {
  EDITOR_CONSTANTS,
} from "../../config/editor-config";
import {
  PROJECT_CONSTANTS,
} from "../../config/domain-limits";
import type {
  PianoRollCommand,
} from "../../domain/commands/command-types";
import {
  getActiveClip,
  getClipTimeSignature,
  type TimeSignature,
} from "../../domain/model";
import type {
  ProjectStorePort,
} from "../../domain/project-store";
import {
  createGridSettings,
  parseGridSubdivision,
  type GridSettings,
} from "../../editor/model/grid-settings";
import type {
  MutableRenderSignal,
} from "../../editor/model/render-signal";

export interface TransportMetricsProps {
  readonly projectStore: ProjectStorePort;
  readonly editorCommands: EditorCommandPort;
  readonly gridSettings: MutableRenderSignal<GridSettings>;
}

export function TransportMetrics(
  props: TransportMetricsProps,
): React.JSX.Element {
  const {
    projectStore,
    editorCommands,
    gridSettings,
  } = props;
  const tempoInputRef = useRef<HTMLInputElement | null>(null);
  const gridSelectRef = useRef<HTMLSelectElement | null>(null);
  const subdivisionSelectRef =
    useRef<HTMLSelectElement | null>(null);
  const [meterValue, setMeterValue] = useState(() =>
    formatTimeSignatureValue(
      getClipTimeSignature(getActiveClip(projectStore.getState())),
    ));

  useEffect(() => {
    const updateTransportControls = (): void => {
      const state = projectStore.getState();
      const activeClip = getActiveClip(state);

      if (
        tempoInputRef.current !== null
        && document.activeElement !== tempoInputRef.current
      ) {
        tempoInputRef.current.value = state.clock.tempoBpm.toFixed(1);
      }

      setMeterValue(
        formatTimeSignatureValue(getClipTimeSignature(activeClip)),
      );
    };
    const updateGridControl = (): void => {
      const settings = gridSettings.get();

      if (gridSelectRef.current !== null) {
        gridSelectRef.current.value = String(
          settings.baseResolutionTicks,
        );
      }

      if (subdivisionSelectRef.current !== null) {
        subdivisionSelectRef.current.value = settings.subdivision;
      }
    };
    const unsubscribeProject = projectStore.subscribe(
      updateTransportControls,
    );
    const unsubscribeGrid = gridSettings.subscribe(
      updateGridControl,
    );

    updateTransportControls();
    updateGridControl();

    return (): void => {
      unsubscribeProject();
      unsubscribeGrid();
    };
  }, [gridSettings, projectStore]);

  const dispatchCommand = useCallback(
    (command: PianoRollCommand, label: string): void => {
      editorCommands.dispatch([command], label);
    },
    [editorCommands],
  );

  const handleTempoCommit = useCallback(
    (event: FocusEvent<HTMLInputElement>): void => {
      const requestedBpm = event.currentTarget.valueAsNumber;

      if (!Number.isFinite(requestedBpm)) {
        event.currentTarget.value =
          projectStore.getState().clock.tempoBpm.toFixed(1);
        return;
      }

      const bpm = Math.min(
        PROJECT_CONSTANTS.maximumTempoBpm,
        Math.max(
          PROJECT_CONSTANTS.minimumTempoBpm,
          Math.round(
            requestedBpm / PROJECT_CONSTANTS.tempoStepBpm,
          ) * PROJECT_CONSTANTS.tempoStepBpm,
        ),
      );

      event.currentTarget.value = bpm.toFixed(1);
      dispatchCommand({ type: "UpdateTempo", bpm }, "Update tempo");
    },
    [dispatchCommand, projectStore],
  );
  const handleTempoKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === "Enter") {
        event.currentTarget.blur();
      }
    },
    [],
  );
  const handleMeterChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const timeSignature = parseTimeSignature(
        event.currentTarget.value,
      );

      if (timeSignature === null) {
        return;
      }

      setMeterValue(event.currentTarget.value);
      const clipId = getActiveClip(projectStore.getState()).id;
      dispatchCommand(
        { type: "UpdateTimeSignature", clipId, timeSignature },
        "Update meter",
      );
    },
    [dispatchCommand, projectStore],
  );
  const handleGridChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
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
  const handleSubdivisionChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const subdivision = parseGridSubdivision(
        event.currentTarget.value,
      );

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
    <div className="transport-metrics" aria-label="Transport settings">
      <label className="metric">
        <small>Tempo</small>
        <input
          ref={tempoInputRef}
          className="metric-control tempo-control"
          type="number"
          min={PROJECT_CONSTANTS.minimumTempoBpm}
          max={PROJECT_CONSTANTS.maximumTempoBpm}
          step={PROJECT_CONSTANTS.tempoStepBpm}
          defaultValue={PROJECT_CONSTANTS.demoTempoBpm.toFixed(1)}
          inputMode="decimal"
          onBlur={handleTempoCommit}
          onKeyDown={handleTempoKeyDown}
          aria-label="Tempo in beats per minute"
        />
        <span>BPM</span>
      </label>
      <label className="metric">
        <small>Meter</small>
        <select
          className="metric-control metric-select"
          value={meterValue}
          onChange={handleMeterChange}
          aria-label="Time signature"
        >
          {isConfiguredTimeSignatureValue(meterValue)
            ? null
            : (
                <option value={meterValue}>
                  {meterValue.replace("/", " / ")}
                </option>
              )}
          {EDITOR_CONSTANTS.transportMeterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="metric">
        <small>Grid</small>
        <select
          ref={gridSelectRef}
          className="metric-control metric-select"
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
      </label>
      <label className="metric">
        <small>Subdivision</small>
        <select
          ref={subdivisionSelectRef}
          className="metric-control metric-select"
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
      </label>
    </div>
  );
}

function parseTimeSignature(value: string): TimeSignature | null {
  const parts = value.split("/");

  if (parts.length !== 2) {
    return null;
  }

  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);

  if (
    !Number.isSafeInteger(numerator)
    || numerator <= 0
    || (
      denominator !== 1
      && denominator !== 2
      && denominator !== 4
      && denominator !== 8
      && denominator !== 16
      && denominator !== 32
    )
  ) {
    return null;
  }

  return { numerator, denominator };
}

function formatTimeSignatureValue(
  timeSignature: TimeSignature,
): string {
  return `${timeSignature.numerator}/${timeSignature.denominator}`;
}

function isConfiguredTimeSignatureValue(value: string): boolean {
  return EDITOR_CONSTANTS.transportMeterOptions.some(
    (option) => option.value === value,
  );
}
