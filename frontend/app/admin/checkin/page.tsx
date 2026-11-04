"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEvent } from "@/components/EventContext";
import ParticipantCard from "@/components/ParticipantCard";
import WalkIn from "@/components/WalkIn";
import { api } from "@/lib/api";
import { Badge, Button, Card, CategoryChip, Empty, PageHeader, approvalBadge, fmtPhone, inputCls, useToast } from "@/components/ui";
import type { Participant } from "@/lib/types";

const Scanner = dynamic(() => import("@/components/Scanner"), { ssr: false });

export default function CheckIn() {
  const { eventId, me } = useEvent();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Participant[] | null>(null);
  const [sel, setSel] = useState<Participant | null>(null);
  const [auto, setAuto] = useState(false);
  const [walk, setWalk] = useState(false);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => { try { setAuto(localStorage.getItem("wm_auto") === "1"); } catch {} }, []);
  const toggleAuto = (v: boolean) => { setAuto(v); try { localStorage.setItem("wm_auto", v ? "1" : "0"); } catch {} };

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); return; }
    const my = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<{ rows: Participant[] }>("/participants", { params: { event_id: eventId, q: term, limit: 20 } });
        if (my === seq.current) setResults(r.rows);
      } catch (e: any) { if (my === seq.current) toast(e.message, "err"); }
      if (my === seq.current) setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, eventId]);

  const open = useCallback(async (id: number) => {
    try { setSel(await api<Participant>(`/participants/${id}`)); setResults(null); setQ(""); }
    catch (e: any) { toast(e.message, "err"); }
  }, [toast]);

  const onScan = useCallback(async (text: string) => {
    try {
      let p = await api<Participant>("/lookup/token", { method: "POST", body: { token: text } });
      if (auto && p.state !== "checked_in" && p.approval_state === "approved" && p.category?.seat_mode === "auto") {
        try { p = await api<Participant>(`/participants/${p.id}/checkin`, { method: "POST", body: {} }); toast(`${p.name} → ${p.seat}`); }
        catch (e: any) { toast(e.message, "err"); }
      } else if (p.state === "checked_in") toast(`${p.name} is already checked in`, "err");
      setSel(p);
      if (navigator.vibrate) navigator.vibrate(80);
    } catch (e: any) { toast(e.message, "err"); }
  }, [auto, toast]);

  if (!eventId) return <Empty>Select an event first.</Empty>;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Check-in" subtitle="Scan the QR code or search by name / phone" actions={<Button variant="secondary" size="sm" onClick={() => setWalk(true)}><UserPlus className="h-4 w-4" /> On-spot</Button>} />
      {!sel && (
        <Card className="mb-4 p-4">
          <Scanner onScan={onScan} />
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} className="h-4 w-4 accent-indigo-600" /> Check in automatically after scan (auto-seat categories)</label>
        </Card>
      )}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className={inputCls + " h-12 pl-9 text-base"} placeholder="Name, phone or last digits…" value={q} onChange={(e) => setQ(e.target.value)} inputMode="search" />
        {q && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setQ("")}><X className="h-4 w-4" /></button>}
      </div>
      {results && (
        <div className="mb-4 space-y-2">
          {results.length === 0 && !searching && <Empty>No match. Use “On-spot” to register this person.</Empty>}
          {results.map((r) => (
            <button key={r.id} onClick={() => open(r.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm active:bg-slate-50">
              <div className="min-w-0"><div className="truncate font-medium">{r.name}</div><div className="text-xs text-slate-500">{fmtPhone(r.phone)}</div></div>
              <div className="flex shrink-0 items-center gap-1.5">{r.category && <CategoryChip name={r.category.name} color={r.category.color} />}{r.state === "checked_in" ? <Badge tone="green">{r.seat}</Badge> : approvalBadge(r.approval_state)}</div>
            </button>
          ))}
        </div>
      )}
      {sel && eventId && (
        <>
          <ParticipantCard p={sel} eventId={eventId} manager={!!me?.manager} onChange={setSel} />
          <Button variant="secondary" size="lg" className="mt-4 w-full" onClick={() => setSel(null)}>Next person</Button>
        </>
      )}
      {eventId && <WalkIn open={walk} onClose={() => setWalk(false)} eventId={eventId} onDone={(p) => setSel(p)} />}
    </div>
  );
}
