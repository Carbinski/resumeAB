import type { CategoryId } from "./categories";
import type { RoleId } from "./roles";

/** Everything the rating engine says about one resume version. */
export interface RoleRatings {
  /** Elo for the intern or new-grad pool. Always present once a version is saved. */
  overall: number;
  ai: number | null;
  cloud: number | null;
  fullstack: number | null;
}

export interface RatingSnapshot {
  ratings: RoleRatings;
  /** Category strength on the same Elo scale. Empty until a second version is compared. */
  categories: Partial<Record<CategoryId, number>>;
}

export interface RoleRun {
  status: "placing" | "provisional" | "rated" | "error";
  message: string | null;
}

export interface NeighborCard {
  company: string | null;
  level: "intern" | "newgrad";
  levelLabel: string;
  industry: string;
  industryLabel: string;
  relation: "same" | "above" | "below";
}

export interface Standing {
  status: "placing" | "provisional" | "rated" | "error";
  message: string | null;
  band: string;
  /** Share of other placed resumes strictly below this one, rounded to 5%. */
  percentile: number | null;
  histogram: { id: string; label: string; count: number }[];
  neighbors: NeighborCard[];
  widened: boolean;
  matchesPlayed: number;
  matchBudget: number;
}

export interface ResumeVersion extends RatingSnapshot {
  id: string;
  level: "intern" | "newgrad";
  label: string;
  fileName: string;
  /** ISO date. */
  uploadedAt: string;
  /** What changed in this version, in the user's words. */
  note: string;
  standing: Standing;
  roleStatus: Record<Exclude<RoleId, "overall">, RoleRun | null>;
}

export interface Account {
  email: string;
  nameOnResume: string;
  level: "intern" | "newgrad";
  industry: string;
  company: string | null;
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
