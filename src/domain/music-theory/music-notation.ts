/** Replaces ASCII accidentals in musical labels without changing stored values. */
export function formatMusicAccidentals(label: string): string {
  return label.replaceAll("#", "♯\uFE0E").replaceAll("b", "♭\uFE0E");
}
