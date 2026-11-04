"use client";
import { useState } from "react";
import { AlertTriangle, Armchair, Crown, MessageCircle, Undo2 } from "lucide-react";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, CategoryChip, approvalBadge, fmtPhone, fmtTime, hatBadge, useToast, waBadge, inputCls } from "@/components/ui";
import type { Participant, Seat } from "@/lib/types";

/** The big "desk" card: shows who someone is, lets staff check in / change seat / hat / resend. */
export default function ParticipantCard({ p, onChange, eventId, manager }: { p: Participant; onChange: (p: Participant) => void; eventId: number; manager: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const [pickSeat, setPickSeat] = useState(false);
  const [seatId, setSeatId] = useState("");
  const blockId = p.category?.seat_block_id || "";
  const { data: seats } = useFetch<Seat[]>(pickSeat ? "/seats" : null, { event_id: eventId });

  const act = async (key: string, path: string, body: any = {}, okMsg?: string) => {
    setBusy(key);
    try {
      const r = await api<Participant>(`/participants/${p.id}/${path}`, { method: "POST", body });
      onChange(r);
      if (r.already) toast("Already checked in", "err");
      else if (okMsg) toast(okMsg);
      setPickSeat(false);
      setSeatId("");
    } catch (e: any) {
      toast(e.message, "err");
      if (/full|Select a seat|Many people/i.test(e.message)) setPickSeat(true);
    }
    setBusy("");
  };

  const pendingApproval = p.approval_state !== "approved";
  const free = (seats || []).filter((s) => !s.occupant && !s.blocked && (!s.reserved_for || s.id === p.reserved_seat_id));
  const manual = p.category?.seat_mode === "manual";
  return (
    <div className="pop overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`px-5 py-4 ${p.state === "checked_in" ? "bg-emerald-50" : pendingApproval ? "bg-rose-50" : "bg-slate-50"}`}>
        <div className="flex flex-wrap items-center gap-2">
          {p.category && <CategoryChip name={p.category.name} color={p.category.color} />}
          <Badge tone="violet">{p.kind === "teacher" ? "Teacher" : "Student"}</Badge>
          {approvalBadge(p.approval_state)}
          {hatBadge(p.hat_state)}
        </div>
        <div className="mt-2 text-2xl font-bold leading-tight">{p.name}</div>
        <div className="text-sm text-slate-600">{fmtPhone(p.phone)}{p.place ? ` · ${p.place}` : ""}{p.institution ? ` · ${p.institution}` : ""}</div>
      </div>

      {p.state === "checked_in" && (
        <div className="px-5 py-5 text-center">
          <div className="text-sm text-slate-500">Seat</div>
          <div className="text-6xl font-extrabold tracking-tight text-emerald-600">{p.seat}</div>
          <div className="mt-1 text-xs text-slate-500">Checked in {fmtTime(p.checkin_on)}{p.checkin_by ? ` by ${p.checkin_by}` : ""}</div>
          {p.hat_state === "issued" && p.category?.hat && (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-amber-100 px-4 py-3 text-lg font-bold text-amber-900"><Crown className="h-6 w-6" /> GIVE HAT{p.category.hat_label ? ` · ${p.category.hat_label}` : ""}</div>
          )}
        </div>
      )}

      {pendingApproval && (
        <div className="mx-5 my-4 flex items-start gap-2 rounded-xl bg-rose-100 p-3 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">{p.approval_state === "rejected" ? "Registration rejected" : "Waiting for admin approval"}</div>
            {p.match_note && <div>{p.match_note}</div>}
            {manager && p.approval_state === "pending" && (
              <Button size="sm" className="mt-2" loading={busy === "approve"} onClick={() => act("approve", "approve", {}, "Approved")}>Approve now</Button>
            )}
          </div>
        </div>
      )}

      {p.state !== "checked_in" && !pendingApproval && (
        <div className="space-y-3 px-5 py-4">
          {manual || pickSeat ? (
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-700">{manual ? "Choose a seat for this person" : "Choose a seat"}</div>
              <SeatSelect seats={free} defaultBlock={blockId} value={seatId} onChange={setSeatId} />
              <Button size="lg" className="w-full" disabled={!seatId} loading={busy === "checkin"} onClick={() => act("checkin", "checkin", { seat_id: seatId }, "Checked in")}>
                <Armchair className="h-5 w-5" /> Check in with this seat
              </Button>
              {!manual && <Button variant="ghost" className="w-full" onClick={() => setPickSeat(false)}>Use automatic seat instead</Button>}
            </div>
          ) : (
            <>
              {p.reserved_seat && <div className="rounded-lg bg-violet-50 px-3 py-2 text-center text-sm text-violet-800">Reserved seat: <b className="text-lg">{p.reserved_seat}</b></div>}
              <Button size="lg" variant="success" className="w-full" loading={busy === "checkin"} onClick={() => act("checkin", "checkin", {}, "Checked in")}>{p.reserved_seat ? `Check in · seat ${p.reserved_seat}` : "Check in · auto seat"}</Button>
              <Button variant="ghost" className="w-full" onClick={() => setPickSeat(true)}>Pick a seat manually</Button>
            </>
          )}
        </div>
      )}

      {p.state === "checked_in" && (
        <div className="space-y-3 border-t border-slate-100 px-5 py-4">
          {pickSeat ? (
            <div className="space-y-2">
              <SeatSelect seats={free} defaultBlock={blockId} value={seatId} onChange={setSeatId} />
              <div className="flex gap-2">
                <Button className="flex-1" disabled={!seatId} loading={busy === "seat"} onClick={() => act("seat", "seat", { seat_id: seatId }, "Seat changed · WhatsApp queued")}>Move to this seat</Button>
                <Button variant="ghost" onClick={() => setPickSeat(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPickSeat(true)}><Armchair className="h-4 w-4" /> Change seat</Button>
              <Button size="sm" variant="secondary" loading={busy === "resend"} onClick={() => act("resend", "resend", { type: "seat" }, "Seat WhatsApp queued")}><MessageCircle className="h-4 w-4" /> Resend seat</Button>
              {p.hat_state === "none" && <Button size="sm" variant="secondary" loading={busy === "hat"} onClick={() => act("hat", "hat", { action: "issue" }, "Hat issued")}><Crown className="h-4 w-4" /> Issue hat</Button>}
              {p.hat_state === "issued" && <Button size="sm" variant="secondary" loading={busy === "hatr"} onClick={() => act("hatr", "hat", { action: "return" }, "Hat returned")}><Crown className="h-4 w-4" /> Hat returned</Button>}
              <Button size="sm" variant="ghost" loading={busy === "undo"} onClick={() => { if (confirm(`Undo check-in for ${p.name}? The seat will be freed.`)) act("undo", "undo-checkin", {}, "Check-in undone"); }}><Undo2 className="h-4 w-4" /> Undo</Button>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-xs text-slate-500">{waBadge(p.wa_state)}</div>
    </div>
  );
}

function SeatSelect({ seats, defaultBlock, value, onChange }: { seats: Seat[]; defaultBlock: number | string; value: string; onChange: (v: string) => void }) {
  const blocks = Array.from(new Set(seats.map((s) => s.block_id)));
  const sorted = [...seats].sort((a, b) => (a.block_id === defaultBlock ? -1 : b.block_id === defaultBlock ? 1 : 0) || a.block_id - b.block_id || a.number - b.number);
  return (
    <select className={inputCls + " h-12 text-base"} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{seats.length ? `Select seat (${seats.length} free${blocks.length > 1 ? " across blocks" : ""})` : "No free seats"}</option>
      {sorted.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  );
}
