"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Search, UserPlus } from "lucide-react";
import * as XLSX from "xlsx";
import { MarkTick } from "@/components/MarkTick";
import { Avatar, useThumbs } from "@/components/Avatar";
import { useEvent } from "@/components/EventContext";
import WalkIn from "@/components/WalkIn";
import SeatSet from "@/components/SeatSet";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, Card, CategoryChip, Empty, ErrorBox, PageHeader, Spinner, approvalBadge, fmtPhone, hatBadge, inputCls, useToast, waBadge } from "@/components/ui";
import type { Category, Participant } from "@/lib/types";

const PAGE = 50;

function Inner() {
  const { eventId, me } = useEvent();
  const sp = useSearchParams();
  const toast = useToast();
  const [kind, setKind] = useState(sp.get("kind") || "");
  const [state, setState] = useState("");
  const [approval, setApproval] = useState("");
  const [flag, setFlag] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const sortBy = (k: string) => { if (sort === k) { if (dir === "asc") setDir("desc"); else { setSort(""); setDir("asc"); } } else { setSort(k); setDir("asc"); } setPage(0); };
  const Th = ({ k, children, center }: { k: string; children: React.ReactNode; center?: boolean }) => (
    <th className={`px-4 py-2.5 ${center ? "text-center" : ""}`} aria-sort={sort === k ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => sortBy(k)} className={`inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-slate-800 ${sort === k ? "text-brand-700" : ""}`}>{children}<span className="text-[10px]">{sort === k ? (dir === "asc" ? "▲" : "▼") : "↕"}</span></button>
    </th>
  );
  const [walk, setWalk] = useState(false);
  useEffect(() => { const t = setTimeout(() => { setQd(q); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  const params = { event_id: eventId, kind, state, approval, category_id: category, flag, q: qd, sort, dir, offset: page * PAGE, limit: PAGE };
  const { data, error, loading, reload } = useFetch<{ total: number; rows: Participant[] }>(eventId ? "/participants" : null, params, 10000);
  const thumb = useThumbs("/participants/thumbs", (data?.rows || []).map((r) => r.id));
  const { data: cats } = useFetch<Category[]>(eventId ? "/categories" : null, { event_id: eventId });

  const exportTeachers = async () => {
    try {
      let all: Participant[] = [];
      for (let off = 0; ; off += 200) {
        const r = await api<{ total: number; rows: Participant[] }>("/participants", { params: { event_id: eventId, kind: "teacher", offset: off, limit: 200 } });
        all = all.concat(r.rows);
        if (all.length >= r.total || r.rows.length === 0) break;
      }
      all.sort((a, b) => a.name.localeCompare(b.name));
      const rows = all.map((p, i) => ({
        "S.No": i + 1, Name: p.name, Phone: p.phone, Email: (p as any).email || "", College: p.institution, Place: p.place, Category: p.category?.name || "",
        Approval: p.approval_state, "Point of contact": p.contact || "",
        "Accompanying persons": p.accompany_count || 0, "Companion type": p.accompany_type === "none" ? "" : p.accompany_type,
        Food: p.food_pref === "veg" ? "Veg" : p.food_pref === "nonveg" ? "Non-veg" : "", Instagram: p.instagram ? "@" + p.instagram : "",
        "Short profile": p.bio || "", "Profile document": p.profile_name || "", Photo: p.has_photo ? "Yes" : "No",
        "Checked in": p.state === "checked_in" ? "Yes" : "No", Seat: p.seat, Hat: p.hat_state, Trophy: p.trophy_state === "given" ? "Given" : "",
        "Coupon code": p.coupon_code || "", "Trophy sticker done": p.trophy_done ? "Yes" : "No", "Profile done": p.profile_done ? "Yes" : "No", WhatsApp: p.wa_state, Registered: p.create_date,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 5 }, { wch: 26 }, { wch: 15 }, { wch: 24 }, { wch: 30 }, { wch: 16 }, { wch: 18 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Teachers");
      XLSX.writeFile(wb, "winners-meet-teachers.xlsx");
    } catch (e: any) { toast(e.message, "err"); }
  };

  const genAllCoupons = async () => {
    if (!confirm("Create coupon codes for every teacher who has none yet? Existing codes will not change.")) return;
    try {
      const r = await api<{ created: number; teachers: number; sent_now: number }>("/coupons/generate-teachers", { method: "POST", body: { event_id: eventId } });
      toast(r.created ? `${r.created} coupon codes created (${r.teachers} teachers in total)${r.sent_now ? `, WhatsApp queued for ${r.sent_now} who already arrived` : ""}` : "All teachers already have a coupon code", "ok");
      reload();
    } catch (e: any) { toast(e.message, "err"); }
  };

  const exportCoupons = async () => {
    try {
      let all: Participant[] = [];
      for (let off = 0; ; off += 200) {
        const r = await api<{ total: number; rows: Participant[] }>("/participants", { params: { event_id: eventId, kind: "teacher", offset: off, limit: 200 } });
        all = all.concat(r.rows);
        if (all.length >= r.total || r.rows.length === 0) break;
      }
      const withCode = all.filter((p) => p.coupon_code).sort((a, b) => a.name.localeCompare(b.name));
      if (!withCode.length) { toast("No coupon codes yet. Create them first.", "err"); return; }
      const rows = withCode.map((p, i) => ({
        "S.No": i + 1, "Coupon code": p.coupon_code, Name: p.name, Phone: p.phone, College: p.institution, Place: p.place, Category: p.category?.name || "",
        "Point of contact": p.contact || "", "Checked in": p.state === "checked_in" ? "Yes" : "No", Seat: p.seat,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 5 }, { wch: 14 }, { wch: 28 }, { wch: 15 }, { wch: 34 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 8 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Coupon codes");
      XLSX.writeFile(wb, "winners-meet-teacher-coupons.xlsx");
      if (withCode.length < all.length) toast(`${all.length - withCode.length} teachers have no code yet and are not in the file`, "err");
    } catch (e: any) { toast(e.message, "err"); }
  };

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
        Approval: p.approval_state, "Checked in": p.state === "checked_in" ? "Yes" : "No", Seat: p.seat, Hat: p.hat_state, "Point of contact": p.contact, "Short profile": p.bio, Instagram: p.instagram ? "@" + p.instagram : "", Food: p.food_pref, "Coming with": p.accompany_type === "none" ? "" : p.accompany_type, "Guests": p.accompany_count || "", "Coupon code": p.coupon_code || "", "Trophy sticker done": p.trophy_done ? "Yes" : "No", "Profile done": p.profile_done ? "Yes" : "No", WhatsApp: p.wa_state,
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
        actions={<><Button variant="secondary" size="sm" onClick={genAllCoupons}>Create all teacher coupons</Button><Button variant="secondary" size="sm" onClick={exportCoupons}><Download className="h-4 w-4" /> Coupon codes (Excel)</Button><Button variant="secondary" size="sm" onClick={exportTeachers}><Download className="h-4 w-4" /> All teachers (Excel)</Button><Button variant="secondary" size="sm" onClick={exportXlsx}><Download className="h-4 w-4" /> Export</Button><Button size="sm" onClick={() => setWalk(true)}><UserPlus className="h-4 w-4" /> Add</Button></>} />
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={inputCls + " pl-9"} placeholder="Search name, phone, seat…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className={sel} value={kind} onChange={(e) => { setKind(e.target.value); setPage(0); }}><option value="">Students + teachers</option><option value="student">Students</option><option value="teacher">Teachers</option></select>
          <select className={sel} value={category} onChange={(e) => { setCategory(e.target.value); setPage(0); }}><option value="">All categories</option>{(cats || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select className={sel} value={state} onChange={(e) => { setState(e.target.value); setPage(0); }}><option value="">All arrival</option><option value="checked_in">Checked in</option><option value="registered">Not arrived</option></select>
          <select className={sel} value={approval} onChange={(e) => { setApproval(e.target.value); setPage(0); }}><option value="">All approval</option><option value="approved">Approved</option><option value="pending">Needs review</option><option value="rejected">Rejected</option></select>
          <select className={sel} value={flag} onChange={(e) => { setFlag(e.target.value); setPage(0); }}><option value="">All ticks</option><option value="trophy_done">Trophy sticker done ✓</option><option value="trophy_pending">Trophy sticker pending</option><option value="profile_done">Profile done ✓</option><option value="profile_pending">Profile pending</option></select>
        </div>
      </Card>
      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : !data?.rows.length ? <Empty>No participants found.</Empty> : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><Th k="name">Name</Th><Th k="college">College</Th><Th k="companions">Companions</Th><Th k="coupon">Coupon code</Th><Th k="trophy" center>Trophy sticker</Th><Th k="profile" center>Profile</Th><Th k="category">Category</Th><Th k="status">Status</Th><Th k="seat">Seat</Th><Th k="hat">Hat</Th><Th k="whatsapp">WhatsApp</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((p) => (
                  <tr key={p.id} className={`hover:bg-slate-50 ${p.approval_state === "pending" ? "bg-rose-50/60" : ""}`}>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-3"><Avatar src={thumb(p.id)} name={p.name} /><div><Link href={`/admin/participants/${p.id}`} className="font-medium text-slate-900 hover:text-brand-600">{p.name}</Link><div className="text-xs text-slate-500">{fmtPhone(p.phone)} · {p.kind}</div></div></div></td>
                    <td className="px-4 py-2.5 text-slate-700">{p.institution || <span className="text-slate-400">—</span>}{p.place && <div className="text-xs text-slate-500">{p.place}</div>}</td>
                    <td className="px-4 py-2.5">{p.accompany_count > 0 ? <span className="font-semibold">{p.accompany_count}<span className="ml-1 text-xs font-normal text-slate-500">{COMP[p.accompany_type]}</span></span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-2.5 font-mono text-xs tracking-wide">{p.coupon_code || <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}><div className="flex justify-center"><MarkTick base="/participants" id={p.id} field="trophy" value={p.trophy_done} label="Trophy sticker completed" /></div></td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}><div className="flex justify-center"><MarkTick base="/participants" id={p.id} field="profile" value={p.profile_done} label="Profile completed" /></div></td>
                    <td className="px-4 py-2.5">{p.category && <CategoryChip name={p.category.name} color={p.category.color} />}</td>
                    <td className="px-4 py-2.5"><div className="flex gap-1.5">{approvalBadge(p.approval_state)}{p.state === "checked_in" && <Badge tone="blue">Arrived</Badge>}</div></td>
                    <td className="px-4 py-2.5"><SeatSet p={p} eventId={eventId!} manager={!!me?.manager} onDone={reload} /></td>
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
                <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-medium"><Avatar src={thumb(p.id)} name={p.name} size={32} />{p.name}</span>{p.seat ? <Badge tone="green">{p.seat}</Badge> : approvalBadge(p.approval_state)}</div>
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
