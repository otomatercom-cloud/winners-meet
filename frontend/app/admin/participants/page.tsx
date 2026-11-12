"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Search, UserPlus } from "lucide-react";
import * as XLSX from "xlsx";
import { useEvent } from "@/components/EventContext";
import WalkIn from "@/components/WalkIn";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, Card, CategoryChip, Empty, ErrorBox, PageHeader, Spinner, approvalBadge, fmtPhone, hatBadge, inputCls, useToast, waBadge } from "@/components/ui";
import type { Category, Participant } from "@/lib/types";

const PAGE = 50;

function Inner() {
  const { eventId } = useEvent();
  const sp = useSearchParams();
  const toast = useToast();
  const [kind, setKind] = useState(sp.get("kind") || "");
  const [state, setState] = useState("");
  const [approval, setApproval] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [page, setPage] = useState(0);
  const [walk, setWalk] = useState(false);
  useEffect(() => { const t = setTimeout(() => { setQd(q); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  const params = { event_id: eventId, kind, state, approval, category_id: category, q: qd, offset: page * PAGE, limit: PAGE };
  const { data, error, loading, reload } = useFetch<{ total: number; rows: Participant[] }>(eventId ? "/participants" : null, params, 10000);
  const { data: cats } = useFetch<Category[]>(eventId ? "/categories" : null, { event_id: eventId });

  const exportXlsx = async () => {
    try {
      let all: Participant[] = [];
      for (let off = 0; ; off += 200) {
        const r = await api<{ total: number; rows: Participant[] }>("/participants", { params: { ...params, offset: off, limit: 200 } });
        all = all.concat(r.rows);
        if (all.length >= r.total || r.rows.length === 0) break;
      }
      const rows = all.map((p) => ({
        Name: p.name, Phone: p.phone, Type: p.kind, Category: p.category?.name || "", Place: p.place, Institution: p.institution,
        Approval: p.approval_state, "Checked in": p.state === "checked_in" ? "Yes" : "No", Seat: p.seat, Hat: p.hat_state, "Point of contact": p.contact, "Short profile": p.bio, Instagram: p.instagram ? "@" + p.instagram : "", Food: p.food_pref, "Coming with": p.accompany_type === "none" ? "" : p.accompany_type, "Guests": p.accompany_count || "", WhatsApp: p.wa_state,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Participants");
      XLSX.writeFile(wb, "winners-meet-participants.xlsx");
    } catch (e: any) { toast(e.message, "err"); }
  };

  const sel = "h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm";
  const total = data?.total || 0;
  return (
    <div>
      <PageHeader title="Participants" subtitle={`${total} ${total === 1 ? "person" : "people"}`}
        actions={<><Button variant="secondary" size="sm" onClick={exportXlsx}><Download className="h-4 w-4" /> Export</Button><Button size="sm" onClick={() => setWalk(true)}><UserPlus className="h-4 w-4" /> Add</Button></>} />
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={inputCls + " pl-9"} placeholder="Search name, phone, seat…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className={sel} value={kind} onChange={(e) => { setKind(e.target.value); setPage(0); }}><option value="">Students + teachers</option><option value="student">Students</option><option value="teacher">Teachers</option></select>
          <select className={sel} value={category} onChange={(e) => { setCategory(e.target.value); setPage(0); }}><option value="">All categories</option>{(cats || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select className={sel} value={state} onChange={(e) => { setState(e.target.value); setPage(0); }}><option value="">All arrival</option><option value="checked_in">Checked in</option><option value="registered">Not arrived</option></select>
          <select className={sel} value={approval} onChange={(e) => { setApproval(e.target.value); setPage(0); }}><option value="">All approval</option><option value="approved">Approved</option><option value="pending">Needs review</option><option value="rejected">Rejected</option></select>
        </div>
      </Card>
      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : !data?.rows.length ? <Empty>No participants found.</Empty> : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">College</th><th className="px-4 py-2.5">Companions</th><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Seat</th><th className="px-4 py-2.5">Hat</th><th className="px-4 py-2.5">WhatsApp</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((p) => (
                  <tr key={p.id} className={`hover:bg-slate-50 ${p.approval_state === "pending" ? "bg-rose-50/60" : ""}`}>
                    <td className="px-4 py-2.5"><Link href={`/admin/participants/${p.id}`} className="font-medium text-slate-900 hover:text-brand-600">{p.name}</Link><div className="text-xs text-slate-500">{fmtPhone(p.phone)} · {p.kind}</div></td>
                    <td className="px-4 py-2.5 text-slate-700">{p.institution || <span className="text-slate-400">—</span>}{p.place && <div className="text-xs text-slate-500">{p.place}</div>}</td>
                    <td className="px-4 py-2.5">{p.accompany_count > 0 ? <span className="font-semibold">{p.accompany_count}<span className="ml-1 text-xs font-normal text-slate-500">{COMP[p.accompany_type]}</span></span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-2.5">{p.category && <CategoryChip name={p.category.name} color={p.category.color} />}</td>
                    <td className="px-4 py-2.5"><div className="flex gap-1.5">{approvalBadge(p.approval_state)}{p.state === "checked_in" && <Badge tone="blue">Arrived</Badge>}</div></td>
                    <td className="px-4 py-2.5 font-semibold">{p.seat || <span className="font-normal text-slate-400">—</span>}</td>
                    <td className="px-4 py-2.5">{hatBadge(p.hat_state)}</td>
                    <td className="px-4 py-2.5">{waBadge(p.wa_state)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-2 md:hidden">
            {data.rows.map((p) => (
              <Link key={p.id} href={`/admin/participants/${p.id}`} className={`block rounded-xl border p-3 shadow-sm ${p.approval_state === "pending" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{p.name}</span>{p.seat ? <Badge tone="green">{p.seat}</Badge> : approvalBadge(p.approval_state)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{fmtPhone(p.phone)}{p.institution && <span>· {p.institution}</span>}{p.accompany_count > 0 && <Badge tone="blue">+{p.accompany_count} {COMP[p.accompany_type]}</Badge>}{p.category && <CategoryChip name={p.category.name} color={p.category.color} />}{hatBadge(p.hat_state)}</div>
              </Link>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <span>{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}</span>
            <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next</Button></div>
          </div>
        </>
      )}
      {eventId && <WalkIn open={walk} onClose={() => setWalk(false)} eventId={eventId} onDone={() => reload()} />}
    </div>
  );
}

const COMP: Record<string, string> = { none: "", friend: "friends", guardian: "parents", guest: "guests" };

export default function Participants() {
  return <Suspense fallback={<Spinner />}><Inner /></Suspense>;
}
