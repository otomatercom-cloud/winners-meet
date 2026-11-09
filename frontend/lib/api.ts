"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = any>(path: string, opts: { method?: "GET" | "POST"; body?: unknown; params?: Record<string, any> } = {}): Promise<T> {
  const qs = opts.params
    ? "?" + new URLSearchParams(Object.entries(opts.params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString()
    : "";
  let res: Response;
  try {
    res = await fetch(`/api/wm${path}${qs}`, {
      method: opts.method || (opts.body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("No network. Check your connection and try again.", 0, "network");
  }
  const json = await res.json().catch(() => null);
  if (!json || json.ok === false || !res.ok) {
    const msg = res.status === 413 ? "That file is too large for the server. Please upload a smaller file." : json?.error || "Something went wrong.";
    const err = new ApiError(msg, res.status, json?.code);
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login") && window.location.pathname.startsWith("/admin")) {
      window.location.href = "/login";
    }
    throw err;
  }
  return json.data as T;
}

/** Fetch + optional polling. Keeps the previous data while refreshing (no flicker). */
export function useFetch<T = any>(path: string | null, params?: Record<string, any>, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = path ? path + JSON.stringify(params || {}) : "";
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path, { params });
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e: any) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    alive.current = true;
    setLoading(true);
    load();
    if (!intervalMs) return () => { alive.current = false; };
    const t = setInterval(() => { if (!document.hidden) load(); }, intervalMs);
    return () => { alive.current = false; clearInterval(t); };
  }, [load, intervalMs]);
  return { data, error, loading, reload: load, setData };
}
