"use client";

import { useState } from "react";
import { deleteAccount, login, logout, signup, updateProfile } from "@/lib/api";
import { INDUSTRIES, LEVELS, type LevelId } from "@/lib/cohort";
import { useLadder } from "./LadderProvider";
import { Button } from "./ui/Button";

const fieldClass =
  "w-full rounded-2xl border border-bark/15 bg-cream/70 px-4 py-3 text-[0.92rem] text-ink outline-none transition-colors placeholder:text-taupe focus:border-clay";

const selectClass = `${fieldClass} appearance-none pr-11 [-webkit-appearance:none] [color-scheme:light]`;

function isCurrentIndustry(id: string): boolean {
  return INDUSTRIES.some((item) => item.id === id);
}

function retiredIndustryLabel(id: string): string {
  if (!id) return "Choose an industry";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function Account() {
  const { user, setUser, offline, refresh, signOut, demo } = useLadder();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nameOnResume, setNameOnResume] = useState(user?.nameOnResume ?? "");
  const [level, setLevel] = useState<LevelId>(user?.level ?? "intern");
  const [industry, setIndustry] = useState(user?.industry ?? "software");
  const [company, setCompany] = useState(user?.company ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = async () => {
    if (demo) {
      setError(
        mode === "login"
          ? "Leave sample history before logging in."
          : "Leave sample history before creating an account.",
      );
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (mode === "signup" && nameOnResume.trim().length < 2) {
      setError("Enter the name as it appears on your resume.");
      return;
    }
    if (mode === "signup" && !isCurrentIndustry(industry)) {
      setError("Pick an industry from the list.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const account =
        mode === "login"
          ? await login(email, password)
          : await signup({ email, password, nameOnResume, level, industry, company });
      setUser(account);
      setPassword("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that account.");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    if (demo) {
      setError("Leave sample history before changing your account.");
      return;
    }
    if (!isCurrentIndustry(industry)) {
      setError("Pick an industry from the list.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const account = await updateProfile({ nameOnResume, level, industry, company });
      setUser(account);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update your profile.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (demo) {
      setError("Leave sample history before deleting an account.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      signOut();
      setConfirmDelete(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="account" className="mx-auto max-w-[720px] px-5 pb-8 sm:px-8">
      <div className="rounded-[32px] border border-bark/10 bg-white/40 p-5 sm:p-7">
        <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-olive">Account</p>
        <h2 className="font-display mt-2 text-[2rem] leading-none text-ink">
          {user ? "Your profile" : "Create an account"}
        </h2>
        {user ? (
          <p className="mt-3 text-[0.9rem] leading-relaxed text-olive">
            Level and industry decide who appears around you. Company is shown on your anonymous card.
          </p>
        ) : null}
        {offline ? (
          <p className="mt-3 text-[0.86rem] text-clay" role="status">
            The rating service is not running.
          </p>
        ) : null}
        {demo ? (
          <p className="mt-3 text-[0.86rem] text-olive" role="status">
            Sample history. Creating an account, logging in, and deleting stay off until you leave it.
          </p>
        ) : null}

        <form
          className="mt-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (user) void saveProfile();
            else void submit();
          }}
        >
        {user ? (
          <ProfileFields
            nameOnResume={nameOnResume}
            setNameOnResume={setNameOnResume}
            level={level}
            setLevel={setLevel}
            industry={industry}
            setIndustry={setIndustry}
            company={company}
            setCompany={setCompany}
          />
        ) : (
          <>
            <div className="mt-5 flex gap-2">
              {(["signup", "login"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                  className={`rounded-full px-4 py-1.5 text-[0.85rem] ${
                    mode === item ? "bg-ink text-cream" : "text-olive"
                  }`}
                >
                  {item === "signup" ? "Sign up" : "Log in"}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-3">
              <input
                className={fieldClass}
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <input
                className={fieldClass}
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {mode === "signup" ? (
              <ProfileFields
                nameOnResume={nameOnResume}
                setNameOnResume={setNameOnResume}
                level={level}
                setLevel={setLevel}
                industry={industry}
                setIndustry={setIndustry}
                company={company}
                setCompany={setCompany}
              />
            ) : null}
          </>
        )}

        {error ? (
          <p role="alert" className="mt-3 text-[0.86rem] text-clay">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {user ? (
            <>
              <Button type="submit" disabled={busy}>
                Save profile
              </Button>
              <button
                type="button"
                className="text-[0.85rem] text-olive underline decoration-bark/25 underline-offset-4"
                onClick={() => void logout().then(() => signOut())}
              >
                Log out
              </button>
              {confirmDelete ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}>
                  Confirm delete
                </Button>
              ) : (
                <button
                  type="button"
                  className="text-[0.85rem] text-taupe"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete account
                </button>
              )}
            </>
          ) : (
            <Button type="submit" disabled={busy}>
              {mode === "login" ? "Log in" : "Create account"}
            </Button>
          )}
          {user ? <span className="font-mono text-[0.72rem] text-taupe">{user.email}</span> : null}
        </div>
        </form>
      </div>
    </section>
  );
}

function ProfileFields({
  nameOnResume,
  setNameOnResume,
  level,
  setLevel,
  industry,
  setIndustry,
  company,
  setCompany,
}: {
  nameOnResume: string;
  setNameOnResume: (value: string) => void;
  level: LevelId;
  setLevel: (value: LevelId) => void;
  industry: string;
  setIndustry: (value: string) => void;
  company: string;
  setCompany: (value: string) => void;
}) {
  return (
    <div className="mt-4 grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor="name-on-resume" className="text-[0.78rem] text-olive">
          Name as it appears on your resume
        </label>
        <p id="name-on-resume-hint" className="text-[0.86rem] leading-relaxed text-olive">
          This name is removed from the file before scoring so the rating is about the work.
        </p>
        <input
          id="name-on-resume"
          className={fieldClass}
          value={nameOnResume}
          onChange={(event) => setNameOnResume(event.target.value)}
          autoComplete="name"
          aria-describedby="name-on-resume-hint"
        />
      </div>
      <div className="flex gap-2">
        {LEVELS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setLevel(item.id)}
            className={`rounded-full border px-4 py-2 text-[0.85rem] ${
              level === item.id ? "border-ink bg-ink text-cream" : "border-bark/20 text-olive"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label className="grid gap-1.5 text-[0.78rem] text-olive">
        Industry
        <span className="relative block">
          <select
            className={selectClass}
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
          >
            {isCurrentIndustry(industry) ? null : (
              <option value={industry} disabled className="bg-cream text-ink">
                {retiredIndustryLabel(industry)}
              </option>
            )}
            {INDUSTRIES.map((item) => (
              <option key={item.id} value={item.id} className="bg-cream text-ink">
                {item.label}
              </option>
            ))}
          </select>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-olive"
            fill="none"
          >
            <path
              d="M5 7.5 10 12.5 15 7.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </label>
      <label className="grid gap-1.5 text-[0.78rem] text-olive">
        Most recent company
        <input
          className={fieldClass}
          value={company}
          placeholder="Optional"
          onChange={(event) => setCompany(event.target.value)}
        />
      </label>
    </div>
  );
}
