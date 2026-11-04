import { NextRequest, NextResponse } from "next/server";
import { COOKIE, COOKIE_OPTS, ODOO_DB, ODOO_URL } from "@/lib/server";

export async function POST(req: NextRequest) {
  const { login, password } = await req.json().catch(() => ({}));
  if (!login || !password) return NextResponse.json({ ok: false, error: "Enter username and password." }, { status: 400 });
  let res: Response;
  try {
    res = await fetch(`${ODOO_URL}/web/session/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { db: ODOO_DB, login, password } }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Cannot reach the server. Check your connection." }, { status: 502 });
  }
  const data = await res.json().catch(() => null);
  const uid = data?.result?.uid;
  if (!uid) return NextResponse.json({ ok: false, error: "Wrong username or password." }, { status: 401 });
  const sid = res.headers.getSetCookie().map((c) => /^session_id=([^;]+)/.exec(c)?.[1]).find(Boolean);
  if (!sid) return NextResponse.json({ ok: false, error: "Login failed. Please try again." }, { status: 502 });
  const out = NextResponse.json({ ok: true });
  out.cookies.set(COOKIE, sid, COOKIE_OPTS);
  return out;
}
