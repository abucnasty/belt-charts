import type { TitleOptions } from "chart.js";
import { colors } from "./constants";
import { scaled } from "./fontScale";

/** Font size (px, before font scaling) of the subtitle under the chart title. */
export const SUBTITLE_FONT_PX = 13;

/** Chart.js `plugins.subtitle` options: a smaller, lighter line under the title; hidden when there is no text. */
export function subtitleOptions(text: string | null | undefined): Partial<TitleOptions> {
  return {
    display: !!text,
    text: text ?? "",
    color: colors.white,
    font: { size: scaled(SUBTITLE_FONT_PX), weight: "normal" },
    padding: { top: 0, bottom: 8 },
  };
}

/** Vertical space (px) a subtitle takes on the hand-drawn canvas charts; 0 without one. */
export function subtitleHeight(text: string | null | undefined): number {
  return text ? scaled(SUBTITLE_FONT_PX) + scaled(8) : 0;
}
