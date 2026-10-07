"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { BRAND } from "@/lib/brand";
import { CATEGORIES, type CategoryDef } from "@/lib/categories";
import { beatsAverage, formatPercent } from "@/lib/elo";
import { categoryElo, previous } from "@/lib/ratings";
import { SPECIFIC_ROLES, type RoleTrack } from "@/lib/roles";
import { useWindowFileDrop } from "@/lib/useWindowFileDrop";
import { cn } from "@/lib/cn";
import { Dropzone } from "../Dropzone";
import { useLadder } from "../LadderProvider";
import { Magnetic, buttonClass } from "../ui/Button";
import { CategoryGlyph } from "../ui/CategoryGlyph";
import { DeltaChip } from "../ui/DeltaChip";
import { Odometer } from "../ui/Odometer";
import { EASE } from "../ui/Reveal";
import { Sparkline } from "../ui/Sparkline";

const INNER = { rx: 31, ry: 37 };
const OUTER = { rx: 43, ry: 44 };
const CATEGORY_ANGLES = [-150, -90, -30, 30, 90, 150];
const ROLE_ANGLES = [-176, -8, 56];

function polar(ring: { rx: number; ry: number }, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { left: 50 + ring.rx * Math.cos(a), top: 50 + ring.ry * Math.sin(a) };
}

function OrbitChip({
  pos,
  depth,
  index,
  mx,
  my,
  className,
  children,
}: {
  pos: { left: number; top: number };
  depth: number;
  index: number;
  mx: MotionValue<number>;
  my: MotionValue<number>;
  className?: string;
  children: React.ReactNode;
}) {
  const x = useTransform(mx, [-1, 1], [-depth, depth]);
  const y = useTransform(my, [-1, 1], [-depth, depth]);
  return (
    <div
      className={cn("absolute z-10 -translate-x-1/2 -translate-y-1/2", className)}
      style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
    >
      <motion.div style={{ x, y }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.9 + index * 0.09 }}
        >
          <motion.div
            animate={{ y: [0, -7, 0] }}
            transition={{
              duration: 5 + (index % 4) * 0.9,
              repeat: Infinity,
              ease: "easeInOut",
              delay: index * 0.37,
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function CategoryChip({ def, value }: { def: CategoryDef; value: number | null }) {
  return (
    <div className="glass flex items-center gap-2 whitespace-nowrap rounded-full py-1.5 pl-1.5 pr-3 text-[0.78rem] sm:gap-2.5 sm:pr-4 sm:text-[0.85rem]">
      <span
        className="grid h-6 w-6 place-items-center rounded-full text-cream sm:h-7 sm:w-7"
        style={{ background: def.color }}
      >
        <CategoryGlyph id={def.id} className="h-3.5 w-3.5" />
      </span>
      <span className="text-ink">{def.short}</span>
      <span className="font-mono text-[0.72rem] text-olive">
        {value == null ? "—" : Math.round(value)}
      </span>
    </div>
  );
}

function RoleChip({ role, value }: { role: RoleTrack; value: number | null }) {
  return (
    <div className="flex items-center gap-2.5 whitespace-nowrap rounded-full border border-bark/15 bg-cream/60 py-1.5 pl-3 pr-4 text-[0.85rem] backdrop-blur-sm">
      <span className="h-1.5 w-1.5 rounded-full bg-clay" />
      <span className="text-ink">{role.label}</span>
      <span className="font-mono text-[0.72rem] text-olive">
        {value == null ? "—" : Math.round(value)}
      </span>
    </div>
  );
}

function ScoreCard({ dragging }: { dragging: boolean }) {
  const { history, current } = useLadder();
  if (!current) {
    return (
      <motion.div
        className="glass relative z-20 w-[min(62vw,248px)] rounded-[30px] p-4 text-center sm:p-5"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: dragging ? 1.05 : 1 }}
        transition={{ duration: 1, ease: EASE, delay: 0.55 }}
      >
        <p className="text-[0.66rem] font-medium uppercase tracking-[0.2em] text-olive">
          Overall ELO
        </p>
        <p className="font-display mt-1 text-[clamp(3.6rem,10vw,5.4rem)] leading-none text-ink">—</p>
        <p className="mt-2 text-[0.74rem] leading-snug text-olive">
          Create an account and upload a resume.
        </p>
      </motion.div>
    );
  }
  const prev = previous(history);
  const overall = current.ratings.overall;
  const delta = prev ? overall - prev.ratings.overall : 0;

  return (
    <motion.div
      className="glass relative z-20 w-[min(62vw,248px)] rounded-[30px] p-4 text-center sm:p-5"
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: dragging ? 1.05 : 1 }}
      transition={{ duration: 1, ease: EASE, delay: 0.55 }}
    >
      <p className="text-[0.66rem] font-medium uppercase tracking-[0.2em] text-olive">
        Overall ELO
      </p>
      <Odometer
        value={overall}
        className="font-display mt-1 text-[clamp(3.6rem,10vw,5.4rem)] leading-none text-ink"
      />
      <div className="mt-2 flex items-center justify-center gap-2">
        <DeltaChip delta={delta} />
        <span className="text-[0.74rem] text-olive">since {prev?.label ?? "start"}</span>
      </div>
      <div className="mt-3 flex justify-center">
        <Sparkline values={history.map((v) => v.ratings.overall)} width={150} height={34} />
      </div>
      <p className="mt-2 hidden text-[0.74rem] leading-snug text-olive sm:block">
        Beats the average resume {formatPercent(beatsAverage(overall))} of the time.
      </p>
    </motion.div>
  );
}

