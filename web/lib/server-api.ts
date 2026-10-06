import { cookies } from "next/headers";
import type { Account, ResumeVersion } from "./types";

const origin = process.env.LADDER_API_ORIGIN ?? "http://127.0.0.1:8000";

export async function loadInitial(): Promise<{
  history: ResumeVersion[];
  user: Account | null;
  offline: boolean;
}> {
  const cookie = (await cookies()).toString();
  try {
    const [historyResponse, meResponse] = await Promise.all([
      fetch(`${origin}/versions`, { headers: { cookie }, cache: "no-store" }),
      fetch(`${origin}/me`, { headers: { cookie }, cache: "no-store" }),
    ]);
    const history = historyResponse.ok ? ((await historyResponse.json()) as ResumeVersion[]) : [];
    const user = meResponse.ok ? ((await meResponse.json()) as Account) : null;
    return { history, user, offline: false };
  } catch {
    return { history: [], user: null, offline: true };
  }
}
