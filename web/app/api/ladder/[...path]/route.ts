import { type NextRequest } from "next/server";

const ORIGIN = process.env.LADDER_API_ORIGIN ?? "http://127.0.0.1:8000";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const target = `${ORIGIN}/${path.join("/")}${request.nextUrl.search}`;
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
  for (const cookie of response.headers.getSetCookie()) {
    outgoing.append("set-cookie", cookie);
  }
  return new Response(await response.arrayBuffer(), { status: response.status, headers: outgoing });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
