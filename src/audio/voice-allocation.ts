export interface VoiceAllocationWindow {
  readonly startAudioTimeSeconds: number;
  readonly stopAudioTimeSeconds: number;
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
