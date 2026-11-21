"use client";
import { useParams } from "next/navigation";
import { CheckSquare, Square } from "lucide-react";
import { useFetch } from "@/lib/api";
import { Card, Spinner } from "@/components/ui";

type Item = { id: number; name: string; qty: string; section: string; done: boolean };

/** Public, read-only list of what to take to the event. Refreshes itself; nothing here can be edited. */
export default function PublicChecklist() {
  const { token } = useParams<{ token: string }>();
  const { data, error, loading } = useFetch<any>(`/public/checklist/${token}`, undefined, 15000);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <main className="grid min-h-screen place-items-center px-4 text-center text-slate-600">This checklist link is not valid.</main>;
  const groups: Record<string, Item[]> = {};
  (data.items as Item[]).forEach((i) => { (groups[i.section || "General"] ||= []).push(i); });
  const p = data.progress;
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-6">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wider text-slate-500">Event checklist</div>
        <h1 className="text-xl font-bold leading-tight">{data.event.name}</h1>
        <div className="text-sm text-slate-500">{[data.event.date, data.event.venue].filter(Boolean).join(" · ")}</div>
      </div>
      <Card className="mb-4 p-4">
        <div className="flex justify-between text-sm font-medium"><span>{p.done} of {p.total} taken</span><span>{p.percent}%</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${p.percent}%` }} /></div>
      </Card>
      {Object.entries(groups).map(([sec, items]) => (
        <Card key={sec} className="mb-3 overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">{sec}</div>
          <ul className="divide-y divide-slate-100">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                {i.done ? <CheckSquare className="h-5 w-5 shrink-0 text-emerald-600" /> : <Square className="h-5 w-5 shrink-0 text-slate-300" />}
                <span className={i.done ? "text-slate-400 line-through" : ""}>{i.name}</span>
                {i.qty && <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{i.qty}</span>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {!data.items.length && <p className="text-center text-slate-500">No items yet.</p>}
    </main>
  );
}
