/** Replaces ASCII accidentals in musical labels without changing stored values. */
export function formatAccidentals(label: string): string {
  return label.replaceAll("#", "♯").replaceAll("b", "♭");
}
