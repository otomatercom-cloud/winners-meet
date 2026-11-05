"use client";
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Crown, ScanLine } from "lucide-react";
import { useEvent } from "@/components/EventContext";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, Card, CategoryChip, Empty, ErrorBox, PageHeader, Spinner, cx, fmtPhone, inputCls, useToast } from "@/components/ui";
import type { KitItem, Participant } from "@/lib/types";

const Scanner = dynamic(() => import("@/components/Scanner"), { ssr: false });
const TABS = [["issued", "Pending return"], ["returned", "Returned"], ["lost", "Lost"]] as const;

export default function Kit() {
  const { eventId } = useEvent();
  const toast = useToast();
  const [tab, setTab] = useState<"issued" | "returned" | "lost">("issued");
  const [item, setItem] = useState("");
  const [q, setQ] = useState("");
  const [scan, setScan] = useState(false);
  const { data, error, loading, reload } = useFetch<{ total: number; rows: Participant[] }>(eventId ? "/participants" : null, { event_id: eventId, hat: tab, item_id: item, q, limit: 200 }, 8000);
  const inv = useFetch<KitItem[]>(eventId ? "/items" : null, { event_id: eventId }, 8000);
  const [busy, setBusy] = useState<string | null>(null);

  const act = useCallback(async (id: number, action: string, itemId?: number, label?: string) => {
    setBusy(`${id}-${itemId || "all"}-${action}`);
    try { await api(`/participants/${id}/hat`, { method: "POST", body: { action, item_id: itemId || null } }); toast(action === "return" ? `Returned${label ? " · " + label : ""}` : "Updated"); reload(); inv.reload(); }
    catch (e: any) { toast(e.message, "err"); }
    setBusy(null);
  }, [reload, inv, toast]);

  const onScan = useCallback(async (text: string) => {
    try {
      const p = await api<Participant>("/lookup/token", { method: "POST", body: { token: text } });
      if (!p.items?.length) toast(`${p.name} has no kit`, "err");
      else if (p.hat_state === "returned") toast(`${p.name}: everything already returned`, "err");
      else await act(p.id, "return", undefined, p.name);
    } catch (e: any) { toast(e.message, "err"); }
  }, [act, toast]);

  if (!eventId) return <Empty>Select an event first.</Empty>;
  const items = inv.data || [];
  return (
    <div>
      <PageHeader title="Kit & returns" subtitle="Hat, shawl... issued at check-in. Track stock and what comes back." actions={<Button variant={scan ? "secondary" : "primary"} size="sm" onClick={() => setScan(!scan)}><ScanLine className="h-4 w-4" /> {scan ? "Close scanner" : "Scan to return"}</Button>} />
      {scan && <Card className="mx-auto mb-4 max-w-md p-4"><Scanner onScan={onScan} /></Card>}

      {items.length > 0 && (
        <Card className="mb-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-4 py-2.5">Item</th><th className="px-2 text-right">Stock</th><th className="px-2 text-right">Needed</th><th className="px-2 text-right">Given</th>
              <th className="px-2 text-right">Returned</th><th className="px-2 text-right">With people</th><th className="px-2 text-right">Lost</th><th className="px-4 text-right">In store</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-2.5 font-medium">{i.name}{i.short > 0 && <Badge tone="red"> short by {i.short}</Badge>}</td>
                  <td className="px-2 text-right">{i.quantity}</td><td className="px-2 text-right">{i.needed}</td><td className="px-2 text-right">{i.given}</td>
                  <td className="px-2 text-right text-emerald-700">{i.returned}</td><td className="px-2 text-right text-amber-700">{i.out}</td><td className="px-2 text-right text-rose-600">{i.lost}</td>
                  <td className={cx("px-4 text-right font-semibold", i.available < 0 ? "text-rose-600" : "")}>{i.available}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">In store = stock − with people − lost. Needed = approved registrations whose category gets this item.</p>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("rounded-lg px-3 py-2 text-sm font-medium", tab === k ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{label}</button>
        ))}
        <select className={inputCls + " w-40"} value={item} onChange={(e) => setItem(e.target.value)}><option value="">All items</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <input className={inputCls + " ml-auto w-56"} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : !data?.rows.length ? <Empty>{tab === "issued" ? "Nothing pending return." : "Nothing here."}</Empty> : (
        <div className="space-y-2">
          {data.rows.map((p) => {
            const mine = (p.items || []).filter((i) => !item || String(i.item_id) === item);
            return (
              <Card key={p.id} className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /><span className="font-medium">{p.name}</span>{p.seat && <Badge tone="green">{p.seat}</Badge>}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">{fmtPhone(p.phone)}{p.category && <CategoryChip name={p.category.name} color={p.category.color} />}</div>
                  </div>
                  {p.hat_state === "issued" && !item && <Button size="sm" variant="success" loading={busy === `${p.id}-all-return`} onClick={() => act(p.id, "return", undefined, p.name)}>Return all</Button>}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {mine.map((i) => (
                    <span key={i.item_id} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-sm ring-1 ring-slate-200">
                      {i.name}
                      {i.state === "issued" && <><Button size="sm" variant="success" loading={busy === `${p.id}-${i.item_id}-return`} onClick={() => act(p.id, "return", i.item_id, `${p.name} · ${i.name}`)}>Returned</Button><Button size="sm" variant="secondary" disabled={!!busy} onClick={() => act(p.id, "lost", i.item_id)}>Lost</Button></>}
                      {i.state === "lost" && <><Badge tone="red">lost</Badge><Button size="sm" variant="success" onClick={() => act(p.id, "return", i.item_id, `${p.name} · ${i.name}`)}>Found</Button></>}
                      {i.state === "returned" && <Badge tone="green">returned</Badge>}
                    </span>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
