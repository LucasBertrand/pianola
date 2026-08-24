import { INSTRUMENT_CONSTANTS } from "../../../config/domain-limits";
import {
  type AdsrEnvelope,
  type EffectDescriptor,
  type EffectParameterValue,
  type GenerativeRuleDescriptor,
  type InstrumentConfig,
  type InstrumentPreset,
  type OscillatorWaveform,
  type ProjectInstrument,
  type ProjectInstrumentInterpretation,
  type SubtractiveSynthConfig,
} from "../../../domain/instruments/instrument";
import {
  type ClipInstrumentState,
} from "../../../domain/clips/clip";
import {
  type InstrumentId,
  type PresetId,
} from "../../../domain/identifiers";
import {
  MAXIMUM_DESCRIPTOR_PARAMETER_COUNT,
  MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT,
  MAXIMUM_INSTRUMENT_NAME_LENGTH,
  MAXIMUM_PROJECT_INSTRUMENT_COUNT,
  MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
  MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
} from "../../../domain/instruments/instrument";
import {
  MAXIMUM_ENTITY_ID_LENGTH,
} from "../../../domain/identifiers";
import {
  validateInstrumentPreset,
  validateProjectInstrument,
} from "../../../domain/validation/instrument-validation";
import { fail } from "../native-project-error";
import {
  assertExactRecordKeys,
  type JsonPrimitive,
  type UnknownRecord,
  readArray,
  readBoolean,
  readBoundedArray,
  readFiniteNumber,
  readIntegerInRange,
  readNonEmptyString,
  readNonNegativeNumber,
  readNumberInRange,
  readPositiveNumber,
  readRecord,
  readSafeInteger,
  readString,
} from "./json-readers";

const MAXIMUM_INSTRUMENT_COUNT = MAXIMUM_PROJECT_INSTRUMENT_COUNT;
const MAXIMUM_NAME_LENGTH = MAXIMUM_INSTRUMENT_NAME_LENGTH;
const MAXIMUM_ID_LENGTH = MAXIMUM_ENTITY_ID_LENGTH;
const MAXIMUM_DESCRIPTOR_COUNT = MAXIMUM_INSTRUMENT_DESCRIPTOR_COUNT;
const MAXIMUM_PARAMETER_COUNT = MAXIMUM_DESCRIPTOR_PARAMETER_COUNT;

export function parseInstrumentOrder(
  source: unknown,
  path: string,
): readonly InstrumentId[] {
  const values = readArray(source, path);

  if (values.length > MAXIMUM_INSTRUMENT_COUNT) {
    fail(
      "INVALID_DATA",
      path,
      `A project cannot contain more than ${MAXIMUM_INSTRUMENT_COUNT} instruments.`,
    );
  }

  const instrumentOrder: InstrumentId[] = [];
  const uniqueInstrumentIds = new Set<InstrumentId>();

  for (
    let instrumentIndex = 0;
    instrumentIndex < values.length;
    instrumentIndex += 1
  ) {
    const instrumentId = readNonEmptyString(
      values[instrumentIndex],
      `${path}[${instrumentIndex}]`,
      MAXIMUM_ID_LENGTH,
    );

    if (uniqueInstrumentIds.has(instrumentId)) {
      fail(
        "INVALID_DATA",
        `${path}[${instrumentIndex}]`,
        `ProjectInstrument ID "${instrumentId}" appears more than once.`,
      );
    }

    uniqueInstrumentIds.add(instrumentId);
    instrumentOrder.push(instrumentId);
  }

  return instrumentOrder;
}

