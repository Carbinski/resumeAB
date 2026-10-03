"use client";

import { useEffect, useRef, useState } from "react";

export function useElementWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.getBoundingClientRect().width || fallback);
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width || fallback);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fallback]);

  return [ref, width] as const;
}
