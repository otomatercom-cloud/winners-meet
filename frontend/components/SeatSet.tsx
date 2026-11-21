"use client";
import { useState } from "react";
import { Armchair } from "lucide-react";
import { api, useFetch } from "@/lib/api";
import { Button, Modal, inputCls, useToast } from "@/components/ui";
import type { Participant, Seat } from "@/lib/types";

/** Seat cell for the list: shows the seat and opens a picker. Arrived people are moved straight away;
 *  people not yet here get a pre-assigned seat (administrators), given at check-in. */
export default function SeatSet({ p, eventId, manager, onDone }: { p: Participant; eventId: number; manager: boolean; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState("");
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const arrived = p.state === "checked_in";
  const canSet = p.approval_state === "approved" && (arrived || manager);
  const { data: seats } = useFetch<Seat[]>(open ? "/seats" : null, { event_id: eventId });
  const cat = p.category;
  const ranged = !!(cat && cat.seat_block_id);
  const free = (seats || []).filter((s) => !s.occupant && !s.blocked && (!s.reserved_for || s.id === p.reserved_seat_id)
    && (!ranged || all || (s.block_id === cat!.seat_block_id && (!cat!.seat_from || s.number >= cat!.seat_from) && (!cat!.seat_to || s.number <= cat!.seat_to))));
  const label = p.seat || (p.reserved_seat ? `${p.reserved_seat} (reserved)` : "");
  const save = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      if (arrived) await api(`/participants/${p.id}/seat`, { method: "POST", body: { seat_id: Number(sel) } });
      else await api("/participants/reserve", { method: "POST", body: { id: p.id, seat_id: Number(sel) } });
      toast(arrived ? "Seat changed" : "Seat pre-assigned");
      setOpen(false); setSel(""); onDone();
    } catch (e: any) { toast(e.message, "err"); }
    setBusy(false);
  };
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        <span className="font-semibold">{label || <span className="font-normal text-slate-400">—</span>}</span>
        {canSet && <button type="button" title={label ? "Change seat" : "Set seat"} aria-label="Set seat" onClick={() => setOpen(true)}
          className="rounded-md border border-slate-200 p-1 text-slate-500 hover:border-brand-500 hover:text-brand-600"><Armchair className="h-4 w-4" /></button>}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={`Seat for ${p.name}`}>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{arrived ? "Moves the seat now and sends the seat WhatsApp." : "Pre-assigns the seat; it is given when they check in."}</p>
          <select className={inputCls} value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">{seats ? `Select a seat (${free.length} free)` : "Loading seats…"}</option>
            {free.map((s) => <option key={s.id} value={s.id}>{s.label}{s.row_name ? ` · Row ${s.row_name}` : ""}</option>)}
          </select>
          {ranged && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show seats outside this category&apos;s range</label>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} disabled={!sel} onClick={save}>Save seat</Button></div>
        </div>
      </Modal>
    </div>
  );
}
