"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { useEvent } from "@/components/EventContext";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, Card, CategoryChip, Empty, ErrorBox, PageHeader, Spinner, fmtPhone, inputCls, useToast } from "@/components/ui";
import type { Category, Participant } from "@/lib/types";

const REASON: Record<string, string> = { not_listed: "Not in winners list", name_mismatch: "Name does not match", category_mismatch: "Category does not match", na: "Needs review" };

export default function Review() {
  const { eventId, me } = useEvent();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<{ total: number; rows: Participant[] }>(eventId ? "/participants" : null, { event_id: eventId, approval: "pending", limit: 200 }, 10000);
  const { data: cats } = useFetch<Category[]>(eventId ? "/categories" : null, { event_id: eventId });
  const [pick, setPick] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  if (!me?.manager) return <Empty>Only administrators can review registrations.</Empty>;
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;

  const act = async (p: Participant, kind: "approve" | "reject") => {
    setBusy(p.id);
    try {
      await api(`/participants/${p.id}/${kind}`, { method: "POST", body: kind === "approve" ? { category_id: pick[p.id] || p.category?.id } : {} });
      toast(kind === "approve" ? `${p.name} approved · WhatsApp queued` : `${p.name} rejected`);
      reload();
    } catch (e: any) { toast(e.message, "err"); }
    setBusy(null);
  };
  const rows = data?.rows || [];
  return (
    <div>
      <PageHeader title="Review queue" subtitle="Registrations that do not match the uploaded winners list. Cross-check and approve." />
      {rows.length === 0 ? <Empty>All clear — nothing to review.</Empty> : (
        <div className="space-y-3">
          {rows.map((p) => {
            const sameKind = (cats || []).filter((c) => c.kind === p.kind);
            return (
              <Card key={p.id} className="border-l-4 border-l-rose-500 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="text-lg font-semibold">{p.name}</span><Badge tone="red">{REASON[p.match_status]}</Badge></div>
                    <div className="text-sm text-slate-500">{fmtPhone(p.phone)}{p.place ? ` · ${p.place}` : ""}{p.institution ? ` · ${p.institution}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">Chose: {p.claimed_category ? <CategoryChip name={p.claimed_category.name} color={p.claimed_category.color} /> : "—"}</div>
                </div>
                <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{p.match_note || "No winners list entry for this phone number."}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select className={inputCls + " w-48"} value={pick[p.id] ?? p.category?.id ?? ""} onChange={(e) => setPick({ ...pick, [p.id]: e.target.value })}>
                    {sameKind.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Button variant="success" loading={busy === p.id} onClick={() => act(p, "approve")}><Check className="h-4 w-4" /> Approve</Button>
                  <Button variant="secondary" disabled={busy === p.id} onClick={() => act(p, "reject")}><X className="h-4 w-4" /> Reject</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
