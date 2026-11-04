"use client";
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Crown, ScanLine } from "lucide-react";
import { useEvent } from "@/components/EventContext";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, Card, CategoryChip, Empty, ErrorBox, PageHeader, Spinner, cx, fmtPhone, fmtTime, inputCls, useToast } from "@/components/ui";
import type { Participant } from "@/lib/types";

const Scanner = dynamic(() => import("@/components/Scanner"), { ssr: false });
const TABS = [["issued", "Pending return"], ["returned", "Returned"], ["lost", "Lost"]] as const;

export default function Hats() {
  const { eventId } = useEvent();
  const toast = useToast();
  const [tab, setTab] = useState<"issued" | "returned" | "lost">("issued");
  const [q, setQ] = useState("");
  const [scan, setScan] = useState(false);
  const { data, error, loading, reload } = useFetch<{ total: number; rows: Participant[] }>(eventId ? "/participants" : null, { event_id: eventId, hat: tab, q, limit: 200 }, 8000);
  const { data: dash } = useFetch<any>(eventId ? "/dashboard" : null, { event_id: eventId }, 8000);
  const [busy, setBusy] = useState<number | null>(null);

  const hat = useCallback(async (id: number, action: string, name?: string) => {
    setBusy(id);
    try { await api(`/participants/${id}/hat`, { method: "POST", body: { action } }); toast(action === "return" ? `Hat returned${name ? " · " + name : ""}` : "Updated"); reload(); }
    catch (e: any) { toast(e.message, "err"); }
    setBusy(null);
  }, [reload, toast]);

  const onScan = useCallback(async (text: string) => {
    try {
      const p = await api<Participant>("/lookup/token", { method: "POST", body: { token: text } });
      if (p.hat_state === "none") toast(`${p.name} has no hat`, "err");
      else if (p.hat_state === "returned") toast(`${p.name}: hat already returned`, "err");
      else await hat(p.id, "return", p.name);
    } catch (e: any) { toast(e.message, "err"); }
  }, [hat, toast]);

  if (!eventId) return <Empty>Select an event first.</Empty>;
  const h = dash?.hats || { issued: 0, returned: 0, lost: 0 };
  const count = (k: string) => (h as any)[k] ?? 0;
  return (
    <div>
      <PageHeader title="Hats" subtitle="Hats are issued at check-in for hat categories. Scan the pass to return." actions={<Button variant={scan ? "secondary" : "primary"} size="sm" onClick={() => setScan(!scan)}><ScanLine className="h-4 w-4" /> {scan ? "Close scanner" : "Scan to return"}</Button>} />
      {scan && <Card className="mx-auto mb-4 max-w-md p-4"><Scanner onScan={onScan} /></Card>}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("rounded-lg px-3 py-2 text-sm font-medium", tab === k ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{label} <span className="opacity-70">({count(k)})</span></button>
        ))}
        <input className={inputCls + " ml-auto w-56"} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : !data?.rows.length ? <Empty>{tab === "issued" ? "No hats pending return." : "Nothing here."}</Empty> : (
        <div className="space-y-2">
          {data.rows.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /><span className="font-medium">{p.name}</span>{p.seat && <Badge tone="green">{p.seat}</Badge>}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">{fmtPhone(p.phone)}{p.category && <CategoryChip name={p.category.name} color={p.category.color} />}</div>
              </div>
              <div className="flex gap-2">
                {p.hat_state === "issued" && <><Button size="sm" variant="success" loading={busy === p.id} onClick={() => hat(p.id, "return", p.name)}>Returned</Button><Button size="sm" variant="secondary" disabled={busy === p.id} onClick={() => hat(p.id, "lost")}>Mark lost</Button></>}
                {p.hat_state === "lost" && <Button size="sm" variant="success" loading={busy === p.id} onClick={() => hat(p.id, "return", p.name)}>Found / returned</Button>}
                {p.hat_state === "returned" && <Badge tone="green">Returned</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
