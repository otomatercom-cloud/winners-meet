"use client";
import { useRef, useState } from "react";
import { Download, Plus, Trash2, Camera, CheckCircle2, Crosshair, MapPin, Phone, Search, Upload } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, inputCls, cx, useToast } from "@/components/ui";
import { useEvent } from "@/components/EventContext";
import { api, useFetch } from "@/lib/api";

type College = { id: number; name: string; district: string; type: string; phone: string; contact_person: string; visited: boolean; visit_count: number; last_visit: string; last_by: string; last_person: string; last_people: { name: string; designation: string; phone: string }[] };
type Visit = { id: number; date: string; by: string; person: string; designation: string; phone: string; notes: string; people: { name: string; designation: string; phone: string }[]; has_photo: boolean; lat: number | null; lng: number | null };

const shrink = (file: File, max = 1280): Promise<string> =>
  new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => rej(new Error("Could not read the photo."));
    img.src = url;
  });

const toB64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("Could not read file.")); r.readAsDataURL(f); });

export default function Colleges() {
  const { me } = useEvent();
  const [tab, setTab] = useState<"list" | "progress" | "admin">("list");
  const tabs = [["list", "Colleges"], ["progress", "Progress"], ...(me?.manager ? [["admin", "Upload & settings"]] : [])] as [string, string][];
  return (
    <div>
      <PageHeader title="College visits" subtitle="Tick a college after you visit and meet the person" />
      <div className="mb-4 flex gap-1 overflow-auto rounded-xl bg-slate-100 p-1">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={cx("flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium", tab === k ? "bg-white shadow-sm" : "text-slate-600")}>{l}</button>
        ))}
      </div>
      {tab === "list" && <List />}
      {tab === "progress" && <Progress />}
      {tab === "admin" && me?.manager && <AdminTab />}
    </div>
  );
}

