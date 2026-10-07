import { type NextRequest } from "next/server";

const ORIGIN = process.env.LADDER_API_ORIGIN ?? "http://127.0.0.1:8000";
const SESSION_COOKIE = "ladder_session";
const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;

function requestIsSecure(request: NextRequest): boolean {
  if (request.nextUrl.protocol === "https:") return true;
  const forwarded = request.headers.get("x-forwarded-proto");
  return forwarded?.split(",")[0]?.trim() === "https";
}

function hardenSetCookie(header: string, secure: boolean): string | null {
  const segments = header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;
  const pair = segments[0];
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  if (name !== SESSION_COOKIE) return null;
  const extras = segments.slice(1).filter((attr) => {
    const key = attr.split("=")[0]?.trim().toLowerCase();
    return key === "max-age" || key === "expires";
  });
  const parts = [pair, "Path=/", "HttpOnly", "SameSite=Lax", ...extras];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  let origin: URL;
  try {
    origin = new URL(ORIGIN);
  } catch {
    return Response.json({ detail: "The rating service is not running." }, { status: 503 });
  }
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    return Response.json({ detail: "The rating service is not running." }, { status: 503 });
  }
  if (path.some((segment) => !PATH_SEGMENT.test(segment))) {
    return Response.json({ detail: "Not found." }, { status: 404 });
  }
  const prefix = origin.pathname.replace(/\/$/, "");
  const target = new URL(`${prefix}/${path.join("/")}${request.nextUrl.search}`, origin);
  if (target.origin !== origin.origin) {
    return Response.json({ detail: "Not found." }, { status: 404 });
  }

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  let response: Response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      redirect: "manual",
    });
  } catch {
    return Response.json({ detail: "The rating service is not running." }, { status: 503 });
  }

  const outgoing = new Headers();
  const responseType = response.headers.get("content-type");
  if (responseType) outgoing.set("content-type", responseType);
  const secure = requestIsSecure(request);
  for (const cookieHeader of response.headers.getSetCookie()) {
    const hardened = hardenSetCookie(cookieHeader, secure);
    if (hardened) outgoing.append("set-cookie", hardened);
  }
  return new Response(await response.arrayBuffer(), { status: response.status, headers: outgoing });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
