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
          <div className="grid grid-cols-[repeat(auto-fill,minmax(54px,1fr))] gap-1.5">
            {(seats || []).filter((s) => s.block_id === b.id).map((s) => (
              <button key={s.id} title={s.occupant?.name || s.label} onClick={() => { setOpen(s); setQ(""); setFound([]); }}
                className={cx("flex h-12 flex-col items-center justify-center rounded-lg text-xs font-semibold transition active:scale-95", s.occupant ? "bg-emerald-500 text-white" : s.blocked ? "bg-slate-400 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:ring-brand-500")}>
                {s.label}
                {s.occupant && <span className="max-w-full truncate px-0.5 text-[9px] font-normal opacity-90">{s.occupant.name.split(" ")[0]}</span>}
              </button>
            ))}
          </div>
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
