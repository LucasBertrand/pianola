import type {
  InstrumentId,
} from "../../../domain/identifiers";
import type {
  WorkletVoiceSlot,
} from "./worklet-voice-slot";

export const GLOBAL_VOICE_LIMIT = 24;
export const GLOBAL_VOICE_STORAGE_LIMIT = GLOBAL_VOICE_LIMIT * 2;
export const VOICE_STEAL_RELEASE_SECONDS = 0.006;

/** Bounded, allocation-free voice reservation for the audio render thread. */
export function reserveWorkletVoice(
  voices: WorkletVoiceSlot[],
  instrumentId: InstrumentId,
  instrumentPolyphony: number,
): WorkletVoiceSlot | undefined {
  let audibleInstrumentVoiceCount = 0;
  let audibleVoiceCount = 0;
  let oldestInstrumentVoice: WorkletVoiceSlot | undefined;
  let quietestGlobalVoice: WorkletVoiceSlot | undefined;

  for (let voiceIndex = 0; voiceIndex < voices.length; voiceIndex += 1) {
    const voice = voices[voiceIndex];
    if (voice === undefined) continue;
    if (voice.ended) {
      continue;
    }

    audibleVoiceCount += 1;

    if (
      quietestGlobalVoice === undefined
      || voice.level < quietestGlobalVoice.level
      || (
        voice.level === quietestGlobalVoice.level
        && voice.sequence < quietestGlobalVoice.sequence
      )
    ) {
      quietestGlobalVoice = voice;
    }

    if (voice.instrumentId === instrumentId) {
      audibleInstrumentVoiceCount += 1;

      if (
        oldestInstrumentVoice === undefined
        || voice.sequence < oldestInstrumentVoice.sequence
      ) {
        oldestInstrumentVoice = voice;
      }
    }
  }

  if (audibleInstrumentVoiceCount >= instrumentPolyphony) {
    return removeVoice(voices, oldestInstrumentVoice);
  }

  if (audibleVoiceCount >= GLOBAL_VOICE_LIMIT) {
    return removeVoice(voices, quietestGlobalVoice);
  }

  if (voices.length >= GLOBAL_VOICE_STORAGE_LIMIT) {
    return removeLowestPriorityVoice(voices);
  }

  return undefined;
}

function removeVoice(
  voices: WorkletVoiceSlot[],
  target: WorkletVoiceSlot | undefined,
): WorkletVoiceSlot | undefined {
  if (target === undefined) {
    return undefined;
  }

  const selectedIndex = voices.indexOf(target);

  return selectedIndex < 0
    ? undefined
    : removeVoiceAt(voices, selectedIndex);
}

function removeLowestPriorityVoice(
  voices: WorkletVoiceSlot[],
): WorkletVoiceSlot | undefined {
  let selectedIndex = -1;

  for (let voiceIndex = 0; voiceIndex < voices.length; voiceIndex += 1) {
    const voice = voices[voiceIndex];

    if (voice === undefined) {
      continue;
    }

    if (voice.ended) {
      selectedIndex = voiceIndex;
      break;
    }

    const selected = selectedIndex < 0 ? undefined : voices[selectedIndex];

    if (
      selected === undefined
      || (voice.releasing && !selected.releasing)
      || (
        voice.releasing === selected.releasing
        && voice.level < selected.level
      )
    ) {
      selectedIndex = voiceIndex;
    }
  }

  if (selectedIndex >= 0) {
    return removeVoiceAt(voices, selectedIndex);
  }

  return undefined;
}

function removeVoiceAt(
  voices: WorkletVoiceSlot[],
  selectedIndex: number,
): WorkletVoiceSlot | undefined {
  const removedVoice = voices[selectedIndex];

  for (
    let voiceIndex = selectedIndex + 1;
    voiceIndex < voices.length;
    voiceIndex += 1
  ) {
    const voice = voices[voiceIndex];

    if (voice !== undefined) {
      voices[voiceIndex - 1] = voice;
    }
  }

  voices.length -= 1;
  return removedVoice;
}
