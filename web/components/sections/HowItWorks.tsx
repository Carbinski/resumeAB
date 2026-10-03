"use client";

import { motion } from "motion/react";
import { CATEGORIES } from "@/lib/categories";
import { EASE, Reveal } from "../ui/Reveal";
import { SectionHeader } from "../ui/SectionHeader";

export function Marquee() {
  const items = CATEGORIES.map((c) => c.label);
  const row = [...items, ...items];
  return (
    <div
      aria-hidden
      className="hairline-t hairline-b overflow-hidden bg-peach/40 py-5"
    >
      <div
        className="flex w-max gap-10 whitespace-nowrap"
        style={{ animation: "marquee 38s linear infinite" }}
      >
        {[0, 1].map((n) => (
          <div key={n} className="flex gap-10">
            {row.map((label, i) => (
              <span
                key={`${n}-${i}`}
                className="font-display flex items-center gap-10 text-[clamp(1.8rem,4vw,3rem)] leading-none text-bark/80"
              >
                {label}
                <span className="h-2 w-2 rounded-full bg-clay" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Sheets() {
  return (
    <svg viewBox="0 0 160 120" className="h-full w-full" aria-hidden>
      {[
        { r: -9, x: 0, fill: "#EDDCD4" },
        { r: 0, x: 0, fill: "#F3CDC4" },
        { r: 9, x: 0, fill: "#F7F6F5" },
      ].map((s, i) => (
        <motion.g
          key={i}
          style={{ originX: "80px", originY: "112px" }}
          initial={{ rotate: 0 }}
          whileInView={{ rotate: s.r }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.2 + i * 0.12 }}
        >
          <rect x="44" y="12" width="72" height="96" rx="8" fill={s.fill} stroke="#403926" strokeOpacity="0.35" />
          {i === 2 && (
            <g stroke="#403926" strokeOpacity="0.5" strokeLinecap="round">
              <path d="M56 30h30M56 42h48M56 52h40M56 62h46" />
            </g>
          )}
        </motion.g>
      ))}
    </svg>
  );
}

function Rungs() {
  const heights = [34, 52, 48, 74, 96];
  return (
    <svg viewBox="0 0 160 120" className="h-full w-full" aria-hidden>
      {heights.map((h, i) => (
        <motion.rect
          key={i}
          x={22 + i * 26}
          width="16"
          rx="8"
          fill={i === heights.length - 1 ? "#BC7767" : "#D3BCB0"}
          initial={{ y: 112, height: 0 }}
          whileInView={{ y: 112 - h, height: h }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: EASE, delay: 0.2 + i * 0.1 }}
        />
      ))}
      <path d="M14 112h132" stroke="#403926" strokeOpacity="0.35" />
    </svg>
  );
}

function Split() {
  return (
    <svg viewBox="0 0 160 120" className="h-full w-full" aria-hidden>
      <rect x="18" y="20" width="56" height="80" rx="10" fill="#EDDCD4" stroke="#403926" strokeOpacity="0.35" />
      <motion.rect
        x="86"
        y="20"
        width="56"
        height="80"
        rx="10"
        fill="#F3CDC4"
        stroke="#403926"
        strokeOpacity="0.35"
        initial={{ y: 34 }}
        whileInView={{ y: 8 }}
        viewport={{ once: true }}
        transition={{ type: "spring", stiffness: 60, damping: 9, delay: 0.5 }}
      />
      <g stroke="#403926" strokeOpacity="0.5" strokeLinecap="round">
        <path d="M30 40h28M30 52h36M30 64h24" />
      </g>
      <motion.g
        stroke="#403926"
        strokeOpacity="0.5"
        strokeLinecap="round"
        initial={{ y: 14 }}
        whileInView={{ y: -12 }}
        viewport={{ once: true }}
        transition={{ type: "spring", stiffness: 60, damping: 9, delay: 0.5 }}
      >
        <path d="M98 54h28M98 66h36M98 78h24" />
      </motion.g>
      <circle cx="80" cy="60" r="9" fill="#2A221C" />
      <path d="M76 60h8M80 56v8" stroke="#F7F6F5" strokeWidth="1.6" strokeLinecap="round" transform="rotate(45 80 60)" />
    </svg>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Upload",
    body: "Drop in a PDF, Word or LaTeX file. We read the content, not the layout, so the judge sees what a recruiter would.",
    art: <Sheets />,
  },
  {
    n: "02",
    title: "Get rated",
    body: "Your résumé is matched against others, head to head, and fit to an ELO scale. 1000 is average; 400 points is 10-to-1 odds.",
    art: <Rungs />,
  },
  {
    n: "03",
    title: "Test a change",
    body: "Edit one thing, upload the new version, and watch the scale tip. Keep what helps. Revert what does not.",
    art: <Split />,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 md:py-28">
      <SectionHeader
        index="01"
        label="How it works"
        title={
          <>
            Three steps. <em className="text-clay">No guesswork.</em>
          </>
        }
      />
      <ol className="mt-12 grid gap-5 md:mt-16 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <Reveal as="li" key={s.n} delay={i * 0.1} className="group">
            <div className="h-full rounded-[32px] border border-bark/10 bg-white/45 p-6 transition-all duration-500 hover:-translate-y-1.5 hover:bg-white/80 hover:shadow-[0_30px_50px_-30px_rgba(64,57,38,0.35)] sm:p-8">
              <div className="flex items-start justify-between">
                <span className="font-display text-[5.5rem] leading-[0.8] text-rose transition-colors duration-500 group-hover:text-clay">
                  {s.n}
                </span>
                <div className="h-24 w-32">{s.art}</div>
              </div>
              <h3 className="font-display mt-8 text-[2rem] leading-none text-ink">{s.title}</h3>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-olive">{s.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
