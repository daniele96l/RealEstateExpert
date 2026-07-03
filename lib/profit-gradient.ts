import type { CSSProperties } from "react";

export interface ProfitGradientRange {
  min: number;
  max: number;
}

const RED = { r: 248, g: 113, b: 113 };
const AMBER = { r: 251, g: 191, b: 36 };
const EMERALD = { r: 52, g: 211, b: 153 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixColor(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
}

function rgb({ r, g, b }: { r: number; g: number; b: number }): string {
  return `rgb(${r} ${g} ${b})`;
}

function rgba(c: { r: number; g: number; b: number }, alpha: number): string {
  return `rgba(${c.r} ${c.g} ${c.b} / ${alpha})`;
}

/** 0 = worst (red), 0.5 = neutral (amber), 1 = best (emerald) */
export function profitGradientT(value: number, range: ProfitGradientRange): number {
  const span = range.max - range.min;
  if (!Number.isFinite(span) || span <= 0) {
    if (value > 0) return 0.75;
    if (value < 0) return 0.25;
    return 0.5;
  }
  const raw = (value - range.min) / span;
  return Math.min(1, Math.max(0, raw));
}

export function profitGradientColor(value: number, range: ProfitGradientRange): string {
  const t = profitGradientT(value, range);
  if (t <= 0.5) return rgb(mixColor(RED, AMBER, t / 0.5));
  return rgb(mixColor(AMBER, EMERALD, (t - 0.5) / 0.5));
}

export function profitGradientTextStyle(
  value: number,
  range: ProfitGradientRange,
): CSSProperties {
  const t = profitGradientT(value, range);
  const main = profitGradientColor(value, range);
  const accent =
    t <= 0.5
      ? rgb(mixColor(RED, AMBER, Math.min(1, t / 0.5 + 0.18)))
      : rgb(mixColor(AMBER, EMERALD, Math.min(1, (t - 0.5) / 0.5 + 0.18)));

  return {
    backgroundImage: `linear-gradient(105deg, ${main}, ${accent})`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
}

export function profitGradientBorderStyle(
  value: number,
  range: ProfitGradientRange,
): CSSProperties {
  const t = profitGradientT(value, range);
  const edge =
    t <= 0.5
      ? mixColor(RED, AMBER, t / 0.5)
      : mixColor(AMBER, EMERALD, (t - 0.5) / 0.5);

  return {
    borderColor: rgba(edge, 0.45),
    backgroundImage: `linear-gradient(145deg, ${rgba(edge, 0.14)}, transparent 72%)`,
  };
}

export function profitRangeFromValues(values: number[]): ProfitGradientRange {
  if (!values.length) return { min: -400, max: 400 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const pad = Math.max(100, Math.abs(min) * 0.2, 200);
    return { min: min - pad, max: max + pad };
  }
  return { min, max };
}
