"use client";
import { useState } from "react";
import { Download, Image as ImageIcon, Search } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorBox, Modal, PageHeader, Spinner, inputCls, cx } from "@/components/ui";
import { api, useFetch } from "@/lib/api";

type T = { id: number; name: string; phone: string; institution: string; place: string; email: string; category: string; approval_state: string; food_pref: string; instagram: string; accompany_type: string; accompany_count: number; contact: string; bio: string; has_photo: boolean; profile_name: string };
const COMP: Record<string, string> = { friend: "friends", guardian: "parents", guest: "persons" };
const save = (href: string, name: string) => { const a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "_") || "teacher";

export default function Teachers() {
  const { data: events } = useFetch<{ id: number; name: string }[]>("/teachers/events");
  const [eid, setEid] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const event_id = eid || events?.[0]?.id;
  const { data, error, loading, reload } = useFetch<{ total: number; rows: T[]; with_photo: number }>(event_id ? "/teachers" : null, { event_id, q, limit });
  const [sel, setSel] = useState<T | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const photo = async (t: T) => { const r = await api<{ data: string }>(`/teachers/${t.id}/photo`); save("data:image/jpeg;base64," + r.data, safe(t.name) + ".jpg"); };
  const one = async (t: T) => { setBusy("p" + t.id); setMsg(""); try { await photo(t); } catch (e: any) { setMsg(e.message); } setBusy(""); };
  const doc = async (t: T) => {
    setBusy("d" + t.id); setMsg("");
    try {
      const f = await api<{ name: string; mime: string; data: string }>(`/teachers/${t.id}/profile`);
      const bin = atob(f.data); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([buf], { type: f.mime })); save(url, f.name); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) { setMsg(e.message); }
    setBusy("");
  };
  const all = async () => {
    if (!data) return;
    const list = data.rows.filter((t) => t.has_photo);
    setBusy("all"); setMsg("");
    try { for (let i = 0; i < list.length; i++) { setMsg(`Downloading ${i + 1} / ${list.length}…`); await photo(list[i]); await new Promise((r) => setTimeout(r, 400)); } setMsg(`${list.length} photos downloaded.`); } catch (e: any) { setMsg(e.message); }
    setBusy("");
  };

  return (
    <div>
      <PageHeader title="Teachers data" subtitle="View teachers' details and download pictures (read only)"
        actions={<Button size="sm" variant="secondary" loading={busy === "all"} onClick={all}><ImageIcon className="h-4 w-4" /> Download all photos{data ? ` (${data.rows.filter((t) => t.has_photo).length})` : ""}</Button>} />
      <Card className="mb-3 flex flex-wrap gap-2 p-3">
        {events && events.length > 1 && <select className={cx(inputCls, "w-auto")} value={event_id || ""} onChange={(e) => setEid(e.target.value)}>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}
        <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={cx(inputCls, "pl-9")} placeholder="Search name, phone, college, place…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(50); }} /></div>
      </Card>
      {msg && <p className="mb-2 text-sm text-slate-600">{msg}</p>}
      {error && !data ? <ErrorBox message={error} onRetry={reload} /> : !data ? <Spinner /> : data.rows.length === 0 ? <Empty>No teachers found.</Empty> : (
        <>
          <p className="mb-2 text-sm text-slate-500">{data.total} teachers · {data.with_photo} with photo</p>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">College</th><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5">Companions</th><th className="px-4 py-2.5">Point of contact</th><th className="px-4 py-2.5">Photo</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSel(t)}>
                    <td className="px-4 py-2.5"><div className="font-medium">{t.name}</div><div className="text-xs text-slate-500">{t.phone}</div></td>
                    <td className="px-4 py-2.5">{t.institution || "—"}{t.place && <div className="text-xs text-slate-500">{t.place}</div>}</td>
                    <td className="px-4 py-2.5">{t.category || "—"}</td>
                    <td className="px-4 py-2.5">{t.accompany_count > 0 ? `${t.accompany_count} ${COMP[t.accompany_type] || ""}` : "—"}</td>
                    <td className="px-4 py-2.5">{t.contact || "—"}</td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>{t.has_photo ? <Button size="sm" variant="secondary" loading={busy === "p" + t.id} onClick={() => one(t)}><Download className="h-4 w-4" /></Button> : <span className="text-slate-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-2 md:hidden">
            {data.rows.map((t) => (
              <div key={t.id} onClick={() => setSel(t)}><Card className="cursor-pointer p-3">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-slate-500">{t.phone}{t.institution ? ` · ${t.institution}` : ""}</div>
                {t.accompany_count > 0 && <Badge tone="blue">+{t.accompany_count} {COMP[t.accompany_type]}</Badge>}
              </Card></div>
            ))}
          </div>
          {data.total > data.rows.length && <Button variant="secondary" className="mt-3 w-full" onClick={() => setLimit(limit + 50)}>Show more ({data.total - data.rows.length} left)</Button>}
        </>
      )}
      {sel && <Detail t={sel} busy={busy} onPhoto={() => one(sel)} onDoc={() => doc(sel)} onClose={() => setSel(null)} />}
    </div>
  );
}

function Detail({ t, busy, onPhoto, onDoc, onClose }: { t: T; busy: string; onPhoto: () => void; onDoc: () => void; onClose: () => void }) {
  const row = (k: string, v: string) => v ? <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5 text-sm"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div> : null;
  return (
    <Modal open onClose={onClose} title={t.name}>
      <dl>
        {row("Phone", t.phone)}{row("Email", t.email)}{row("College", t.institution)}{row("Place", t.place)}{row("Category", t.category)}
        {row("Food", t.food_pref === "veg" ? "Veg" : t.food_pref === "nonveg" ? "Non-veg" : "")}
        {row("Accompanying persons", t.accompany_count > 0 ? String(t.accompany_count) : "")}{row("Point of contact", t.contact)}{row("Instagram", t.instagram ? "@" + t.instagram : "")}
      </dl>
      {t.bio && <div className="mt-3"><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Short profile</div><p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700">{t.bio}</p></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        {t.has_photo && <Button loading={busy === "p" + t.id} onClick={onPhoto}><Download className="h-4 w-4" /> Download photo</Button>}
        {t.profile_name && <Button variant="secondary" loading={busy === "d" + t.id} onClick={onDoc}><Download className="h-4 w-4" /> Profile document</Button>}
        {!t.has_photo && !t.profile_name && <span className="text-sm text-slate-500">No photo or document uploaded.</span>}
      </div>
    </Modal>
  );
}
