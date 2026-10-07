import { BRAND } from "@/lib/brand";

const MARK =
  "font-display pointer-events-none select-none whitespace-nowrap text-center uppercase leading-[0.78] tracking-[-0.02em] text-ink/90 [mask-image:linear-gradient(to_bottom,black_45%,transparent_100%)]";

/**
 * Full-bleed display wordmark. The bottom edge matches the footer close.
 * The top edge opens the page with the same mark, under the fixed nav.
 * Motion is skipped when the visitor prefers reduced motion.
 */
export function GiantWordmark({ edge = "bottom" }: { edge?: "top" | "bottom" }) {
  const top = edge === "top";
  const mark = (
    <div
      aria-hidden
      className={top ? `giant-open-wordmark ${MARK}` : `mt-10 md:mt-14 ${MARK}`}
      style={{ fontSize: "min(30.5vw, 420px)", marginBottom: "-0.07em" }}
    >
      {BRAND.name}
    </div>
  );

  if (!top) return mark;

  return (
    <div className="pt-16 md:pt-20">
      {mark}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .giant-open-wordmark {
            animation: giant-open-wordmark 1.2s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
          }
        }
        @keyframes giant-open-wordmark {
          from { opacity: 0; transform: translateY(1.15rem); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
