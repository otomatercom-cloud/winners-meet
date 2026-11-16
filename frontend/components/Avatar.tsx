"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const cache = new Map<string, string>();      // "path:id" -> data URL ("" = no photo)

export function useThumbs(path: string, ids: number[]) {
  const [, bump] = useState(0);
  const key = ids.join(",");
  useEffect(() => {
    const missing = ids.filter((i) => !cache.has(`${path}:${i}`));
    if (!missing.length) return;
    let alive = true;
    api<Record<string, string>>(path, { params: { ids: missing.join(",") } })
      .then((r) => { missing.forEach((i) => cache.set(`${path}:${i}`, r[String(i)] ? "data:image/jpeg;base64," + r[String(i)] : "")); if (alive) bump((n) => n + 1); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  return (id: number) => cache.get(`${path}:${id}`) || "";
}

export function Avatar({ src, name, size = 40 }: { src?: string; name: string; size?: number }) {
  const st = { width: size, height: size };
  return src
    ? <img src={src} alt="" style={st} className="shrink-0 rounded-full object-cover" />
    : <span style={st} className="inline-flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">{(name.trim()[0] || "?").toUpperCase()}</span>;
}
