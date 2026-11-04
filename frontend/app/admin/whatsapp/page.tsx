"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEvent } from "@/components/EventContext";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, cx, fmtPhone, fmtTime, useToast } from "@/components/ui";

export default function Whatsapp() {
  const { eventId } = useEvent();
  const toast = useToast();
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useFetch<any[]>(eventId ? "/whatsapp/logs" : null, { event_id: eventId, state }, 6000);
  const retry = async (ids?: number[]) => {
    setBusy(true);
    try { const r = await api<any>("/whatsapp/retry", { method: "POST", body: { event_id: eventId, ids } }); toast(`${r.requeued} message${r.requeued === 1 ? "" : "s"} queued again`); reload(); }
    catch (e: any) { toast(e.message, "err"); }
    setBusy(false);
  };
  const tone = (s: string) => (s === "sent" ? "green" : s === "failed" ? "red" : s === "queued" ? "blue" : "amber");
  return (
    <div>
      <PageHeader title="WhatsApp log" subtitle="Confirmation and seat messages. Failed messages are retried automatically 3 times." actions={<Button size="sm" variant="secondary" loading={busy} onClick={() => retry()}><RefreshCw className="h-4 w-4" /> Retry all failed</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {[["", "All"], ["queued", "Queued"], ["sent", "Sent"], ["failed", "Failed"], ["skipped", "Skipped"]].map(([k, l]) => (
          <button key={k} onClick={() => setState(k)} className={cx("rounded-lg px-3 py-1.5 text-sm font-medium", state === k ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{l}</button>
        ))}
      </div>
      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : !data?.length ? <Empty>No messages.</Empty> : (
        <Card className="divide-y divide-slate-100">
          {data.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <Link href={`/admin/participants/${l.participant_id}`} className="font-medium hover:text-brand-600">{l.participant}</Link>
                <div className="text-xs text-slate-500">{l.type === "confirm" ? "Confirmation" : "Seat"} · {fmtPhone(l.number)} · {fmtTime(l.created)}</div>
                {l.state === "failed" && l.error && <div className="mt-1 max-w-xl text-xs text-rose-600">{l.error}</div>}
              </div>
              <div className="flex items-center gap-2"><Badge tone={tone(l.state) as any}>{l.state}</Badge>{(l.state === "failed" || l.state === "skipped") && <Button size="sm" variant="secondary" onClick={() => retry([l.id])}>Retry</Button>}</div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