async function exportXlsx() {
  const XLSX = await import("xlsx");
  const rows = await api<any[]>("/colleges/export");
  const maxP = Math.max(1, ...rows.map((r) => r.people.length));
  const visits = rows.map((r) => {
    const o: Record<string, any> = { College: r.college, District: r.district, Type: r.type, "College phone": r.college_phone, Email: r.email, Status: r.status, "Visit date": r.date, "Visited by": r.by };
    for (let i = 0; i < maxP; i++) { const p = r.people[i]; o[`Person ${i + 1} name`] = p?.name || ""; o[`Person ${i + 1} designation`] = p?.designation || ""; o[`Person ${i + 1} phone`] = p?.phone || ""; }
    o.Notes = r.notes; o.Location = r.lat != null ? `https://maps.google.com/?q=${r.lat},${r.lng}` : "";
    return o;
  });
  const seen = new Set<string>();
  const summary = rows.filter((r) => { const k = r.college + "|" + r.district; if (seen.has(k)) return false; seen.add(k); return true; }).map((r) => {
    const all = rows.filter((x) => x.college === r.college && x.district === r.district && x.date);
    return { College: r.college, District: r.district, Type: r.type, Status: r.status, Visits: r.visits, "Last visit": all.length ? all[all.length - 1].date : "", "People met": all.flatMap((x) => x.people.map((p: any) => `${p.name}${p.phone ? " (" + p.phone + ")" : ""}`)).join(", ") };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Colleges");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visits), "Visits");
  XLSX.writeFile(wb, `college-visits-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function List() {
  const { me } = useEvent();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("pending");
  const [district, setDistrict] = useState("");
  const [mine, setMine] = useState(false);
  const [limit, setLimit] = useState(40);
  const { data, error, loading, reload } = useFetch<any>("/colleges", { q, status, district, mine: mine ? 1 : "", limit });
  const [rec, setRec] = useState<College | null>(null);
  const [hist, setHist] = useState<College | null>(null);
  const [del, setDel] = useState<College | null>(null);
  const [exporting, setExporting] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const doDelete = async () => {
    if (!del) return;
    setDelBusy(true);
    try { await api("/colleges/delete", { body: { id: del.id } }); toast("College deleted"); setDel(null); reload(); } catch (e: any) { toast(e.message, "err"); }
    setDelBusy(false);
  };
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  const items: College[] = data?.items || [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card className="p-3"><div className="text-xl font-bold">{data?.all ?? "–"}</div><div className="text-xs text-slate-500">Colleges</div></Card>
        <Card className="p-3"><div className="text-xl font-bold text-emerald-600">{data?.done ?? "–"}</div><div className="text-xs text-slate-500">Connected</div></Card>
        <Card className="p-3"><div className="text-xl font-bold text-amber-600">{data ? data.all - data.done : "–"}</div><div className="text-xs text-slate-500">Pending</div></Card>
      </div>
      <div className="flex justify-end"><Button size="sm" variant="secondary" loading={exporting} onClick={async () => { setExporting(true); try { await exportXlsx(); } catch (e: any) { toast(e.message, "err"); } setExporting(false); }}><Download className="h-4 w-4" /> Export Excel</Button></div>
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={cx(inputCls, "pl-9")} placeholder="Search college, district or contact" value={q} onChange={(e) => { setQ(e.target.value); setLimit(40); }} /></div>
      <div className="flex flex-wrap gap-2">
        <select className={cx(inputCls, "w-auto")} value={status} onChange={(e) => setStatus(e.target.value)}><option value="pending">Pending</option><option value="done">Visited</option><option value="">All</option></select>
        <select className={cx(inputCls, "w-auto")} value={district} onChange={(e) => setDistrict(e.target.value)}><option value="">All districts</option>{(data?.districts || []).map((d: string) => <option key={d}>{d}</option>)}</select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> My visits</label>
      </div>
      {loading && !data ? <Spinner /> : items.length === 0 ? <Empty>No colleges found.</Empty> : (
        <div className="space-y-2">
          {items.map((c) => (
            <Card key={c.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold leading-snug">{c.name}</div>
                  <div className="text-xs text-slate-500">{[c.district, c.type].filter(Boolean).join(" · ")}</div>
                  {c.phone && <a href={`tel:${c.phone}`} className="mt-1 inline-flex items-center gap-1 text-xs text-brand-700"><Phone className="h-3 w-3" />{c.phone}{c.contact_person ? ` · ${c.contact_person}` : ""}</a>}
                  {c.visited && (
                    <div className="mt-1 text-xs text-slate-600">
                      <div>Last visit: {c.last_visit} · {c.last_by}</div>
                      {c.last_people.map((x, i) => <div key={i}>Met {x.name}{x.designation ? `, ${x.designation}` : ""}{x.phone && <> · <a href={`tel:${x.phone}`} className="text-brand-700">{x.phone}</a></>}</div>)}
                    </div>
                  )}
                </div>
                {c.visited ? <Badge tone="green">Visited{c.visit_count > 1 ? ` ×${c.visit_count}` : ""}</Badge> : <Badge tone="amber">Pending</Badge>}
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => setRec(c)}><CheckCircle2 className="h-4 w-4" /> {c.visited ? "Another visit" : "Record visit"}</Button>
                {c.visited && <Button size="sm" variant="secondary" onClick={() => setHist(c)}>History</Button>}
                {me?.manager && <Button size="sm" variant="danger" className="ml-auto" onClick={() => setDel(c)}>Delete</Button>}
              </div>
            </Card>
          ))}
          {data && data.total > items.length && <Button variant="secondary" className="w-full" onClick={() => setLimit(limit + 40)}>Show more ({data.total - items.length} left)</Button>}
        </div>
      )}
      {rec && <VisitModal college={rec} proof={data?.proof || "none"} onClose={() => setRec(null)} onDone={() => { setRec(null); reload(); }} />}
      <Modal open={!!del} onClose={() => setDel(null)} title="Delete college?">
        <p className="text-sm text-slate-700"><b>{del?.name}</b>{del && del.visit_count > 0 ? ` and its ${del.visit_count} recorded visit(s) will be permanently deleted.` : " will be permanently deleted."}</p>
        <div className="mt-4 flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" className="flex-1" loading={delBusy} onClick={doDelete}>Delete</Button></div>
      </Modal>
      {hist && <HistoryModal college={hist} onClose={() => setHist(null)} />}
    </div>
  );
}

function VisitModal({ college, proof, onClose, onDone }: { college: College; proof: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [people, setPeople] = useState([{ name: "", designation: "", phone: "" }]);
  const [notes, setNotes] = useState("");
  const upd = (i: number, k: string, v: string) => setPeople(people.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const [photo, setPhoto] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const needPhoto = proof === "photo" || proof === "both", needGps = proof === "gps" || proof === "both";
  const capture = () => {
    if (!navigator.geolocation) return setErr("This phone/browser cannot share location.");
    navigator.geolocation.getCurrentPosition((p) => { setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }); setErr(""); }, () => setErr("Location blocked. Allow location permission and try again."), { enableHighAccuracy: true, timeout: 15000 });
  };
  const submit = async () => {
    setErr("");
    if (!people.some((p) => p.name.trim())) return setErr("Enter the name of the person you met.");
    if (needPhoto && !photo) return setErr("Please add a proof photo.");
    if (needGps && !geo) return setErr("Please capture your location.");
    setBusy(true);
    try {
      await api("/visits/save", { body: { college_id: college.id, people: people.filter((p) => p.name.trim()), notes, photo, latitude: geo?.lat, longitude: geo?.lng } });
      toast("Visit saved");
      onDone();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Modal open onClose={onClose} title={`Visit · ${college.name}`}>
      <div className="space-y-3">
        <div className="space-y-3">
          {people.map((p, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">Person {i + 1}{i > 0 && <button type="button" onClick={() => setPeople(people.filter((_, j) => j !== i))} className="text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div>
              <input className={inputCls} placeholder={i === 0 ? "Name *" : "Name"} value={p.name} onChange={(e) => upd(i, "name", e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Designation" value={p.designation} onChange={(e) => upd(i, "designation", e.target.value)} />
                <input className={inputCls} placeholder="Phone" inputMode="tel" value={p.phone} onChange={(e) => upd(i, "phone", e.target.value)} />
              </div>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={() => setPeople([...people, { name: "", designation: "", phone: "" }])}><Plus className="h-4 w-4" /> Add another person</Button>
        </div>
        <Field label="Notes"><textarea className={cx(inputCls, "h-20 py-2")} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {proof !== "none" && (
          <div className="space-y-2 rounded-xl bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase text-slate-500">Proof</div>
            {needPhoto && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3"><Camera className="h-4 w-4" /> {photo ? "Change photo" : "Take / choose photo *"}</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const fl = e.target.files?.[0]; if (fl) try { setPhoto(await shrink(fl)); } catch (x: any) { setErr(x.message); } }} />
                {photo && <img src={photo} alt="" className="h-10 w-10 rounded object-cover" />}
              </label>
            )}
            {needGps && (
              <div className="flex items-center gap-2 text-sm">
                <Button type="button" variant="secondary" onClick={capture}><Crosshair className="h-4 w-4" /> {geo ? "Capture again" : "Capture location *"}</Button>
                {geo && <span className="text-emerald-700"><MapPin className="mr-1 inline h-4 w-4" />{geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}</span>}
              </div>
            )}
          </div>
        )}
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <p className="text-xs text-slate-500">Once saved, only an Administrator can change this visit.</p>
        <Button className="w-full" size="lg" loading={busy} onClick={submit}>Save visit</Button>
      </div>
    </Modal>
  );
}

function HistoryModal({ college, onClose }: { college: College; onClose: () => void }) {
  const { data, error } = useFetch<Visit[]>("/colleges/visits", { college_id: college.id });
  const [img, setImg] = useState<string>("");
  const show = async (id: number) => { try { const r = await api<{ data: string }>("/visits/photo", { params: { id } }); setImg("data:image/jpeg;base64," + r.data); } catch {} };
  return (
    <Modal open onClose={onClose} title={`History · ${college.name}`}>
      {error ? <ErrorBox message={error} /> : !data ? <Spinner /> : (
        <div className="space-y-3">
          {data.map((v) => (
            <div key={v.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="font-medium">{v.date} · {v.by}</div>
              {v.people.map((x, i) => <div key={i}>Met {x.name}{x.designation ? `, ${x.designation}` : ""}{x.phone && <> · <a className="text-brand-700" href={`tel:${x.phone}`}>{x.phone}</a></>}</div>)}
              {v.notes && <div className="mt-1 text-slate-600">{v.notes}</div>}
              <div className="mt-1 flex gap-3 text-xs">
                {v.has_photo && <button className="text-brand-700 underline" onClick={() => show(v.id)}>View photo</button>}
                {v.lat != null && <a className="text-brand-700 underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${v.lat},${v.lng}`}>View location</a>}
              </div>
            </div>
          ))}
          {img && <img src={img} alt="Proof" className="w-full rounded-lg" />}
        </div>
      )}
    </Modal>
  );
}

