import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

/** Editorial section opener: hairline, index numeral, display title. */
export function SectionHeader({
  index,
  label,
  title,
  children,
}: {
  index: string;
  label: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="hairline-t grid gap-6 pt-6 md:grid-cols-12 md:gap-10 md:pt-8">
      <Reveal className="flex items-baseline gap-3 md:col-span-3">
        <span className="font-mono text-[0.72rem] tracking-[0.14em] text-olive">
          {index}
        </span>
        <span className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">
          {label}
        </span>
      </Reveal>
      <div className="md:col-span-9">
        <Reveal delay={0.05}>
          <h2 className="font-display text-[clamp(2.4rem,6vw,5rem)] leading-[0.98] text-ink">
            {title}
          </h2>
        </Reveal>
        {children ? (
          <Reveal delay={0.12} className="mt-5 max-w-xl text-[1.02rem] leading-relaxed text-olive">
            {children}
          </Reveal>
        ) : null}
      </div>
    </header>
  );
}
