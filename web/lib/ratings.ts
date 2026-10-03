import type { CategoryId } from "./categories";
import type { RoleId } from "./roles";
import type { ResumeVersion } from "./types";

/** Role fit moves with the selected role; every other category is role-agnostic. */
export function categoryElo(
  version: ResumeVersion,
  category: CategoryId,
  role: RoleId,
): number {
  const base = version.categories[category];
  if (category !== "fit") return base;
  return base + (version.ratings[role] - version.ratings.overall);
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
