"use client";

import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { motion } from "motion/react";

export function Sparkline({
  values,
  width = 160,
  height = 36,
  stroke = "#403926",
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
}) {
  const pad = 3;
  const x = scaleLinear()
    .domain([0, Math.max(1, values.length - 1)])
    .range([pad, width - pad]);
  const y = scaleLinear()
    .domain([Math.min(...values), Math.max(...values)])
    .range([height - pad, pad]);
  const d =
    line<number>()
      .x((_, i) => x(i))
      .y((v) => y(v))
      .curve(curveMonotoneX)(values) ?? "";
  const last = values.length - 1;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden
    >
      <motion.path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.6 }}
      />
      <motion.circle
        cx={x(last)}
        cy={y(values[last])}
        r={3}
        fill="#BC7767"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 2, type: "spring", stiffness: 300, damping: 14 }}
      />
    </svg>
  );
}
