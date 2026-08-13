/** Retargets an AudioParam without introducing a discontinuity. */
export function setAudioParamSmoothly(
  parameter: AudioParam,
  value: number,
  atAudioTimeSeconds: number,
): void {
  if (typeof parameter.cancelAndHoldAtTime === "function") {
    parameter.cancelAndHoldAtTime(atAudioTimeSeconds);
  } else {
    parameter.cancelScheduledValues(atAudioTimeSeconds);
    parameter.setValueAtTime(parameter.value, atAudioTimeSeconds);
  }

  parameter.linearRampToValueAtTime(
    value,
    atAudioTimeSeconds + 0.01,
  );
}