export function parsePresetOrder(
  source: unknown,
  path: string,
): readonly PresetId[] {
  const values = readArray(source, path);

  if (
    values.length < 1
    || values.length > MAXIMUM_INSTRUMENT_COUNT
  ) {
    fail(
      "INVALID_DATA",
      path,
      `A project must contain between 1 and ${MAXIMUM_INSTRUMENT_COUNT} presets.`,
    );
  }

  const presetOrder: PresetId[] = [];
  const uniquePresetIds = new Set<PresetId>();

  for (let presetIndex = 0; presetIndex < values.length; presetIndex += 1) {
    const presetId = readNonEmptyString(
      values[presetIndex],
      `${path}[${presetIndex}]`,
      MAXIMUM_ID_LENGTH,
    );

    if (uniquePresetIds.has(presetId)) {
      fail(
        "INVALID_DATA",
        `${path}[${presetIndex}]`,
        `Preset ID "${presetId}" appears more than once.`,
      );
    }

    uniquePresetIds.add(presetId);
    presetOrder.push(presetId);
  }

  return presetOrder;
}

export function parseInstrumentPresets(
  source: unknown,
  presetOrder: readonly PresetId[],
  path: string,
): Readonly<Record<PresetId, InstrumentPreset>> {
  const sourcePresets = readRecord(source, path);

  assertExactRecordKeys(sourcePresets, presetOrder, path);
  const presetsById = Object.create(null) as Record<
    PresetId,
    InstrumentPreset
  >;

  for (const presetId of presetOrder) {
    const presetPath = `${path}.${presetId}`;
    const sourcePreset = readRecord(sourcePresets[presetId], presetPath);
    const storedId = readNonEmptyString(
      sourcePreset["id"],
      `${presetPath}.id`,
      MAXIMUM_ID_LENGTH,
    );

    if (storedId !== presetId) {
      fail(
        "INVALID_DATA",
        `${presetPath}.id`,
        "Preset ID must match its record key.",
      );
    }

    const kind = readString(
      sourcePreset["kind"],
      `${presetPath}.kind`,
      MAXIMUM_NAME_LENGTH,
    );
    const config = parseInstrument(
      sourcePreset["config"],
      `${presetPath}.config`,
    );

    if (kind !== "subtractive" || kind !== config.kind) {
      fail(
        "INVALID_DATA",
        `${presetPath}.kind`,
        `Preset kind "${kind}" is not supported or does not match its configuration.`,
      );
    }

    const preset: InstrumentPreset = {
      id: storedId,
      name: readNonEmptyString(
        sourcePreset["name"],
        `${presetPath}.name`,
        MAXIMUM_NAME_LENGTH,
      ),
      kind,
      config,
    };
    const validation = validateInstrumentPreset(preset);

    if (!validation.valid) {
      const issue = validation.issues[0];

      fail(
        "INVALID_DATA",
        issue === undefined
          ? presetPath
          : `${presetPath}.${issue.path}`,
        issue?.message ?? "Instrument preset is invalid.",
      );
    }

    presetsById[presetId] = preset;
  }

  return presetsById;
}

export function parseClipInstrumentStates(
  source: unknown,
  instrumentOrder: readonly InstrumentId[],
  path: string,
): Readonly<Record<InstrumentId, ClipInstrumentState>> {
  const sourceStates = readRecord(source, path);

  assertExactRecordKeys(sourceStates, instrumentOrder, path);
  const states = Object.create(null) as Record<InstrumentId, ClipInstrumentState>;

  for (const instrumentId of instrumentOrder) {
    const statePath = `${path}.${instrumentId}`;
    const state = readRecord(sourceStates[instrumentId], statePath);

    states[instrumentId] = {
      locked: readBoolean(state["locked"], `${statePath}.locked`),
    };
  }

  return states;
}

export function parseProjectInstruments(
  source: unknown,
  instrumentOrder: readonly InstrumentId[],
  _presetsById: Readonly<Record<PresetId, InstrumentPreset>>,
  path: string,
): Readonly<Record<InstrumentId, ProjectInstrument>> {
  const sourceInstruments = readRecord(source, path);
  assertExactRecordKeys(sourceInstruments, instrumentOrder, path);
  const projectInstrumentsById =
    Object.create(null) as Record<InstrumentId, ProjectInstrument>;

  for (
    let instrumentIndex = 0;
    instrumentIndex < instrumentOrder.length;
    instrumentIndex += 1
  ) {
    const instrumentId = instrumentOrder[instrumentIndex];

    if (instrumentId !== undefined) {
      projectInstrumentsById[instrumentId] = parseProjectInstrument(
        sourceInstruments[instrumentId],
        instrumentId,
        `${path}.${instrumentId}`,
      );
    }
  }

  return projectInstrumentsById;
}

