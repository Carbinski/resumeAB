"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Lets a file be dropped anywhere on the page. Regions that handle their own
 * drops opt out with `data-local-drop`.
 */
export function useWindowFileDrop(onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false);
  const handler = useRef(onFile);
  handler.current = onFile;

  useEffect(() => {
    let depth = 0;
    const isFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const isLocal = (e: DragEvent) =>
      e.target instanceof Element && !!e.target.closest("[data-local-drop]");

    const enter = (e: DragEvent) => {
      if (!isFiles(e) || isLocal(e)) return;
      depth += 1;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!isFiles(e) || isLocal(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (isFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (isLocal(e)) return;
      const file = e.dataTransfer?.files?.[0];
      if (file) handler.current(file);
    };

    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return dragging;
}
