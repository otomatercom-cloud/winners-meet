"use client";
import { useState } from "react";
import { Ban } from "lucide-react";
import { useEvent } from "@/components/EventContext";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, Card, Empty, ErrorBox, Modal, PageHeader, Spinner, cx, inputCls, useToast } from "@/components/ui";
import type { Block, Participant, Seat } from "@/lib/types";

export default function SeatMap() {
  const { eventId, me } = useEvent();
  const toast = useToast();
  const { data: blocks } = useFetch<Block[]>(eventId ? "/blocks" : null, { event_id: eventId }, 10000);
  const { data: seats, error, loading, reload } = useFetch<Seat[]>(eventId ? "/seats" : null, { event_id: eventId }, 5000);
  const [open, setOpen] = useState<Seat | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Participant[]>([]);
  const [busy, setBusy] = useState(false);
  if (!eventId) return <Empty>Select an event first.</Empty>;
  if (loading && !seats) return <Spinner />;
  if (error && !seats) return <ErrorBox message={error} onRetry={reload} />;

  const search = async (v: string) => {
    setQ(v);
    if (v.trim().length < 2) return setFound([]);
    try { setFound((await api<{ rows: Participant[] }>("/participants", { params: { event_id: eventId, q: v, approval: "approved", limit: 8 } })).rows); } catch {}
  };
  const assign = async (p: Participant) => {
    if (!open) return;
    setBusy(true);
    try {
      if (p.state === "checked_in") await api(`/participants/${p.id}/seat`, { method: "POST", body: { seat_id: open.id } });
      else await api(`/participants/${p.id}/checkin`, { method: "POST", body: { seat_id: open.id } });
      toast(`${p.name} → ${open.label}`);
      setOpen(null); setQ(""); setFound([]); reload();
    } catch (e: any) { toast(e.message, "err"); }
    setBusy(false);
  };
  const toggleBlock = async () => {
    if (!open) return;
    try { await api("/seats/block", { method: "POST", body: { id: open.id, blocked: !open.blocked } }); setOpen(null); reload(); }
    catch (e: any) { toast(e.message, "err"); }
  };
  const free = (seats || []).filter((s) => !s.occupant && !s.blocked).length;
  return (
    <div>
      <PageHeader title="Seat map" subtitle={`${(seats || []).length - free} occupied · ${free} free`} actions={<div className="flex items-center gap-3 text-xs text-slate-600"><span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-white ring-1 ring-slate-300" /> free</span><span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-emerald-500" /> occupied</span><span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-slate-400" /> blocked</span></div>} />
      {!blocks?.length ? <Empty>No seat blocks yet. Create them in Categories &amp; seats.</Empty> : blocks.map((b) => (
        <Card key={b.id} className="mb-5 p-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{b.name} <span className="font-normal text-slate-400">{b.prefix}{b.start_no}–{b.prefix}{b.end_no}</span></h3><Badge>{b.occupied}/{b.total}</Badge></div>
          {(() => {
            const mine = (seats || []).filter((s) => s.block_id === b.id);
            const rows: { row: number; seats: Seat[] }[] = [];
            mine.forEach((s) => { const last = rows[rows.length - 1]; if (last && last.row === s.row) last.seats.push(s); else rows.push({ row: s.row, seats: [s] }); });
            const secs = b.sections?.length ? b.sections : null;
            const btn = (s: Seat) => (
              <button key={s.id} title={s.occupant?.name || s.label} onClick={() => { setOpen(s); setQ(""); setFound([]); }}
                className={cx("flex h-12 w-[44px] shrink-0 flex-col items-center justify-center rounded-md px-0.5 text-[11px] font-semibold transition active:scale-95", s.occupant ? "bg-emerald-500 text-white" : s.blocked ? "bg-slate-400 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:ring-brand-500")}>
                {s.label}
                {s.occupant && <span className="max-w-full truncate text-[9px] font-normal opacity-90">{s.occupant.name.split(" ")[0]}</span>}
              </button>
            );
            const chunks = (list: Seat[]) => { if (!secs) return [list]; const out: Seat[][] = []; let i = 0; for (const n of secs) { out.push(list.slice(i, i + n)); i += n; } return out.filter((c) => c.length); };
            const stage = secs && <div className="mb-3 rounded-b-full bg-slate-200 py-1 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500">Stage</div>;
            return (
              <div className="overflow-x-auto pb-1">
                <div className="mx-auto w-max">
                  {stage}
                  {rows.map((r) => (
                    <div key={r.row} className="mb-1.5 flex items-center gap-2">
                      {r.row > 0 && <div className="w-7 shrink-0 text-right text-[10px] font-medium text-slate-400">{r.row}</div>}
                      <div className="flex items-stretch gap-8">
                        {chunks(r.seats).map((c, i) => (
                          <div key={i} className="flex gap-1" style={secs ? { minWidth: secs[i] * 48 - 4, justifyContent: i === 0 && secs.length > 1 ? "flex-end" : "flex-start" } : undefined}>{c.map(btn)}</div>
                        ))}
                      </div>
                      {r.row > 0 && <div className="w-7 shrink-0 text-[10px] font-medium text-slate-400">{r.row}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </Card>
      ))}
      <Modal open={!!open} onClose={() => setOpen(null)} title={`Seat ${open?.label}`}>
        {open?.occupant ? (
          <div className="space-y-3"><div className="text-lg font-semibold">{open.occupant.name}</div><p className="text-sm text-slate-500">Occupied. Open the person to move them to another seat.</p>
            <a href={`/admin/participants/${open.occupant.id}`}><Button className="w-full">Open participant</Button></a></div>
        ) : (
          <div className="space-y-3">
            {!open?.blocked && (
              <>
                <p className="text-sm text-slate-600">Assign this seat to a person (checks them in if they have not arrived).</p>
                <input className={inputCls} placeholder="Search approved participant…" value={q} onChange={(e) => search(e.target.value)} autoFocus />
                <div className="space-y-1.5">{found.map((p) => (
                  <button key={p.id} disabled={busy} onClick={() => assign(p)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50">
                    <span>{p.name}<span className="ml-2 text-xs text-slate-400">{p.seat || "no seat"}</span></span><Badge>{p.category?.name}</Badge></button>
                ))}</div>
              </>
            )}
            {me?.manager && <Button variant="secondary" className="w-full" onClick={toggleBlock}><Ban className="h-4 w-4" /> {open?.blocked ? "Unblock seat" : "Block seat (reserved / broken)"}</Button>}
          </div>
        )}
      </Modal>
    </div>
  );
}