function parseProjectInstrument(
  source: unknown,
  expectedInstrumentId: InstrumentId,
  path: string,
): ProjectInstrument {
  const instrument = readRecord(source, path);
  const id = readNonEmptyString(
    instrument["id"],
    `${path}.id`,
    MAXIMUM_ID_LENGTH,
  );

  if (id !== expectedInstrumentId) {
    fail(
      "INVALID_DATA",
      `${path}.id`,
      `ProjectInstrument ID "${id}" must match its record key "${expectedInstrumentId}".`,
    );
  }

  const color = readString(
    instrument["color"],
    `${path}.color`,
    32,
  );

  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    fail(
      "INVALID_DATA",
      `${path}.color`,
      "ProjectInstrument color must use the #RRGGBB format.",
    );
  }

  const parsedInstrument: ProjectInstrument = {
    id,
    name: readNonEmptyString(
      instrument["name"],
      `${path}.name`,
      MAXIMUM_NAME_LENGTH,
    ),
    color,
    instrument: parseInstrument(
      instrument["instrument"],
      `${path}.instrument`,
    ),
    gain: readNumberInRange(
      instrument["gain"],
      `${path}.gain`,
      INSTRUMENT_CONSTANTS.minimumGain,
      INSTRUMENT_CONSTANTS.maximumGain,
    ),
    muted: readBoolean(instrument["muted"], `${path}.muted`),
    solo: readBoolean(instrument["solo"], `${path}.solo`),
    pan: readNumberInRange(
      instrument["pan"],
      `${path}.pan`,
      -1,
      1,
    ),
    effects: parseEffects(instrument["effects"], `${path}.effects`),
    generativeRules: parseGenerativeRules(
      instrument["generativeRules"],
      `${path}.generativeRules`,
    ),
    interpretation: parseProjectInstrumentInterpretation(
      instrument["interpretation"],
      `${path}.interpretation`,
    ),
  };
  const validation = validateProjectInstrument(parsedInstrument);

  if (!validation.valid) {
    const issue = validation.issues[0];

    fail(
      "INVALID_DATA",
      issue === undefined ? path : `${path}.${issue.path}`,
      issue?.message ?? "ProjectInstrument configuration is invalid.",
    );
  }

  return parsedInstrument;
}

function parseInstrument(
  source: unknown,
  path: string,
): InstrumentConfig {
  const instrument = readRecord(source, path);
  const kind = readString(
    instrument["kind"],
    `${path}.kind`,
    MAXIMUM_NAME_LENGTH,
  );

  if (kind !== "subtractive") {
    return fail(
      "INVALID_DATA",
      `${path}.kind`,
      `Instrument kind "${kind}" is not supported.`
        + " Only subtractive instruments are supported.",
    );
  }

  return parseSubtractiveSynth(instrument, path);
}