function Progress() {
  const { data, error, reload } = useFetch<any>("/colleges/progress");
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  const pct = data.total ? Math.round((data.done * 100) / data.total) : 0;
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-end justify-between"><div><div className="text-3xl font-bold text-emerald-600">{data.done}<span className="text-lg text-slate-400"> / {data.total}</span></div><div className="text-sm text-slate-500">colleges connected · {data.pending} pending</div></div><div className="text-2xl font-bold">{pct}%</div></div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
      </Card>
      <Card className="p-4">
        <h3 className="mb-3 font-semibold">District-wise</h3>
        <div className="space-y-2">
          {data.districts.map((d: any) => (
            <div key={d.district}>
              <div className="flex justify-between text-sm"><span>{d.district}</span><span className="text-slate-500">{d.done} / {d.total}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${d.total ? (d.done * 100) / d.total : 0}%` }} /></div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="mb-2 font-semibold">By Marketing Manager</h3>
        {data.people.length === 0 ? <Empty>No visits yet.</Empty> : data.people.map((p: any) => <div key={p.name} className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-0"><span>{p.name}</span><span className="text-slate-500">{p.colleges} colleges · {p.visits} visits</span></div>)}
      </Card>
      <Card className="p-4">
        <h3 className="mb-2 font-semibold">Recent visits</h3>
        {data.recent.map((r: any, i: number) => <div key={i} className="border-b border-slate-100 py-1.5 text-sm last:border-0"><div className="font-medium">{r.college} <span className="font-normal text-slate-500">· {r.district}</span></div><div className="text-xs text-slate-500">{r.date} · {r.by} · met {r.person}</div></div>)}
      </Card>
    </div>
  );
}

function AdminTab() {
  const toast = useToast();
  const { data, reload } = useFetch<{ proof: string }>("/colleges/settings");
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const setProof = async (proof: string) => { try { await api("/colleges/settings", { body: { proof } }); reload(); } catch (e: any) { setMsg(e.message); } };
  const upload = async (fl: File) => {
    setBusy(true); setMsg("");
    try {
      const r = await api<{ created: number; skipped: number }>("/colleges/import", { body: { name: fl.name, data: await toB64(fl) } });
      setMsg(`Added ${r.created} new colleges. Skipped ${r.skipped} already in the list.`);
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
    if (file.current) file.current.value = "";
  };
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-semibold">Upload college list</h3>
        <p className="mb-3 text-sm text-slate-500">Excel (.xlsx) or CSV. Columns: College Name, District (optional: Type, Address, Phone, Email, Contact Person). Colleges already in the list are skipped.</p>
        <input ref={file} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button loading={busy} onClick={() => file.current?.click()}><Upload className="h-4 w-4" /> Choose file</Button>
        {msg && <p className="mt-3 text-sm text-slate-700">{msg}</p>}
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold">Visit proof</h3>
        <p className="mb-3 text-sm text-slate-500">What a Marketing Manager must add when ticking a visit.</p>
        <div className="grid grid-cols-2 gap-2">
          {[["none", "No proof"], ["photo", "Photo"], ["gps", "Location (GPS)"], ["both", "Photo + Location"]].map(([k, l]) => (
            <button key={k} onClick={() => setProof(k)} className={cx("rounded-lg border px-3 py-2 text-sm font-medium", data?.proof === k ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200")}>{l}</button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">GPS needs HTTPS and the phone's location permission.</p>
      </Card>
    </div>
  );
}
