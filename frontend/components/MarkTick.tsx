"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { cx } from "@/components/ui";

/** Tick box that saves immediately. `base` is "/teachers" (viewer) or "/participants" (staff). */
export function MarkTick({ base, id, field, value, label, onChange }: { base: string; id: number; field: "trophy" | "profile"; value: boolean; label: string; onChange?: (v: boolean) => void }) {
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const [prev, setPrev] = useState(value);
  if (value !== prev) { setPrev(value); setV(value); }
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    const next = !v; setV(next); setBusy(true);
    try { await api(`${base}/${id}/mark`, { method: "POST", body: { field, value: next } }); onChange?.(next); }
    catch { setV(!next); }
    setBusy(false);
  };
  return (
    <button type="button" aria-label={label} aria-pressed={v} title={label} onClick={toggle} disabled={busy}
      className={cx("flex h-7 w-7 items-center justify-center rounded-md border transition", v ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent hover:border-slate-400")}>
      <Check className="h-4 w-4" strokeWidth={3} />
    </button>
  );
}
