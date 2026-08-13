import type {
  InstrumentConfig,
} from "../domain/instruments/instrument";
import type {
  InstrumentId,
} from "../domain/identifiers";

/**
 * Session-only instrument overrides applied while compiling an audio snapshot.
 * This value is deliberately absent from ProjectDocument and ProjectStore.
 */
export interface InstrumentSettingsPreviewLayer {
  readonly configsByInstrumentId: Readonly<
    Record<InstrumentId, InstrumentConfig>
  >;
}

export const EMPTY_INSTRUMENT_SETTINGS_PREVIEW:
  InstrumentSettingsPreviewLayer = Object.freeze({
    configsByInstrumentId: Object.freeze({}),
  });

export function setInstrumentSettingsPreview(
  layer: InstrumentSettingsPreviewLayer,
  instrumentId: InstrumentId,
  config: InstrumentConfig,
): InstrumentSettingsPreviewLayer {
  return Object.freeze({
    configsByInstrumentId: Object.freeze({
      ...layer.configsByInstrumentId,
      [instrumentId]: cloneInstrumentConfig(config),
    }),
  });
}

export function clearInstrumentSettingsPreview(
  layer: InstrumentSettingsPreviewLayer,
  instrumentId: InstrumentId,
): InstrumentSettingsPreviewLayer {
  if (layer.configsByInstrumentId[instrumentId] === undefined) {
    return layer;
  }

  const configsByInstrumentId = {
    ...layer.configsByInstrumentId,
  };

  delete configsByInstrumentId[instrumentId];

  if (Object.keys(configsByInstrumentId).length === 0) {
    return EMPTY_INSTRUMENT_SETTINGS_PREVIEW;
  }

  return Object.freeze({
    configsByInstrumentId: Object.freeze(configsByInstrumentId),
  });
}

function cloneInstrumentConfig(
  config: InstrumentConfig,
): InstrumentConfig {
  return Object.freeze({
    ...config,
    envelope: Object.freeze({ ...config.envelope }),
    filterEnvelope: Object.freeze({ ...config.filterEnvelope }),
  });
}
