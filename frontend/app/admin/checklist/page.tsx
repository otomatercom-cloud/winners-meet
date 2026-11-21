"use client";
import { useState } from "react";
import { CheckSquare, Copy, Link2, Plus, RotateCcw, Square, Trash2 } from "lucide-react";
import { useEvent } from "@/components/EventContext";
import { api, useFetch } from "@/lib/api";
import { Button, Card, Empty, ErrorBox, PageHeader, Spinner, inputCls, useToast } from "@/components/ui";

export default function Checklist() {
  const { eventId, me } = useEvent();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<any>(eventId ? "/checklist" : null, { event_id: eventId }, 15000);
  const [bulk, setBulk] = useState("");
  const [one, setOne] = useState({ name: "", qty: "", section: "" });
  const [busy, setBusy] = useState(false);
  const mgr = !!me?.manager;
  const run = async (fn: () => Promise<any>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast(ok); reload(); } catch (e: any) { toast(e.message, "err"); }
    setBusy(false);
  };
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Empty>No event selected.</Empty>;
  const link = typeof window !== "undefined" ? `${window.location.origin}/checklist/${data.token}` : "";
  const groups: Record<string, any[]> = {};
  data.items.forEach((i: any) => { (groups[i.section || "General"] ||= []).push(i); });
  const p = data.progress;
  const tick = (i: any) => run(() => api(`/checklist/${i.id}/tick`, { method: "POST", body: { done: !i.done } }));

  return (
    <div>
      <PageHeader title="Event checklist" subtitle="Things to take to the event. Tick each one when it is packed." />
      <Card className="mb-4 p-4">
        <div className="flex justify-between text-sm font-medium"><span>{p.done} of {p.total} taken</span><span>{p.percent}%</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${p.percent}%` }} /></div>
      </Card>
      {mgr && (
        <Card className="mb-4 space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" /> Public link (view only, nobody can edit)</div>
          <div className="flex flex-wrap gap-2">
            <input readOnly value={link} className={inputCls + " min-w-0 flex-1 text-xs"} onFocus={(e) => e.target.select()} />
            <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(link); toast("Link copied"); }}><Copy className="h-4 w-4" /> Copy</Button>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={data.public} onChange={(e) => run(() => api("/checklist/link", { method: "POST", body: { event_id: eventId, public: e.target.checked } }))} /> Link is on</label>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => confirm("The old link will stop working. Continue?") && run(() => api("/checklist/link", { method: "POST", body: { event_id: eventId, regenerate: true } }), "New link created")}>New link</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => confirm("Untick all items?") && run(() => api("/checklist/reset", { method: "POST", body: { event_id: eventId } }), "All unticked")}><RotateCcw className="h-4 w-4" /> Untick all</Button>
          </div>
        </Card>
      )}
      {Object.entries(groups).map(([sec, items]) => (
        <Card key={sec} className="mb-3 overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">{sec}</div>
          <ul className="divide-y divide-slate-100">
            {items.map((i: any) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                <button disabled={busy} onClick={() => tick(i)} aria-label={i.name} aria-pressed={i.done}>
                  {i.done ? <CheckSquare className="h-6 w-6 text-emerald-600" /> : <Square className="h-6 w-6 text-slate-300" />}
                </button>
                <div className="min-w-0 flex-1">
                  <span className={i.done ? "text-slate-400 line-through" : ""}>{i.name}</span>
                  {i.qty && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{i.qty}</span>}
                  {i.done && i.done_by && <div className="text-xs text-slate-400">{i.done_by}</div>}
                </div>
                {mgr && <button aria-label="Delete" className="text-slate-400 hover:text-rose-600" onClick={() => confirm(`Delete "${i.name}"?`) && run(() => api("/checklist/delete", { method: "POST", body: { id: i.id } }))}><Trash2 className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {!data.items.length && <Empty>No items yet.{mgr ? " Add them below." : ""}</Empty>}
      {mgr && (
        <>
          <Card className="mb-4 mt-4 p-4">
            <div className="mb-2 text-sm font-semibold">Add one item</div>
            <div className="grid gap-2 sm:grid-cols-4">
              <input className={inputCls + " sm:col-span-2"} placeholder="Item (e.g. Banner)" value={one.name} onChange={(e) => setOne({ ...one, name: e.target.value })} />
              <input className={inputCls} placeholder="Qty / note" value={one.qty} onChange={(e) => setOne({ ...one, qty: e.target.value })} />
              <input className={inputCls} placeholder="Section" value={one.section} onChange={(e) => setOne({ ...one, section: e.target.value })} />
            </div>
            <Button className="mt-3" size="sm" loading={busy} disabled={!one.name.trim()} onClick={() => run(async () => { await api("/checklist/save", { method: "POST", body: { event_id: eventId, ...one } }); setOne({ ...one, name: "", qty: "" }); })}><Plus className="h-4 w-4" /> Add</Button>
          </Card>
          <Card className="p-4">
            <div className="mb-1 text-sm font-semibold">Add many (one per line)</div>
            <p className="mb-2 text-xs text-slate-500">Start a line with # for a section name. Use &quot; - &quot; for quantity, e.g. <code>Banner - 2</code></p>
            <textarea className={inputCls + " h-40 font-mono text-sm"} placeholder={"# Stage\nBanner - 2\nMic\n# Registration desk\nPens - 50"} value={bulk} onChange={(e) => setBulk(e.target.value)} />
            <Button className="mt-3" size="sm" loading={busy} disabled={!bulk.trim()} onClick={() => run(async () => { const r = await api<any>("/checklist/bulk", { method: "POST", body: { event_id: eventId, text: bulk } }); setBulk(""); toast(`${r.created} items added`); })}>Add all</Button>
          </Card>
        </>
      )}
    </div>
  );
}
