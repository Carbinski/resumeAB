import { BRAND } from "@/lib/brand";

const MARK =
  "font-display pointer-events-none select-none whitespace-nowrap text-center uppercase leading-[0.78] tracking-[-0.02em] text-ink/90";

const FOOTER_MASK = "[mask-image:linear-gradient(to_bottom,black_45%,transparent_100%)]";

export function GiantWordmark() {
  return (
    <div
      aria-hidden
      className={`mt-10 md:mt-14 ${MARK} ${FOOTER_MASK}`}
      style={{ fontSize: "min(30.5vw, 420px)", marginBottom: "-0.07em" }}
    >
      {BRAND.name}
    </div>
  );
}
