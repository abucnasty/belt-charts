// Viridis-inspired gradient stops [t, [r, g, b]]
// t=0 → cool/dark, t=1 → hot/bright (colorblind-friendly)
const HEAT_STOPS: [number, [number, number, number]][] = [
  [0.00, [20,  10,  40]],  // near-black purple
  [0.25, [59,  28, 140]],  // purple
  [0.50, [33, 145, 140]],  // teal
  [0.75, [94, 201,  98]],  // green
  [1.00, [253, 231, 37]],  // yellow
];

export function heatColor(t: number): string {
  t = Math.max(0, Math.min(1, t));
  let lo = HEAT_STOPS[0];
  let hi = HEAT_STOPS[HEAT_STOPS.length - 1];
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    if (t >= HEAT_STOPS[i][0] && t <= HEAT_STOPS[i + 1][0]) {
      lo = HEAT_STOPS[i];
      hi = HEAT_STOPS[i + 1];
      break;
    }
  }
  const f = lo[0] === hi[0] ? 0 : (t - lo[0]) / (hi[0] - lo[0]);
  const r = Math.round(lo[1][0] + f * (hi[1][0] - lo[1][0]));
  const g = Math.round(lo[1][1] + f * (hi[1][1] - lo[1][1]));
  const b = Math.round(lo[1][2] + f * (hi[1][2] - lo[1][2]));
  return `rgb(${r},${g},${b})`;
}

export type HeatmapNormalizeMode = "global" | "column" | "row";
