/**
 * Minimal UTF-8 codec that keeps the MIDI core independent from DOM globals.
 */

export function decodeUtf8(bytes: Uint8Array): string {
  let result = "";
  let index = 0;

  while (index < bytes.length) {
    const first = bytes[index];
    if (first === undefined) {
      break;
    }

    if (first < 0x80) {
      result += String.fromCodePoint(first);
      index += 1;
      continue;
    }

    let codePoint: number;
    let continuationCount: number;
    let minimumCodePoint: number;
    if ((first & 0xe0) === 0xc0) {
      codePoint = first & 0x1f;
      continuationCount = 1;
      minimumCodePoint = 0x80;
    } else if ((first & 0xf0) === 0xe0) {
      codePoint = first & 0x0f;
      continuationCount = 2;
      minimumCodePoint = 0x800;
    } else if ((first & 0xf8) === 0xf0) {
      codePoint = first & 0x07;
      continuationCount = 3;
      minimumCodePoint = 0x1_0000;
    } else {
      result += "\uFFFD";
      index += 1;
      continue;
    }

    if (index + continuationCount >= bytes.length) {
      result += "\uFFFD";
      index += 1;
      continue;
    }

    let isValid = true;
    for (
      let continuationIndex = 1;
      continuationIndex <= continuationCount;
      continuationIndex += 1
    ) {
      const continuation = bytes[index + continuationIndex];
      if (
        continuation === undefined ||
        (continuation & 0xc0) !== 0x80
      ) {
        isValid = false;
        break;
      }
      codePoint = (codePoint << 6) | (continuation & 0x3f);
    }

    if (
      !isValid ||
      codePoint < minimumCodePoint ||
      codePoint > 0x10_ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      result += "\uFFFD";
      index += 1;
      continue;
    }

    result += String.fromCodePoint(codePoint);
    index += continuationCount + 1;
  }

  return result;
}

export function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];

  for (const character of value) {
    const rawCodePoint = character.codePointAt(0);
    if (rawCodePoint === undefined) {
      continue;
    }
    const codePoint =
      rawCodePoint >= 0xd800 && rawCodePoint <= 0xdfff
        ? 0xfffd
        : rawCodePoint;

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(
        0xc0 | (codePoint >> 6),
        0x80 | (codePoint & 0x3f),
      );
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }

  return Uint8Array.from(bytes);
}
