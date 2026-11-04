import { NextRequest, NextResponse } from "next/server";
import { COOKIE, ODOO_URL } from "@/lib/server";

// Thin BFF proxy: browser -> Next.js (session cookie) -> Odoo /api/wm/*
async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = `${ODOO_URL}/api/wm/${path.join("/")}${req.nextUrl.search}`;
  const isPublic = path[0] === "public";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const sid = req.cookies.get(COOKIE)?.value;
  if (sid && !isPublic) headers.Cookie = `session_id=${sid}`;
  if (!isPublic && !sid) {
    return NextResponse.json({ ok: false, error: "Session expired. Please sign in again.", code: "session" }, { status: 401 });
  }
  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") body = await req.text();
  let res: Response;
  try {
    res = await fetch(url, { method: req.method, headers, body, cache: "no-store", redirect: "manual" });
  } catch {
    return NextResponse.json({ ok: false, error: "Server unreachable. Check the network and retry.", code: "network" }, { status: 502 });
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const expired = res.status >= 300 && res.status < 400;
    const out = NextResponse.json(
      { ok: false, error: expired ? "Session expired. Please sign in again." : "Unexpected server response.", code: expired ? "session" : "bad" },
      { status: expired ? 401 : 502 }
    );
    if (expired) out.cookies.delete(COOKIE);
    return out;
  }
  const out = NextResponse.json(json, { status: res.status });
  if (res.status === 401) out.cookies.delete(COOKIE);
  return out;
}

export const GET = proxy;
export const POST = proxy;
