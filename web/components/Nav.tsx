"use client";

import { motion } from "motion/react";
import { logout } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { Magnetic, buttonClass } from "./ui/Button";
import { useLadder } from "./LadderProvider";

const LINKS = [
  { href: "#rating", label: "Rating" },
  { href: "#roles", label: "Roles" },
  { href: "#lab", label: "A/B lab" },
];

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
  const { pickFile, user, signOut } = useLadder();
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
      <div className="glass flex w-full max-w-[640px] items-center justify-between gap-2 rounded-full py-1.5 pl-5 pr-1.5">
        <a href="#top" className="text-[0.95rem] text-ink" aria-label={`${BRAND.name} home`}>
          <Wordmark />
        </a>
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="rounded-full px-3.5 py-2 text-[0.85rem] text-olive transition-colors hover:bg-white/70 hover:text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1">
          {user ? (
            <button
              type="button"
              onClick={() => void leave()}
              className="hidden rounded-full px-3 py-2 text-[0.82rem] text-olive hover:text-ink sm:inline"
            >
              Log out
            </button>
          ) : (
            <a
              href="#account"
              className="hidden rounded-full px-3 py-2 text-[0.82rem] text-olive hover:text-ink sm:inline"
            >
              Sign in
            </a>
          )}
          <Magnetic strength={0.18}>
            <button
              type="button"
              onClick={pickFile}
              className={buttonClass("ink", "h-10 px-5 text-[0.85rem]")}
            >
              Upload résumé
            </button>
          </Magnetic>
        </div>
      </div>
    </motion.nav>
  );
}
