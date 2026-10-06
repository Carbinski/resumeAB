"use client";

import { scaleLinear, scaleTime } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { motion, useInView } from "motion/react";
import { useId, useMemo, useRef } from "react";
import { ELO_CENTER, formatDelta } from "@/lib/elo";
import { formatDate } from "@/lib/ratings";
import { ROLE_BY_ID, type RoleId } from "@/lib/roles";
import type { ResumeVersion } from "@/lib/types";
import { useElementWidth } from "@/lib/useElementWidth";
import { EASE } from "./ui/Reveal";

const SPRING = { type: "spring", stiffness: 140, damping: 22 } as const;

interface Props {
  versions: ResumeVersion[];
  history: ResumeVersion[];
  role: RoleId;
  activeId: string;
  onActive: (id: string | null) => void;
}

export function EloChart({ versions, history, role, activeId, onActive }: Props) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(720);
  const inView = useInView(wrapRef, { once: true, margin: "0px 0px -15% 0px" });
  const gradId = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);

  const compact = width < 520;
  const height = compact ? 290 : 380;
  const m = { top: 24, right: compact ? 18 : 30, bottom: 52, left: compact ? 42 : 56 };

  const geometry = useMemo(() => {
    const times = versions.map((v) => new Date(v.uploadedAt).getTime());
    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    const spanPad = t0 === t1 ? 86_400_000 * 7 : 0;
    const x = scaleTime()
      .domain([t0 - spanPad, t1 + spanPad])
      .range([m.left + 16, width - m.right - 16]);

    const values = versions.flatMap((v) => [v.ratings[role], v.ratings.overall]);
    const y = scaleLinear()
      .domain([Math.min(...values) - 28, Math.max(...values) + 28])
      .nice(4)
      .range([height - m.bottom, m.top]);

    const px = (v: ResumeVersion) => x(new Date(v.uploadedAt));
    const roleLine =
      line<ResumeVersion>()
        .x(px)
        .y((v) => y(v.ratings[role]))
        .curve(curveMonotoneX)(versions) ?? "";
    const overallLine =
      line<ResumeVersion>()
        .x(px)
        .y((v) => y(v.ratings.overall))
        .curve(curveMonotoneX)(versions) ?? "";
    const roleArea =
      area<ResumeVersion>()
        .x(px)
        .y0(height - m.bottom)
        .y1((v) => y(v.ratings[role]))
        .curve(curveMonotoneX)(versions) ?? "";

    return { x, y, px, roleLine, overallLine, roleArea };
  }, [versions, role, width, height, m.left, m.right, m.top, m.bottom]);

  const { y, px, roleLine, overallLine, roleArea } = geometry;
  const showOverallRef = role !== "overall";
  const active = versions.find((v) => v.id === activeId) ?? versions[versions.length - 1];
  const activeIndex = history.findIndex((v) => v.id === active.id);
  const before = activeIndex > 0 ? history[activeIndex - 1] : undefined;
  const ax = px(active);
  const ay = y(active.ratings[role]);
  const delta = before ? active.ratings[role] - before.ratings[role] : 0;
  const ticks = y.ticks(4);
  const showCenter = ELO_CENTER > y.domain()[0] && ELO_CENTER < y.domain()[1];

  const nearest = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursor = clientX - rect.left;
    let best = versions[0];
    let bestDistance = Infinity;
    for (const v of versions) {
      const d = Math.abs(px(v) - cursor);
      if (d < bestDistance) {
        best = v;
        bestDistance = d;
      }
    }
    onActive(best.id);
  };

  const step = (dir: 1 | -1) => {
    const i = versions.findIndex((v) => v.id === active.id);
    const next = versions[Math.min(versions.length - 1, Math.max(0, i + dir))];
    onActive(next.id);
  };

  const tooltipLeft = Math.min(Math.max(ax, 118), width - 118);
  const flip = ay < 150;

  return (
    <div ref={wrapRef} className="relative" style={{ height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${ROLE_BY_ID[role].label} ELO across ${versions.length} resume versions. Currently ${active.ratings[role]} at ${active.label}.`}
        tabIndex={0}
        className="touch-pan-y overflow-visible outline-offset-8"
        onPointerMove={(e) => nearest(e.clientX)}
        onPointerLeave={() => onActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            step(-1);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            step(1);
          }
        }}
        onBlur={() => onActive(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#BC7767" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#F3CDC4" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={m.left}
              x2={width - m.right}
              y1={y(t)}
              y2={y(t)}
              stroke="#403926"
              strokeOpacity={0.09}
            />
            <text
              x={m.left - 12}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              className="fill-olive font-mono text-[10px]"
            >
              {t}
            </text>
          </g>
        ))}

        {showCenter && (
          <g>
            <line
              x1={m.left}
              x2={width - m.right}
              y1={y(ELO_CENTER)}
              y2={y(ELO_CENTER)}
              stroke="#403926"
              strokeOpacity={0.35}
              strokeDasharray="2 5"
              strokeLinecap="round"
            />
            <text
              x={width - m.right}
              y={y(ELO_CENTER) - 8}
              textAnchor="end"
              className="fill-olive text-[10px] uppercase tracking-[0.14em]"
            >
              Average resume
            </text>
          </g>
        )}

        <motion.path
          d={roleArea}
          fill={`url(#${gradId})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: inView ? 1 : 0, d: roleArea }}
          transition={{ opacity: { duration: 1.4, delay: 0.8 }, d: SPRING }}
        />

        {showOverallRef && (
          <motion.path
            d={overallLine}
            fill="none"
            stroke="#403926"
            strokeOpacity={0.42}
            strokeWidth={1.4}
            strokeDasharray="3 5"
            strokeLinecap="round"
            initial={false}
            animate={{ d: overallLine }}
            transition={SPRING}
          />
        )}

        <motion.path
          d={roleLine}
          fill="none"
          stroke="#2A221C"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, d: roleLine }}
          animate={{ pathLength: inView ? 1 : 0, d: roleLine }}
          transition={{ pathLength: { duration: 1.8, ease: EASE }, d: SPRING }}
        />

        <motion.line
          y1={m.top - 6}
          y2={height - m.bottom}
          stroke="#BC7767"
          strokeWidth={1.2}
          initial={false}
          animate={{ x1: ax, x2: ax }}
          transition={SPRING}
        />

        {versions.map((v, i) => {
          const isActive = v.id === active.id;
          return (
            <g key={v.id}>
              <motion.circle
                r={isActive ? 7 : 4.5}
                fill={isActive ? "#BC7767" : "#F7F6F5"}
                stroke="#2A221C"
                strokeWidth={isActive ? 0 : 1.8}
                initial={{ opacity: 0, cx: px(v), cy: y(v.ratings[role]) }}
                animate={{
                  opacity: inView ? 1 : 0,
                  cx: px(v),
                  cy: y(v.ratings[role]),
                }}
                transition={{
                  opacity: { duration: 0.5, delay: 0.5 + i * 0.16 },
                  cx: SPRING,
                  cy: SPRING,
                }}
              />
              <text
                x={px(v)}
                y={height - m.bottom + 22}
                textAnchor="middle"
                className={`font-mono text-[10px] transition-colors duration-300 ${
                  isActive ? "fill-ink" : "fill-olive"
                }`}
              >
                {v.label}
              </text>
              {!compact && (
                <text
                  x={px(v)}
                  y={height - m.bottom + 37}
                  textAnchor="middle"
                  className="fill-taupe text-[9.5px]"
                >
                  {formatDate(v.uploadedAt)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <motion.div
          className="pointer-events-none absolute left-0 top-0 z-10 w-[220px]"
          initial={false}
          animate={{
            x: tooltipLeft - 110,
            y: flip ? ay + 22 : ay - 22,
          }}
          transition={SPRING}
        >
          <div
            className="glass rounded-2xl px-3.5 py-3"
            style={{ transform: flip ? "none" : "translateY(-100%)" }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[0.7rem] text-olive">
                {active.label} · {formatDate(active.uploadedAt, "long")}
              </span>
              {before ? (
                <span
                  className={`font-mono text-[0.7rem] ${
                    delta >= 0 ? "text-bark" : "text-clay"
                  }`}
                >
                  {formatDelta(delta)}
                </span>
              ) : null}
            </div>
            <p className="font-display mt-0.5 text-[1.9rem] leading-none text-ink">
              {active.ratings[role]}
            </p>
            <p className="mt-1.5 text-[0.74rem] leading-snug text-olive">{active.note}</p>
          </div>
      </motion.div>
    </div>
  );
}
