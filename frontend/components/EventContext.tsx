"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { EventInfo } from "@/lib/types";

type Me = { id: number; name: string; manager: boolean; staff: boolean; marketing: boolean; viewer: boolean };
type Ctx = { me: Me | null; events: EventInfo[]; event: EventInfo | null; eventId: number | null; setEventId: (id: number) => void; reloadEvents: () => Promise<void> };
const C = createContext<Ctx>({ me: null, events: [], event: null, eventId: null, setEventId: () => {}, reloadEvents: async () => {} });
export const useEvent = () => useContext(C);

export function EventProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [eventId, setId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const reloadEvents = async () => {
    const list = await api<EventInfo[]>("/events");
    setEvents(list);
    let saved: number | null = null;
    try { saved = Number(localStorage.getItem("wm_event")) || null; } catch {}
    setId((cur) => {
      const want = cur ?? saved;
      if (want && list.some((e) => e.id === want)) return want;
      return (list.find((e) => e.state === "open") || list[0])?.id ?? null;
    });
  };
  useEffect(() => {
    (async () => {
      try {
        const m = await api<Me>("/me");
        setMe(m);
        if (m.staff) await reloadEvents();
      } catch {}
      setReady(true);
    })();
  }, []);
  const setEventId = (id: number) => {
    setId(id);
    try { localStorage.setItem("wm_event", String(id)); } catch {}
  };
  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading…</div>;
  return <C.Provider value={{ me, events, event: events.find((e) => e.id === eventId) || null, eventId, setEventId, reloadEvents }}>{children}</C.Provider>;
}