function OrbitStage({ dragging }: { dragging: boolean }) {
  const { current } = useLadder();
  const reduce = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const mx = useSpring(rawX, { stiffness: 60, damping: 18 });
  const my = useSpring(rawY, { stiffness: 60, damping: 18 });

  return (
    <div
      className="relative mx-auto h-[670px] w-full max-w-[1020px] sm:h-[560px]"
      onPointerMove={(e) => {
        if (reduce || e.pointerType === "touch") return;
        const r = e.currentTarget.getBoundingClientRect();
        rawX.set(((e.clientX - r.left) / r.width) * 2 - 1);
        rawY.set(((e.clientY - r.top) / r.height) * 2 - 1);
      }}
      onPointerLeave={() => {
        rawX.set(0);
        rawY.set(0);
      }}
    >
      {[INNER, OUTER].map((ring, i) => (
        <motion.div
          key={i}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border-[1.5px] border-dotted border-bark/30"
          style={{
            width: `${ring.rx * 2}%`,
            height: `${ring.ry * 2}%`,
            x: "-50%",
            y: "-50%",
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: dragging ? 1.04 : 1 }}
          transition={{ duration: 1.4, ease: EASE, delay: 0.3 + i * 0.2 }}
        />
      ))}
      {dragging ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-clay/60"
          style={{ animation: "pulse-ring 1.4s ease-out infinite" }}
        />
      ) : null}

      <div className="absolute inset-0 flex items-center justify-center">
        <ScoreCard dragging={dragging} />
      </div>

      {CATEGORIES.map((def, i) => (
        <OrbitChip
          key={def.id}
          pos={polar(INNER, CATEGORY_ANGLES[i])}
          depth={14 + (i % 3) * 6}
          index={i}
          mx={mx}
          my={my}
        >
          <CategoryChip def={def} value={current ? categoryElo(current, def.id, "overall") : null} />
        </OrbitChip>
      ))}
      {SPECIFIC_ROLES.map((role, i) => (
        <OrbitChip
          key={role.id}
          pos={polar(OUTER, ROLE_ANGLES[i])}
          depth={26 + i * 6}
          index={CATEGORIES.length + i}
          mx={mx}
          my={my}
          className="hidden md:block"
        >
          <RoleChip role={role} value={current ? current.ratings[role.id] : null} />
        </OrbitChip>
      ))}
    </div>
  );
}

export function Hero() {
  const { proposeFile, pickFile } = useLadder();
  const dragging = useWindowFileDrop((file) => proposeFile(file));

  return (
    <section id="top" className="grain relative overflow-hidden">
      <div aria-hidden className="hero-gradient absolute inset-0" />
      <div
        aria-hidden
        className="blob-a absolute -left-[12%] top-[8%] h-[46%] w-[46%] rounded-full bg-blush/80 blur-[90px]"
      />
      <div
        aria-hidden
        className="blob-b absolute -right-[10%] top-[34%] h-[50%] w-[44%] rounded-full bg-rose/70 blur-[100px]"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-cream"
      />

      <div className="relative z-10 mx-auto max-w-[1180px] px-5 pb-16 pt-32 text-center sm:px-8 md:pt-40">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
          className="mx-auto inline-flex items-center gap-2.5 rounded-full border border-bark/15 bg-cream/60 px-4 py-1.5 text-[0.78rem] text-olive backdrop-blur-sm"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 rounded-full bg-clay" style={{ animation: "pulse-ring 2s ease-out infinite" }} />
            <span className="relative h-1.5 w-1.5 rounded-full bg-clay" />
          </span>
          Rated head to head, never by keyword
        </motion.p>

        <h1 className="font-display mx-auto mt-7 max-w-[15ch] text-[clamp(3.2rem,10.5vw,8.6rem)] leading-[0.9] text-ink">
          {["Know", "where", "your", "resume"].map((w, i) => (
            <Word key={w} i={i}>{w}</Word>
          ))}
          <Word i={4}><em className="text-clay">really</em></Word>
          <Word i={5}>stands.</Word>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.7 }}
          className="mx-auto mt-7 max-w-[34rem] text-[1.05rem] leading-relaxed text-olive"
        >
          {BRAND.name} rates your resume the way a hiring panel would: against
          others, one matchup at a time. Watch your ELO move with every edit,
          then test the next change before you send it.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.85 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Magnetic>
            <button type="button" onClick={pickFile} className={buttonClass("ink", "h-12 px-7")}>
              Upload resume
            </button>
          </Magnetic>
          <a href="#how" className={buttonClass("glass", "h-12 px-7")}>
            How it works
          </a>
        </motion.div>

        <div className="mt-6 sm:mt-10">
          <OrbitStage dragging={dragging} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 1.3 }}
          className="mt-4"
        >
          <Dropzone dragging={dragging} />
        </motion.div>
      </div>
    </section>
  );
}

function Word({ children, i }: { children: React.ReactNode; i: number }) {
  return (
    <span className="mr-[0.22em] inline-block overflow-hidden pb-[0.08em] align-bottom last:mr-0">
      <motion.span
        className="inline-block"
        initial={{ y: "110%", rotate: 3 }}
        animate={{ y: 0, rotate: 0 }}
        transition={{ duration: 1.1, ease: EASE, delay: 0.25 + i * 0.07 }}
      >
        {children}
      </motion.span>
    </span>
  );
}
