import type { CompareResult, OrderResult, Verdict } from "./types";

/** Same constants as `resume_ab/rating.py`. */
export const ELO_CENTER = 1000;
export const ELO_SCALE = 400;

/** P(a beats b). A 400-point gap means 10-to-1 odds. */
export function winProbability(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / ELO_SCALE));
}

/** How often a resume at `elo` beats the average resume in the pool. */
export function beatsAverage(elo: number): number {
  return winProbability(elo, ELO_CENTER);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function formatDelta(n: number): string {
  const rounded = Math.round(n);
  if (rounded === 0) return "±0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}`;
}

export function formatPercent(p: number): string {
  return `${Math.round(p * 100)}%`;
}

export const TIE_BAND = 0.05;

export function verdictFor(pB: number): Verdict {
  if (pB >= 0.5 + TIE_BAND) return "b";
  if (pB <= 0.5 - TIE_BAND) return "a";
  return "tie";
}

/** One cell of the lab strip, for example "AI & ML: A wins". */
export function trackVerdict(label: string, pB: number): string {
  const verdict = verdictFor(pB);
  if (verdict === "b") return `${label}: B wins`;
  if (verdict === "a") return `${label}: A wins`;
  return `${label}: too close`;
}

/** Probability that A is stronger as seen by one reading order. */
function pAInOrder(order: OrderResult): number {
  return order.left === "a" ? order.noul : 1 - order.noul;
}

/** 1 when both orders agree exactly, lower when position bias shows up. */
export function orderAgreement(orders: CompareResult["orders"]): number {
  return 1 - Math.abs(pAInOrder(orders[0]) - pAInOrder(orders[1]));
}

export function pBInOrder(order: OrderResult): number {
  return 1 - pAInOrder(order);
}
