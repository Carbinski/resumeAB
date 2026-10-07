import type { CategoryId } from "./categories";
import type { RoleId, TrackId } from "./roles";
import type { ResumeVersion } from "./types";

/**
 * Score for a role that has actually been placed.
 * Overall is always the level-pool Elo. A track with no provisional or rated
 * run does not borrow that number.
 */
export function placedRoleScore(version: ResumeVersion, role: RoleId): number | null {
  if (role === "overall") return version.ratings.overall;
  const score = version.ratings[role];
  if (score == null) return null;
  const status = version.roleStatus[role]?.status;
  if (status !== "provisional" && status !== "rated") return null;
  return score;
}

/** Elo gap for a track that is provisional or rated on both résumés. */
export function placedTrackDelta(
  a: ResumeVersion,
  b: ResumeVersion,
  role: TrackId,
): number | null {
  const left = placedRoleScore(a, role);
  const right = placedRoleScore(b, role);
  if (left == null || right == null) return null;
  return right - left;
}

/** Role fit moves with the selected role; every other category is role-agnostic. */
export function categoryElo(
  version: ResumeVersion,
  category: CategoryId,
  role: RoleId,
): number | null {
  const base = version.categories[category];
  if (base == null) return null;
  if (category !== "fit" || role === "overall") return base;
  const roleRating = placedRoleScore(version, role);
  // Fit stays on the stored category score until this track is provisional or rated.
  if (roleRating == null) return base;
  return base + (roleRating - version.ratings.overall);
}

export function latest(history: ResumeVersion[]): ResumeVersion {
  return history[history.length - 1];
}

export function previous(history: ResumeVersion[]): ResumeVersion | undefined {
  return history.length > 1 ? history[history.length - 2] : undefined;
}

export function formatDate(iso: string, style: "short" | "long" = "short"): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(style === "long" ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}
