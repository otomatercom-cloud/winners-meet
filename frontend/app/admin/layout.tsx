"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart3, Armchair, Crown, FileSpreadsheet, LogOut, Menu, MessageCircle, ScanLine, Settings2, ShieldAlert, Users, X, CalendarDays } from "lucide-react";
import { EventProvider, useEvent } from "@/components/EventContext";
import { Badge, cx } from "@/components/ui";
import { useFetch } from "@/lib/api";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: BarChart3 },
  { href: "/admin/checkin", label: "Check-in", icon: ScanLine },
  { href: "/admin/participants", label: "Participants", icon: Users },
  { href: "/admin/review", label: "Review queue", icon: ShieldAlert, badge: true, manager: true },
  { href: "/admin/seats", label: "Seat map", icon: Armchair },
  { href: "/admin/hats", label: "Hats", icon: Crown },
  { href: "/admin/winners", label: "Winners list", icon: FileSpreadsheet, manager: true },
  { href: "/admin/whatsapp", label: "WhatsApp log", icon: MessageCircle },
  { href: "/admin/setup", label: "Categories & seats", icon: Settings2, manager: true },
  { href: "/admin/event", label: "Event settings", icon: CalendarDays, manager: true },
];

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { me, events, event, eventId, setEventId } = useEvent();
  const [open, setOpen] = useState(false);
  const { data: pend } = useFetch<any>(eventId ? "/participants" : null, { event_id: eventId, approval: "pending", limit: 1 }, 15000);
  if (!me) { if (typeof window !== "undefined") router.replace("/login"); return null; }
  const items = NAV.filter((n) => !n.manager || me.manager);
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); };
  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-auto p-3">
      {items.map((n) => {
        const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={cx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition", active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100")}>
            <n.icon className="h-[18px] w-[18px]" />
            <span className="flex-1">{n.label}</span>
            {n.badge && pend?.total ? <Badge tone="red">{pend.total}</Badge> : null}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex lg:sticky lg:top-0 lg:h-screen">
        <div className="border-b border-slate-100 p-4"><div className="text-base font-bold">Winners Meet</div><div className="truncate text-xs text-slate-500">{event?.name || "No event"}</div></div>
        {nav}
        <div className="border-t border-slate-100 p-3">
          <div className="mb-2 truncate px-1 text-xs text-slate-500">{me.name} · {me.manager ? "Admin" : "Desk"}</div>
          <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur">
          <button className="rounded-lg p-1.5 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <select value={eventId ?? ""} onChange={(e) => setEventId(Number(e.target.value))} className="h-9 max-w-[60vw] rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium">
            {events.length === 0 && <option value="">No events yet</option>}
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {event && <Badge tone={event.state === "open" ? "green" : event.state === "draft" ? "amber" : "slate"}>{event.state}</Badge>}
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <div className="pop absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 p-4"><div className="font-bold">Winners Meet</div><button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
            {nav}
            <div className="border-t border-slate-100 p-3"><button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600"><LogOut className="h-4 w-4" /> Sign out</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <EventProvider><Shell>{children}</Shell></EventProvider>;
}
