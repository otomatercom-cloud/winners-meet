"use client";
import { useState } from "react";
import { CheckCircle2, RotateCcw, Trophy } from "lucide-react";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, Card, Empty, ErrorBox, Modal, Spinner, cx, useToast } from "@/components/ui";

type Item = { id: number; name: string; status: "gray" | "red" | "green"; seat: string; done: boolean; origin?: string };
type Group = { category_id: number; course: string; name: string; color: string; closed: boolean; total: number; done: number; rows: Item[][]; waiting: Item[] };
type Board = { groups: Group[]; missed: Group };
type Ask = { kind: "row" | "close"; title: string; text: string; note?: string; ids?: number[]; cat?: number };
const DOT = { gray: "bg-slate-400", red: "bg-rose-500", green: "bg-emerald-500" } as const;
const CHIP = { gray: "bg-slate-100 text-slate-600", red: "bg-rose-100 text-rose-700", green: "bg-emerald-100 text-emerald-700" } as const;

/** Trophy announcement queue: fixed order, two winners per row, one "row complete" button, Missed list last. */
export default function AnnounceBoard({ eventId }: { eventId: number }) {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<Board>("/stage/board", { event_id: eventId }, 4000);
  const [limit, setLimit] = useState(5);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!ask) return;
    setBusy(true);
    try {
      if (ask.kind === "row") {
        const r = await api<{ collected: number; missed: number }>("/stage/row/complete", { method: "POST", body: { expected_ids: ask.ids } });
        toast(`${r.collected} collected${r.missed ? ` · ${r.missed} moved to Missed` : ""}`);
      } else {
        const r = await api<{ collected: number; missed: number }>("/stage/category/close", { method: "POST", body: { category_id: ask.cat } });
        toast(`Category complete · ${r.missed} moved to Missed`);
      }
      setAsk(null); reload();
    } catch (e: any) { toast(e.message, "err"); }
    setBusy(false);
  };
  const reopen = async (cat: number) => { try { await api("/stage/category/reopen", { method: "POST", body: { category_id: cat } }); reload(); } catch (e: any) { toast(e.message, "err"); } };

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  const all: Group[] = [...data.groups, data.missed].filter((g) => g.rows.length || g.waiting.length || (!g.closed && g.total > g.done));
  if (!all.length) return <Empty>No winners list yet, or every trophy is collected.</Empty>;

  let used = 0;
  const shown = all.map((g) => { const take = g.rows.slice(0, Math.max(0, limit - used)); used += take.length; return { g, take }; })
    .filter(({ g, take }, i) => take.length > 0 || (i === 0 || (used < limit && g.waiting.length > 0 && g.rows.length === 0)));
  const hidden = all.reduce((n, g) => n + g.rows.length, 0) - used;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> in the hall</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" /> registered, not arrived</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-slate-400" /> not registered</span>
      </div>
      {shown.map(({ g, take }) => (
        <Card key={g.category_id || "missed"} className={cx("overflow-hidden", g.category_id === 0 && "ring-2 ring-amber-300")}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              {g.course && <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">{g.course}</div>}
              <div className="flex items-center gap-2 text-xl font-bold"><i className="h-3 w-3 rounded-full" style={{ background: g.color }} />{g.name}{g.closed && <Badge tone="green">announced</Badge>}</div>
              <div className="text-xs text-slate-500">{g.category_id ? `${g.done}/${g.total} collected` : `${g.total} waiting for the final round`}</div>
            </div>
            {g.category_id !== 0 && (g.closed
              ? <Button size="sm" variant="ghost" onClick={() => reopen(g.category_id)}><RotateCcw className="h-4 w-4" /> Reopen</Button>
              : <Button size="sm" variant="secondary" onClick={() => setAsk({ kind: "close", cat: g.category_id, title: "Category announcement complete?", text: `${g.course ? g.course + " · " : ""}${g.name}: everyone who has not collected moves to the Missed list, and the stage staff are told on WhatsApp.` })}><CheckCircle2 className="h-4 w-4" /> Announcement complete</Button>)}
          </div>
          <div className="space-y-3 p-4">
            {take.length === 0 && <p className="text-sm text-slate-500">Nobody from this category is in the hall right now.</p>}
            {take.map((row, idx) => (
              <div key={row.map((r) => r.id).join("-")} className={cx("rounded-xl border p-3", idx === 0 && g === shown[0].g ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200")}>
                <div className="grid grid-cols-2 gap-3">
                  {row.map((r) => (
                    <div key={r.id} className={cx("min-w-0 rounded-lg p-3 ring-1", r.status === "green" ? "bg-emerald-50 ring-emerald-300" : r.status === "red" ? "bg-rose-50 ring-rose-300" : "bg-slate-50 ring-slate-300")}>
                      {r.origin && <div className="mb-1 inline-block max-w-full truncate rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">{r.origin}</div>}
                      <div className="flex items-center gap-2"><i className={cx("h-2.5 w-2.5 shrink-0 rounded-full", DOT[r.status])} /><span className={cx("truncate text-lg font-bold", r.status === "red" && "text-rose-700", r.status === "green" && "text-emerald-700", r.status === "gray" && "text-slate-500")}>{r.name}</span></div>
                      {r.status === "green"
                        ? (r.seat && <div className="mt-0.5 text-xs font-medium text-emerald-600">Seat {r.seat}</div>)
                        : <div className={cx("mt-0.5 text-xs font-medium", r.status === "red" ? "text-rose-600" : "text-slate-500")}>{r.status === "red" ? "Registered · not arrived" : "Not registered"}</div>}
                    </div>
                  ))}
                  {row.length === 1 && <div />}
                </div>
                <Button size="lg" variant="success" className="mt-3 w-full" onClick={() => setAsk({
                  kind: "row", ids: row.map((r) => r.id), title: "Row complete?",
                  text: row.filter((r) => r.status === "green").map((r) => r.name).join("  &  ") || "Nobody in this row is in the hall",
                  note: row.some((r) => r.status !== "green") ? `Not here, moves to the Missed list: ${row.filter((r) => r.status !== "green").map((r) => r.name).join(", ")}` : "",
                })}><Trophy className="h-5 w-5" /> Row complete</Button>
              </div>
            ))}
            {g.waiting.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500"><span>Not in the hall:</span>
                {g.waiting.map((w) => <span key={w.id} className={cx("rounded-full px-2 py-0.5 font-medium", CHIP[w.status])}>{w.name}{w.origin ? ` (${w.origin})` : ""}</span>)}
              </div>
            )}
          </div>
        </Card>
      ))}
      {hidden > 0 && <Button variant="secondary" className="w-full" onClick={() => setLimit(limit + 5)}>Show 5 more rows ({hidden} waiting)</Button>}
      {limit > 5 && hidden <= 0 && <Button variant="ghost" className="w-full" onClick={() => setLimit(5)}>Show fewer</Button>}

      <Modal open={!!ask} onClose={() => !busy && setAsk(null)} title={ask?.title || ""}>
        <div className="space-y-4">
          <p className="text-lg font-semibold">{ask?.text}</p>
          {ask?.note && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{ask.note}</p>}
          <div className="grid grid-cols-2 gap-3"><Button variant="secondary" size="lg" onClick={() => setAsk(null)}>Cancel</Button><Button size="lg" variant="success" loading={busy} onClick={run}>Yes, confirm</Button></div>
        </div>
      </Modal>
    </div>
  );
}