function parseSubtractiveSynth(
  instrument: UnknownRecord,
  path: string,
): SubtractiveSynthConfig {
  return {
    kind: "subtractive",
    oscillatorWaveform: parseWaveform(
      instrument["oscillatorWaveform"],
      `${path}.oscillatorWaveform`,
    ),
    oscillatorDetuneCents: readFiniteNumber(
      instrument["oscillatorDetuneCents"],
      `${path}.oscillatorDetuneCents`,
    ),
    oscillatorFreePhase: instrument["oscillatorFreePhase"] === undefined
      ? INSTRUMENT_CONSTANTS.oscillatorFreePhase
      : readBoolean(
        instrument["oscillatorFreePhase"],
        `${path}.oscillatorFreePhase`,
      ),
    polyphony: readIntegerInRange(
      instrument["polyphony"],
      `${path}.polyphony`,
      MINIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
      MAXIMUM_SUBTRACTIVE_SYNTH_POLYPHONY,
    ),
    pulseWidth: readNumberInRange(
      instrument["pulseWidth"],
      `${path}.pulseWidth`,
      INSTRUMENT_CONSTANTS.minimumPulseWidth,
      INSTRUMENT_CONSTANTS.maximumPulseWidth,
    ),
    envelope: parseEnvelope(
      instrument["envelope"],
      `${path}.envelope`,
    ),
    filterCutoffHz: readNumberInRange(
      instrument["filterCutoffHz"],
      `${path}.filterCutoffHz`,
      INSTRUMENT_CONSTANTS.minimumFilterCutoffHz,
      INSTRUMENT_CONSTANTS.maximumFilterCutoffHz,
    ),
    filterResonance: readNumberInRange(
      instrument["filterResonance"],
      `${path}.filterResonance`,
      INSTRUMENT_CONSTANTS.minimumFilterResonance,
      INSTRUMENT_CONSTANTS.maximumFilterResonance,
    ),
    filterKeyTracking: instrument["filterKeyTracking"] === undefined
      ? INSTRUMENT_CONSTANTS.filterKeyTracking
      : readNumberInRange(
        instrument["filterKeyTracking"],
        `${path}.filterKeyTracking`,
        INSTRUMENT_CONSTANTS.minimumFilterKeyTracking,
        INSTRUMENT_CONSTANTS.maximumFilterKeyTracking,
      ),
    filterEnvelopeAmountOctaves: readNumberInRange(
      instrument["filterEnvelopeAmountOctaves"],
      `${path}.filterEnvelopeAmountOctaves`,
      INSTRUMENT_CONSTANTS.minimumFilterEnvelopeAmountOctaves,
      INSTRUMENT_CONSTANTS.maximumFilterEnvelopeAmountOctaves,
    ),
    filterEnvelope: parseEnvelope(
      instrument["filterEnvelope"],
      `${path}.filterEnvelope`,
    ),
  };
}

function parseWaveform(
  source: unknown,
  path: string,
): OscillatorWaveform {
  const waveform = readString(source, path, 16);

  switch (waveform) {
    case "sine":
    case "square":
    case "sawtooth":
    case "triangle":
      return waveform;
    default:
      return fail(
        "INVALID_DATA",
        path,
        `Oscillator waveform "${waveform}" is not supported.`,
      );
  }
}

function parseEnvelope(
  source: unknown,
  path: string,
): AdsrEnvelope {
  const envelope = readRecord(source, path);

  return {
    attackSeconds: readNonNegativeNumber(
      envelope["attackSeconds"],
      `${path}.attackSeconds`,
    ),
    decaySeconds: readNonNegativeNumber(
      envelope["decaySeconds"],
      `${path}.decaySeconds`,
    ),
    sustainLevel: readNumberInRange(
      envelope["sustainLevel"],
      `${path}.sustainLevel`,
      0,
      1,
    ),
    releaseSeconds: readNonNegativeNumber(
      envelope["releaseSeconds"],
      `${path}.releaseSeconds`,
    ),
    curve: envelope["curve"] === undefined
      ? INSTRUMENT_CONSTANTS.legacyEnvelopeCurve
      : readNumberInRange(
        envelope["curve"],
        `${path}.curve`,
        INSTRUMENT_CONSTANTS.minimumEnvelopeCurve,
        INSTRUMENT_CONSTANTS.maximumEnvelopeCurve,
      ),
  };
}

function parseEffects(
  source: unknown,
  path: string,
): readonly EffectDescriptor[] {
  const values = readBoundedArray(
    source,
    path,
    MAXIMUM_DESCRIPTOR_COUNT,
  );
  const effects: EffectDescriptor[] = [];
  const ids = new Set<string>();

  for (
    let effectIndex = 0;
    effectIndex < values.length;
    effectIndex += 1
  ) {
    const effectPath = `${path}[${effectIndex}]`;
    const effect = readRecord(values[effectIndex], effectPath);
    const id = readUniqueDescriptorId(effect, ids, effectPath);

    effects.push({
      id,
      kind: readNonEmptyString(
        effect["kind"],
        `${effectPath}.kind`,
        MAXIMUM_NAME_LENGTH,
      ),
      enabled: readBoolean(
        effect["enabled"],
        `${effectPath}.enabled`,
      ),
      parameters: parseParameters(
        effect["parameters"],
        `${effectPath}.parameters`,
      ),
    });
  }

  return effects;
}

