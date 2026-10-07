/** Enough for a version name. The note field caps much higher. */
export const LABEL_MAX = 80;

/** File name without its extension, capped, for the name field's starting value. */
export function labelFromFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop()?.trim() ?? "";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.trim().slice(0, LABEL_MAX);
}
