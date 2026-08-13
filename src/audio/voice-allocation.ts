export interface VoiceAllocationWindow {
  readonly startAudioTimeSeconds: number;
  readonly stopAudioTimeSeconds: number;
}

export interface StealableVoiceAllocationWindow
extends VoiceAllocationWindow {
  readonly ended: boolean;
  stop(atAudioTimeSeconds: number): void;
}

/** Prunes ended voices and steals the oldest overlap at the polyphony limit. */
export function reservePolyphonySlot(
  activeVoices: StealableVoiceAllocationWindow[] | undefined,
  startAudioTimeSeconds: number,
  endAudioTimeSeconds: number,
  maximumPolyphony: number,
): void {
  if (activeVoices === undefined) {
    return;
  }

  let writeIndex = 0;

  for (const activeVoice of activeVoices) {
    if (
      !activeVoice.ended
      && activeVoice.stopAudioTimeSeconds > startAudioTimeSeconds
    ) {
      activeVoices[writeIndex] = activeVoice;
      writeIndex += 1;
    }
  }

  activeVoices.length = writeIndex;

  while (
    countOverlappingVoiceWindows(
      activeVoices,
      startAudioTimeSeconds,
      endAudioTimeSeconds,
    ) >= maximumPolyphony
  ) {
    const voiceIndex = findOldestOverlappingVoiceIndex(
      activeVoices,
      startAudioTimeSeconds,
      endAudioTimeSeconds,
    );
    const voiceToSteal = activeVoices[voiceIndex];

    if (voiceIndex < 0 || voiceToSteal === undefined) {
      break;
    }

    voiceToSteal.stop(startAudioTimeSeconds);
    activeVoices.splice(voiceIndex, 1);
  }
}

export function countOverlappingVoiceWindows(
  voices: readonly VoiceAllocationWindow[],
  startAudioTimeSeconds: number,
  endAudioTimeSeconds: number,
): number {
  let count = 0;

  for (
    let voiceIndex = 0;
    voiceIndex < voices.length;
    voiceIndex += 1
  ) {
    const voice = voices[voiceIndex];

    if (
      voice !== undefined
      && voice.startAudioTimeSeconds < endAudioTimeSeconds
      && voice.stopAudioTimeSeconds > startAudioTimeSeconds
    ) {
      count += 1;
    }
  }

  return count;
}

export function findOldestOverlappingVoiceIndex(
  voices: readonly VoiceAllocationWindow[],
  startAudioTimeSeconds: number,
  endAudioTimeSeconds: number,
): number {
  let selectedIndex = -1;

  for (
    let voiceIndex = 0;
    voiceIndex < voices.length;
    voiceIndex += 1
  ) {
    const voice = voices[voiceIndex];

    if (
      voice === undefined
      || voice.startAudioTimeSeconds >= endAudioTimeSeconds
      || voice.stopAudioTimeSeconds <= startAudioTimeSeconds
    ) {
      continue;
    }

    const selectedVoice =
      selectedIndex < 0 ? undefined : voices[selectedIndex];

    if (
      selectedVoice === undefined
      || voice.startAudioTimeSeconds
        < selectedVoice.startAudioTimeSeconds
      || (
        voice.startAudioTimeSeconds
          === selectedVoice.startAudioTimeSeconds
        && voice.stopAudioTimeSeconds
          < selectedVoice.stopAudioTimeSeconds
      )
    ) {
      selectedIndex = voiceIndex;
    }
  }

  return selectedIndex;
}
