import { BRAND } from "@/lib/brand";
import { Wordmark } from "../Nav";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#rating", label: "Rating" },
  { href: "#roles", label: "Roles" },
  { href: "#lab", label: "A/B lab" },
];

export function Footer() {
  return (
    <footer className="hairline-t relative overflow-hidden bg-peach/50">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10 px-5 pt-14 sm:px-8 md:flex-row md:items-start md:justify-between md:pt-20">
        <div className="max-w-sm">
          <Wordmark className="text-[1.1rem] text-ink" />
          <p className="font-display mt-4 text-[1.9rem] leading-[1.05] text-bark">
            {BRAND.tagline}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-[0.92rem] text-olive">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </div>
        <p className="max-w-[16rem] text-[0.78rem] leading-relaxed text-olive">
          Ratings are a Bradley–Terry fit on the Elo scale, centered at 1000.
          This is a preview running on sample data.
        </p>
      </div>

      <div
        aria-hidden
        className="font-display pointer-events-none mt-10 select-none whitespace-nowrap text-center uppercase leading-[0.78] tracking-[-0.02em] text-ink/90 [mask-image:linear-gradient(to_bottom,black_45%,transparent_100%)] md:mt-14"
        style={{ fontSize: "min(30.5vw, 420px)", marginBottom: "-0.07em" }}
      >
        {BRAND.name}
      </div>
    </footer>
  );
}
