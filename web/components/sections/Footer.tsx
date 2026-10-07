import { BRAND } from "@/lib/brand";
import { GiantWordmark } from "../GiantWordmark";
import { Wordmark } from "../Nav";

const LINKS = [
  { href: "#top", label: "About" },
  { href: "#how", label: "How it works" },
  { href: "#rating", label: "Rating" },
  { href: "#roles", label: "Roles" },
  { href: "#lab", label: "A/B lab" },
];

export function Footer() {
  return (
    <footer className="hairline-t relative overflow-hidden bg-peach/50">
      <div className="mx-auto grid max-w-[1180px] gap-12 px-5 pt-16 sm:grid-cols-2 sm:gap-x-12 sm:gap-y-14 sm:px-8 lg:grid-cols-12 lg:gap-10 lg:pt-24">
        <div className="sm:col-span-2 lg:col-span-6">
          <Wordmark className="text-[1.05rem] text-ink" />
          <p className="font-display mt-4 text-[clamp(2.35rem,4.8vw,4rem)] leading-[0.92] text-bark">
            {BRAND.tagline}
          </p>
        </div>

        <nav aria-label="Footer" className="lg:col-span-3">
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">
            On this page
          </p>
          <ul className="mt-4 flex flex-col gap-3 text-[1rem]">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-olive transition-colors hover:text-ink">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="lg:col-span-3">
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">
            Scale
          </p>
          <p className="mt-4 max-w-xs text-[0.98rem] leading-relaxed text-olive">
            Ratings are a Bradley–Terry fit on the Elo scale, centered at 1000.
          </p>
        </div>
      </div>

      <GiantWordmark />
    </footer>
  );
}