function parseGenerativeRules(
  source: unknown,
  path: string,
): readonly GenerativeRuleDescriptor[] {
  const values = readBoundedArray(
    source,
    path,
    MAXIMUM_DESCRIPTOR_COUNT,
  );
  const rules: GenerativeRuleDescriptor[] = [];
  const ids = new Set<string>();

  for (
    let ruleIndex = 0;
    ruleIndex < values.length;
    ruleIndex += 1
  ) {
    const rulePath = `${path}[${ruleIndex}]`;
    const rule = readRecord(values[ruleIndex], rulePath);
    const id = readUniqueDescriptorId(rule, ids, rulePath);

    rules.push({
      id,
      kind: readNonEmptyString(
        rule["kind"],
        `${rulePath}.kind`,
        MAXIMUM_NAME_LENGTH,
      ),
      enabled: readBoolean(
        rule["enabled"],
        `${rulePath}.enabled`,
      ),
      parameters: parseParameters(
        rule["parameters"],
        `${rulePath}.parameters`,
      ),
    });
  }

  return rules;
}

function readUniqueDescriptorId(
  descriptor: UnknownRecord,
  ids: Set<string>,
  path: string,
): string {
  const id = readNonEmptyString(
    descriptor["id"],
    `${path}.id`,
    MAXIMUM_ID_LENGTH,
  );

  if (ids.has(id)) {
    fail(
      "INVALID_DATA",
      `${path}.id`,
      `Descriptor ID "${id}" appears more than once.`,
    );
  }

  ids.add(id);
  return id;
}

function parseParameters(
  source: unknown,
  path: string,
): Readonly<Record<string, EffectParameterValue>> {
  const sourceParameters = readRecord(source, path);
  const parameterEntries = Object.entries(sourceParameters);

  if (parameterEntries.length > MAXIMUM_PARAMETER_COUNT) {
    fail(
      "INVALID_DATA",
      path,
      `A descriptor cannot contain more than ${MAXIMUM_PARAMETER_COUNT} parameters.`,
    );
  }

  const parameters =
    Object.create(null) as Record<string, JsonPrimitive>;

  for (const [key, value] of parameterEntries) {
    if (key.length === 0 || key.length > MAXIMUM_NAME_LENGTH) {
      fail(
        "INVALID_DATA",
        `${path}.${key}`,
        "Parameter names must be non-empty and bounded.",
      );
    }

    if (
      typeof value !== "string"
      && typeof value !== "number"
      && typeof value !== "boolean"
    ) {
      fail(
        "INVALID_DATA",
        `${path}.${key}`,
        "Parameters must be strings, finite numbers, or booleans.",
      );
    }

    if (typeof value === "number" && !Number.isFinite(value)) {
      fail(
        "INVALID_DATA",
        `${path}.${key}`,
        "Numeric parameters must be finite.",
      );
    }

    parameters[key] = value;
  }

  return parameters;
}

function parseProjectInstrumentInterpretation(
  source: unknown,
  path: string,
): ProjectInstrumentInterpretation {
  const interpretation = readRecord(source, path);

  return {
    transposeSemitones: readSafeInteger(
      interpretation["transposeSemitones"],
      `${path}.transposeSemitones`,
    ),
    timingOffsetTicks: readSafeInteger(
      interpretation["timingOffsetTicks"],
      `${path}.timingOffsetTicks`,
    ),
    gateRatio: readPositiveNumber(
      interpretation["gateRatio"],
      `${path}.gateRatio`,
    ),
    velocityScale: readNonNegativeNumber(
      interpretation["velocityScale"],
      `${path}.velocityScale`,
    ),
    probability: readNumberInRange(
      interpretation["probability"],
      `${path}.probability`,
      0,
      1,
    ),
  };
}
