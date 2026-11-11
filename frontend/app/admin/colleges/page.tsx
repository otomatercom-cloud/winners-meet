"use client";
import { useRef, useState } from "react";
import { Camera, CheckCircle2, Crosshair, MapPin, Phone, Search, Upload } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, inputCls, cx, useToast } from "@/components/ui";
import { useEvent } from "@/components/EventContext";
import { api, useFetch } from "@/lib/api";

type College = { id: number; name: string; district: string; type: string; phone: string; contact_person: string; visited: boolean; visit_count: number; last_visit: string; last_by: string; last_person: string };
type Visit = { id: number; date: string; by: string; person: string; designation: string; phone: string; notes: string; has_photo: boolean; lat: number | null; lng: number | null };

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

function List() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("pending");
  const [district, setDistrict] = useState("");
  const [mine, setMine] = useState(false);
  const [limit, setLimit] = useState(40);
  const { data, error, loading, reload } = useFetch<any>("/colleges", { q, status, district, mine: mine ? 1 : "", limit });
  const [rec, setRec] = useState<College | null>(null);
  const [hist, setHist] = useState<College | null>(null);
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  const items: College[] = data?.items || [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card className="p-3"><div className="text-xl font-bold">{data?.all ?? "–"}</div><div className="text-xs text-slate-500">Colleges</div></Card>
        <Card className="p-3"><div className="text-xl font-bold text-emerald-600">{data?.done ?? "–"}</div><div className="text-xs text-slate-500">Connected</div></Card>
        <Card className="p-3"><div className="text-xl font-bold text-amber-600">{data ? data.all - data.done : "–"}</div><div className="text-xs text-slate-500">Pending</div></Card>
      </div>
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
                  {c.visited && <div className="mt-1 text-xs text-slate-600">Last: {c.last_visit} · {c.last_by} · met {c.last_person}</div>}
                </div>
                {c.visited ? <Badge tone="green">Visited{c.visit_count > 1 ? ` ×${c.visit_count}` : ""}</Badge> : <Badge tone="amber">Pending</Badge>}
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => setRec(c)}><CheckCircle2 className="h-4 w-4" /> {c.visited ? "Another visit" : "Record visit"}</Button>
                {c.visited && <Button size="sm" variant="secondary" onClick={() => setHist(c)}>History</Button>}
              </div>
            </Card>
          ))}
          {data && data.total > items.length && <Button variant="secondary" className="w-full" onClick={() => setLimit(limit + 40)}>Show more ({data.total - items.length} left)</Button>}
        </div>
      )}
      {rec && <VisitModal college={rec} proof={data?.proof || "none"} onClose={() => setRec(null)} onDone={() => { setRec(null); reload(); }} />}
      {hist && <HistoryModal college={hist} onClose={() => setHist(null)} />}
    </div>
  );
}

function VisitModal({ college, proof, onClose, onDone }: { college: College; proof: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ person_met: "", designation: "", person_phone: "", notes: "" });
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
    if (!f.person_met.trim()) return setErr("Enter the name of the person you met.");
    if (needPhoto && !photo) return setErr("Please add a proof photo.");
    if (needGps && !geo) return setErr("Please capture your location.");
    setBusy(true);
    try {
      await api("/visits/save", { body: { college_id: college.id, ...f, photo, latitude: geo?.lat, longitude: geo?.lng } });
      toast("Visit saved");
      onDone();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Modal open onClose={onClose} title={`Visit · ${college.name}`}>
      <div className="space-y-3">
        <Field label="Person met *"><input className={inputCls} value={f.person_met} onChange={(e) => setF({ ...f, person_met: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Designation"><input className={inputCls} value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} placeholder="Principal, HOD…" /></Field>
          <Field label="Their phone"><input className={inputCls} inputMode="tel" value={f.person_phone} onChange={(e) => setF({ ...f, person_phone: e.target.value })} /></Field>
        </div>
        <Field label="Notes"><textarea className={cx(inputCls, "h-20 py-2")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
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
              <div>Met {v.person}{v.designation ? `, ${v.designation}` : ""}{v.phone ? ` · ${v.phone}` : ""}</div>
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
