"use client";

import { motion } from "motion/react";
import { logout } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { useLadder } from "./LadderProvider";

const LINKS = [
  { href: "#top", label: "About" },
  { href: "#rating", label: "Rating" },
  { href: "#roles", label: "Roles" },
  { href: "#lab", label: "A/B lab" },
];

const itemClass =
  "flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-full px-1 text-center text-[0.72rem] text-olive transition-colors hover:bg-white/70 hover:text-ink min-[400px]:text-[0.78rem] sm:px-2 sm:text-[0.84rem] md:text-[0.88rem]";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={`font-display uppercase tracking-[0.22em] ${className ?? ""}`}
    >
      {BRAND.name}
    </span>
  );
}

export function Nav() {
  const { user, signOut } = useLadder();
  const leave = async () => {
    await logout();
    signOut();
  };

  return (
    <motion.nav
      aria-label="Primary"
      className="fixed inset-x-0 top-3 z-50 flex justify-center px-3 md:top-5"
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
    >
      <div className="glass w-full max-w-[38rem] rounded-full px-1.5 py-1.5 sm:px-2">
        <ul className="flex items-center gap-0.5 sm:gap-1">
          {LINKS.map((l) => (
            <li key={l.href} className="flex min-w-0 flex-1">
              <a href={l.href} className={itemClass}>
                {l.label}
              </a>
            </li>
          ))}
          <li className="flex min-w-0 flex-1">
            {user ? (
              <button type="button" onClick={() => void leave()} className={itemClass}>
                Log out
              </button>
            ) : (
              <a href="#account" className={itemClass}>
                Sign in
              </a>
            )}
          </li>
        </ul>
      </div>
    </motion.nav>
  );
}
