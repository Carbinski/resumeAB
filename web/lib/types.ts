import type { CategoryId } from "./categories";
import type { RoleId } from "./roles";

/** Everything the rating engine says about one resume version. */
export interface RatingSnapshot {
  /** Elo per role. `overall` is the headline rating. */
  ratings: Record<RoleId, number>;
  /** Category strength on the same Elo scale. */
  categories: Record<CategoryId, number>;
}

export interface ResumeVersion extends RatingSnapshot {
  id: string;
  label: string;
  fileName: string;
  /** ISO date. */
  uploadedAt: string;
  /** What changed in this version, in the user's words. */
  note: string;
}

/** Mirrors `OrderResult` in `resume_ab/compare.py`, one per left/right order. */
export interface OrderResult {
  /** Which version was shown on the left in this order. */
  left: "a" | "b";
  choice: "left" | "right";
  probabilities: { left: number; right: number };
  confidence: number;
  /** Probability the left resume is stronger. */
  noul: number;
  model: string;
}

export interface CategoryDuel {
  id: CategoryId;
  /** Probability B is stronger than A in this category. */
  pB: number;
  eloA: number;
  eloB: number;
}

export interface CompareResult {
  a: ResumeVersion;
  b: ResumeVersion;
  role: RoleId;
  /** Aggregate probability B is stronger, averaged over both orders. */
  pB: number;
  eloA: number;
  eloB: number;
  orders: [OrderResult, OrderResult];
  categories: CategoryDuel[];
}

export type Verdict = "b" | "a" | "tie";
