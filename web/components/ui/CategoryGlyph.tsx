import type { CategoryId } from "@/lib/categories";

const PATHS: Record<CategoryId, React.ReactNode> = {
  impact: (
    <>
      <path d="M4 15.5 8.5 11l3 3L16 8.5" />
      <path d="M12.5 8.5H16v3.5" />
    </>
  ),
  depth: (
    <>
      <path d="M4 6.5h12M4 10h12M4 13.5h12" />
      <path d="M7 4v12" />
    </>
  ),
  leadership: (
    <>
      <circle cx="10" cy="6.5" r="2.4" />
      <path d="M4.8 15.6c.6-2.7 2.6-4.1 5.2-4.1s4.6 1.4 5.2 4.1" />
    </>
  ),
  fit: (
    <>
      <circle cx="10" cy="10" r="6" />
      <circle cx="10" cy="10" r="2.4" />
    </>
  ),
  trajectory: (
    <>
      <path d="M4 15.5h12" />
      <path d="M5 13l3.2-3.2 2.4 2.4L15 7.4" />
    </>
  ),
  clarity: (
    <>
      <path d="M4.5 6h11M4.5 10h7M4.5 14h9" />
    </>
  ),
};

export function CategoryGlyph({
  id,
  className,
}: {
  id: CategoryId;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {PATHS[id]}
    </svg>
  );
}
