"use client";
import { useCallback, useState } from "react";
import { Armchair, Trophy, Undo2 } from "lucide-react";
import { useEvent } from "@/components/EventContext";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, cx, inputCls, useToast } from "@/components/ui";
import AnnounceBoard from "@/components/AnnounceBoard";
import type { Participant } from "@/lib/types";

type Summary = { categories: { id: number; name: string; color: string; present: number; collected: number; absent: number }[]; present: number; collected: number; absent: number };
const TABS = [["present", "Present · waiting"], ["collected", "Collected"], ["absent", "Not arrived"]] as const;

export default function Stage() {
  const { eventId } = useEvent();
  const toast = useToast();
  const [mode, setMode] = useState<"announce" | "lists">("announce");
  const [tab, setTab] = useState<"present" | "collected" | "absent">("present");
  const [kind, setKind] = useState("");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const sum = useFetch<Summary>(eventId ? "/stage" : null, { event_id: eventId, kind }, 5000);
  const params: Record<string, any> = { event_id: eventId, kind, category_id: cat, q, approval: "approved", order: "stage", limit: 200 };
  if (tab === "present") { params.state = "checked_in"; params.trophy = "pending"; }
  else if (tab === "collected") params.trophy = "given";
  else params.state = "registered";
  const { data, error, loading, reload } = useFetch<{ total: number; rows: Participant[] }>(eventId ? "/participants" : null, params, 5000);

  const mark = useCallback(async (p: Participant, done: boolean) => {
    setBusy(p.id);
    try { await api(`/participants/${p.id}/trophy`, { method: "POST", body: { done } }); toast(done ? `${p.name} · trophy collected` : `${p.name} · moved back`); reload(); sum.reload(); }
    catch (e: any) { toast(e.message, "err"); }
    setBusy(null);
  }, [reload, sum, toast]);

  if (!eventId) return <Empty>Select an event first.</Empty>;
  const s = sum.data;
  const count = (k: string) => (s ? (k === "present" ? s.present : k === "collected" ? s.collected : s.absent) : 0);
  const sel = "h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm";
  const switcher = (
    <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
      {([["announce", "Announcement"], ["lists", "Lists (all)"]] as const).map(([k, l]) => <button key={k} onClick={() => setMode(k)} className={cx("rounded-md px-4 py-1.5", mode === k ? "bg-white shadow-sm" : "text-slate-500")}>{l}</button>)}
    </div>
  );
  if (mode === "announce") return (
    <div>
      <PageHeader title="Stage" subtitle="Winners are called two at a time in the fixed order. Mark a row complete when both have collected." />
      {switcher}
      <AnnounceBoard eventId={eventId} />
    </div>
  );
  return (
    <div>
      <PageHeader title="Stage" subtitle="Who is present to collect the trophy. Mark each winner when they collect it." />
      {switcher}
      <div className="mb-4 grid grid-cols-3 gap-3">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("rounded-xl border p-3 text-left transition", tab === k ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white")}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className={cx("text-3xl font-extrabold", k === "present" ? "text-emerald-600" : k === "collected" ? "text-brand-600" : "text-slate-500")}>{count(k)}</div>
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className={sel} value={kind} onChange={(e) => { setKind(e.target.value); setCat(""); }}><option value="">Students + teachers</option><option value="student">Students</option><option value="teacher">Teachers</option></select>
        <select className={sel} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {(s?.categories || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({tab === "present" ? c.present : tab === "collected" ? c.collected : c.absent})</option>)}
        </select>
        <input className={inputCls + " ml-auto w-56"} placeholder="Search name / seat…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : !data?.rows.length ? <Empty>{tab === "present" ? "Nobody is waiting right now." : tab === "collected" ? "No trophies collected yet." : "Everyone has arrived."}</Empty> : (
        <div className="space-y-2">
          {data.rows.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="truncate text-xl font-bold leading-tight">{p.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  {p.category && <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: p.category.color }} />{p.category.name}</span>}
                  {p.seat && <Badge tone="green"><Armchair className="mr-1 inline h-3 w-3" />{p.seat}{p.seat_row ? ` · Row ${p.seat_row_name || p.seat_row}` : ""}</Badge>}
                </div>
              </div>
              {tab === "present" && <Button size="lg" variant="success" loading={busy === p.id} onClick={() => mark(p, true)}><Trophy className="h-5 w-5" /> Collected</Button>}
              {tab === "collected" && <Button size="sm" variant="ghost" loading={busy === p.id} onClick={() => mark(p, false)}><Undo2 className="h-4 w-4" /> Undo</Button>}
              {tab === "absent" && <Badge>not arrived</Badge>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
