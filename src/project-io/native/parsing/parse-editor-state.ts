import { EDITOR_CONSTANTS, VIEWPORT_CONSTANTS } from "../../../config/editor-config";
import { TONAL_SNAP_CONSTANTS } from "../../../config/music-config";
import type { ClipId, ProjectDocument } from "../../../domain/model";
import {
  MAXIMUM_ENTITY_ID_LENGTH,
} from "../../../domain/model";
import { createGridSettings, parseGridSubdivision, type GridSettings } from "../../../editor/model/grid-settings";
import {
  getTonalPatternDefinition,
  isTonalPatternId,
  type PitchSnapSettings,
} from "../../../music/pitch-snap";
import { fail } from "../native-project-error";
import type {
  NativeClipEditorState,
  NativeEditorState,
  NativeViewportState,
} from "../native-project-schema";
import {
  assertExactRecordKeys,
  readBoolean,
  readIntegerInRange,
  readNonEmptyString,
  readNumberInRange,
  readPositiveSafeInteger,
  readRecord,
  readString,
} from "./json-readers";

const MAXIMUM_ID_LENGTH = MAXIMUM_ENTITY_ID_LENGTH;

export function parseEditorState(
  source: unknown,
  projectState: ProjectDocument,
  path: string,
): NativeEditorState {
  const editor = readRecord(source, path);
  const activeClipId = readNonEmptyString(
    editor["activeClipId"],
    `${path}.activeClipId`,
    MAXIMUM_ID_LENGTH,
  );

  if (projectState.clipsById[activeClipId] === undefined) {
    fail(
      "INVALID_DATA",
      `${path}.activeClipId`,
      "The active clip does not exist in the project document.",
    );
  }
  const selectedInstrumentSource = editor["selectedInstrumentId"];
  const selectedInstrumentId = selectedInstrumentSource === null
    ? null
    : readNonEmptyString(
        selectedInstrumentSource,
        `${path}.selectedInstrumentId`,
        MAXIMUM_ID_LENGTH,
      );

  if (
    selectedInstrumentId !== null
    && projectState.projectInstrumentsById[selectedInstrumentId] === undefined
  ) {
    fail(
      "INVALID_DATA",
      `${path}.selectedInstrumentId`,
      "The selected instrument does not exist in the project.",
    );
  }

  const selectionMode = readString(
    editor["selectionMode"],
    `${path}.selectionMode`,
    16,
  );

  if (
    selectionMode !== "replace"
    && selectionMode !== "add"
    && selectionMode !== "subtract"
  ) {
    fail(
      "INVALID_DATA",
      `${path}.selectionMode`,
      "The selection mode is not supported.",
    );
  }

  const noteColorMode = readString(
    editor["noteColorMode"],
    `${path}.noteColorMode`,
    16,
  );

  if (noteColorMode !== "instrument" && noteColorMode !== "pitch") {
    fail(
      "INVALID_DATA",
      `${path}.noteColorMode`,
      "The note color mode is not supported.",
    );
  }

  const sourceClipStates = readRecord(
    editor["clipStatesById"],
    `${path}.clipStatesById`,
  );
  assertExactRecordKeys(
    sourceClipStates,
    projectState.clipOrder,
    `${path}.clipStatesById`,
  );
  const clipStatesById: Record<ClipId, NativeClipEditorState> = {};

  for (const clipId of projectState.clipOrder) {
    const clip = projectState.clipsById[clipId];
    const clipStatePath = `${path}.clipStatesById.${clipId}`;
    const clipState = readRecord(
      sourceClipStates[clipId],
      clipStatePath,
    );

    if (clip === undefined) {
      fail("INVALID_DATA", clipStatePath, "The clip does not exist.");
    }

    clipStatesById[clipId] = {
      playheadTick: readNumberInRange(
        clipState["playheadTick"],
        `${clipStatePath}.playheadTick`,
        0,
        clip.timeline.durationTicks,
      ),
      pitchSnapSettings: parsePitchSnapSettings(
        clipState["pitchSnapSettings"],
        `${clipStatePath}.pitchSnapSettings`,
      ),
      gridSettings: parseGridSettings(
        clipState["gridSettings"],
        `${clipStatePath}.gridSettings`,
      ),
      viewport: parseNativeViewport(
        clipState["viewport"],
        `${clipStatePath}.viewport`,
      ),
    };
  }

  return {
    activeClipId,
    selectedInstrumentId,
    selectionMode,
    noteColorMode,
    pitchPreviewEnabled: readBoolean(
      editor["pitchPreviewEnabled"],
      `${path}.pitchPreviewEnabled`,
    ),
    clipStatesById,
  };
}

