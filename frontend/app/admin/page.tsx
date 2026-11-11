"use client";
import Link from "next/link";
import { AlertTriangle, Armchair, Crown, MessageCircle, UserCheck, Users } from "lucide-react";
import { useEvent } from "@/components/EventContext";
import { useFetch } from "@/lib/api";
import { Badge, Card, CategoryChip, Empty, ErrorBox, PageHeader, Spinner, fmtTime } from "@/components/ui";

function Stat({ label, value, sub, tone = "slate", icon: Icon, href }: { label: string; value: number | string; sub?: string; tone?: string; icon: any; href?: string }) {
  const body = (
    <Card className="p-4 transition hover:shadow-md">
      <div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><Icon className={`h-4 w-4 ${tone === "red" ? "text-rose-500" : tone === "green" ? "text-emerald-500" : "text-brand-500"}`} /></div>
      <div className="mt-1 text-3xl font-bold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return <div className="h-2 w-full rounded-full bg-slate-100"><div className="h-2 rounded-full transition-all" style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%`, background: color }} /></div>;
}

export default function Dashboard() {
  const { eventId, me } = useEvent();
  const { data: d, error, loading, reload } = useFetch<any>(eventId ? "/dashboard" : null, { event_id: eventId }, 5000);
  if (!eventId) return <Empty>No event yet. {me?.manager ? <Link href="/admin/event" className="text-brand-600 underline">Create the event</Link> : "Ask an admin to create one."}</Empty>;
  if (loading && !d) return <Spinner />;
  if (error && !d) return <ErrorBox message={error} onRetry={reload} />;
  if (!d) return null;
  const s = d.students, t = d.teachers;
  const pending = s.pending + t.pending;
  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`${d.event.name} · ${d.event.date}${d.event.venue ? " · " + d.event.venue : ""} · live`} />
      {pending > 0 && me?.manager && (
        <Link href="/admin/review" className="mb-4 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          <AlertTriangle className="h-5 w-5" /> {pending} registration{pending > 1 ? "s" : ""} need your review (name or category not matching the winners list)
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Students registered" value={s.registered} sub={`${s.approved} approved`} icon={Users} href="/admin/participants?kind=student" />
        <Stat label="Students checked in" value={s.checked_in} sub={`${s.not_arrived} yet to arrive`} icon={UserCheck} tone="green" />
        <Stat label="Teachers registered" value={t.registered} sub={`${t.approved} approved`} icon={Users} href="/admin/participants?kind=teacher" />
        <Stat label="Teachers checked in" value={t.checked_in} sub={`${t.not_arrived} yet to arrive`} icon={UserCheck} tone="green" />
      </div>
      {d.extras && (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Teachers · Veg" value={d.extras.veg} icon={Users} />
          <Stat label="Teachers · Non-veg" value={d.extras.nonveg} icon={Users} />
          <Stat label="Students' guests (friends / guardians)" value={d.extras.guests} icon={Users} />
          <Stat label="Teachers' guests" value={d.extras.teacher_guests ?? 0} icon={Users} />
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Kit pending return" value={d.hats.issued} sub={`${d.hats.returned} returned · ${d.hats.lost} lost`} icon={Crown} href="/admin/hats" />
        <Stat label="Needs review" value={pending} icon={AlertTriangle} tone={pending ? "red" : "slate"} href="/admin/review" />
        <Stat label="WhatsApp sent" value={d.whatsapp.sent} sub={`${d.whatsapp.queued} queued · ${d.whatsapp.failed} failed`} icon={MessageCircle} href="/admin/whatsapp" tone={d.whatsapp.failed ? "red" : "slate"} />
        <Stat label="Winners list" value={`${d.expected.registered}/${d.expected.total}`} sub={`${d.expected.missing} not registered yet`} icon={Users} href="/admin/winners" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 font-semibold">By category</h3>
          {d.categories.length === 0 ? <p className="text-sm text-slate-500">No categories yet.</p> : (
            <div className="space-y-4">
              {d.categories.map((c: any) => (
                <div key={c.id}>
                  <div className="mb-1 flex items-center justify-between text-sm"><CategoryChip name={c.name} color={c.color} /><span className="text-slate-600">{c.checked_in} / {c.registered} arrived{c.hat ? " · kit" : ""}</span></div>
                  <Bar value={c.checked_in} max={c.registered} color={c.color} />
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Armchair className="h-4 w-4" /> Seats</h3>
          {d.blocks.length === 0 ? <p className="text-sm text-slate-500">No seat blocks yet.</p> : (
            <div className="space-y-4">
              {d.blocks.map((b: any) => (
                <div key={b.id}>
                  <div className="mb-1 flex items-center justify-between text-sm"><span className="font-medium">{b.name} <span className="text-slate-400">{b.prefix}{b.start_no}–{b.prefix}{b.end_no}</span></span><span className="text-slate-600">{b.occupied} filled · {b.free} free</span></div>
                  <Bar value={b.occupied} max={b.total} color="#4f46e5" />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <Card className="mt-5 p-5">
        <h3 className="mb-3 font-semibold">Recent check-ins</h3>
        {d.recent.length === 0 ? <p className="text-sm text-slate-500">Nobody has checked in yet.</p> : (
          <div className="divide-y divide-slate-100">
            {d.recent.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{p.name}</div><div className="text-xs text-slate-500">{fmtTime(p.checkin_on)}</div></div>
                <div className="flex items-center gap-2">{p.category && <CategoryChip name={p.category.name} color={p.category.color} />}<Badge tone="green">{p.seat}</Badge></div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
