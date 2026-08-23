import { EDITOR_CONSTANTS, VIEWPORT_CONSTANTS } from "../../../config/editor-config";

import {
  type ClipId,
} from "../../../domain/identifiers";
import {
  type ProjectDocument,
} from "../../../domain/project/project-document";
import {
  MAXIMUM_ENTITY_ID_LENGTH,
} from "../../../domain/identifiers";
import { createGridSettings, parseGridSubdivision, type GridSettings } from "../../../editor/model/grid-settings";
import {
  isTonalPatternId,
  type PitchSnapSettings,
  type TonalPatternType,
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

    if ("playheadTick" in clipState) {
      readNumberInRange(
        clipState["playheadTick"],
        `${clipStatePath}.playheadTick`,
        0,
        clip.timeline.durationTicks,
      );
    }

    clipStatesById[clipId] = {
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

  const patternTypeSource = settings["patternType"];
  let patternType: TonalPatternType = "scale";
  if (patternTypeSource !== undefined) {
    const typeStr = readString(
      patternTypeSource,
      `${path}.patternType`,
      16,
    );
    if (typeStr !== "scale" && typeStr !== "chord") {
       return fail("INVALID_DATA", `${path}.patternType`, "Invalid pattern type.");
    }
    patternType = typeStr as TonalPatternType;
  }

  const enabled = readBoolean(
    settings["enabled"],
    `${path}.enabled`,
  );
  const visualGuideEnabled = readBoolean(
    settings["visualGuideEnabled"],
    `${path}.visualGuideEnabled`,
  );

  return {
    enabled,
    visualGuideEnabled,
    rootNote: readString(
      settings["rootNote"] ?? "C",
      `${path}.rootNote`,
      10,
    ),
    patternType,
    patternId,
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