function parsePitchSnapSettings(
  source: unknown,
  path: string,
): PitchSnapSettings {
  const settings = readRecord(source, path);
  const patternId = readString(
    settings["patternId"],
    `${path}.patternId`,
    64,
  );

  if (!isTonalPatternId(patternId)) {
    return fail(
      "INVALID_DATA",
      `${path}.patternId`,
      "The tonal pattern is not supported.",
    );
  }

  const scaleDegreeSource = settings["scaleDegreeIndex"];
  const scaleDegreeIndex = scaleDegreeSource === null
    ? null
    : readIntegerInRange(
        scaleDegreeSource,
        `${path}.scaleDegreeIndex`,
        0,
        getTonalPatternDefinition(patternId).intervals.length - 1,
      );
  const enabled = readBoolean(
    settings["enabled"],
    `${path}.enabled`,
  );
  const visualGuideEnabled = readBoolean(
    settings["visualGuideEnabled"],
    `${path}.visualGuideEnabled`,
  );

  if (enabled && !visualGuideEnabled) {
    return fail(
      "INVALID_DATA",
      `${path}.visualGuideEnabled`,
      "The tonal guide must be enabled while pitch snapping is active.",
    );
  }

  return {
    enabled,
    visualGuideEnabled,
    tonicPitchClass: readIntegerInRange(
      settings["tonicPitchClass"],
      `${path}.tonicPitchClass`,
      0,
      TONAL_SNAP_CONSTANTS.tonicOptions.length - 1,
    ),
    patternId,
    scaleDegreeIndex,
  };
}

function parseGridSettings(
  source: unknown,
  path: string,
): GridSettings {
  const settings = readRecord(source, path);
  const baseResolutionTicks = readPositiveSafeInteger(
    settings["baseResolutionTicks"],
    `${path}.baseResolutionTicks`,
  );
  const subdivisionValue = readString(
    settings["subdivision"],
    `${path}.subdivision`,
    16,
  );
  const subdivision = parseGridSubdivision(subdivisionValue);
  const supportedResolution =
    EDITOR_CONSTANTS.gridResolutionOptions.some(
      (option) => option.ticks === baseResolutionTicks,
    );

  if (subdivision === null || !supportedResolution) {
    return fail(
      "INVALID_DATA",
      path,
      "The grid configuration is not supported.",
    );
  }

  const gridSettings = createGridSettings(
    baseResolutionTicks,
    subdivision,
  );
  const storedResolutionTicks = readPositiveSafeInteger(
    settings["resolutionTicks"],
    `${path}.resolutionTicks`,
  );

  if (storedResolutionTicks !== gridSettings.resolutionTicks) {
    return fail(
      "INVALID_DATA",
      `${path}.resolutionTicks`,
      "The derived grid resolution is inconsistent.",
    );
  }

  return gridSettings;
}

function parseNativeViewport(
  source: unknown,
  path: string,
): NativeViewportState {
  const viewport = readRecord(source, path);

  return {
    zoomX: readNumberInRange(
      viewport["zoomX"],
      `${path}.zoomX`,
      VIEWPORT_CONSTANTS.minimumStoredZoom,
      VIEWPORT_CONSTANTS.maximumHorizontalZoom,
    ),
    zoomY: readNumberInRange(
      viewport["zoomY"],
      `${path}.zoomY`,
      VIEWPORT_CONSTANTS.minimumStoredZoom,
      VIEWPORT_CONSTANTS.maximumVerticalZoom,
    ),
    scrollX: readNumberInRange(
      viewport["scrollX"],
      `${path}.scrollX`,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    scrollY: readNumberInRange(
      viewport["scrollY"],
      `${path}.scrollY`,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
  };
}
