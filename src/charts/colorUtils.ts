function shiftColor(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + amount);
  const g = clamp(((num >> 8) & 0x00ff) + amount);
  const b = clamp((num & 0x0000ff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Lighten a hex color (e.g. "#0072B2") by `amount` (0-255) per channel. */
export function lightenColor(hex: string, amount: number): string {
  return shiftColor(hex, amount);
}

/** Darken a hex color (e.g. "#0072B2") by `amount` (0-255) per channel. */
export function darkenColor(hex: string, amount: number): string {
  return shiftColor(hex, -amount);
}
