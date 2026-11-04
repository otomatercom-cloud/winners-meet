"use client";
import { useRef, useState } from "react";
import { CheckCircle2, Download, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { useEvent } from "@/components/EventContext";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, fmtPhone, useToast } from "@/components/ui";

type Row = { name: string; phone: string; course: string; category: string; seat: string };
const pick = (r: Record<string, any>, keys: string[]) => {
  for (const k of Object.keys(r)) if (keys.includes(k.trim().toLowerCase())) return String(r[k] ?? "").trim();
  return "";
};

export default function Winners() {
  const { eventId, me } = useEvent();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { data, error, loading, reload } = useFetch<any[]>(eventId ? "/expected" : null, { event_id: eventId }, 15000);
  if (!me?.manager) return <Empty>Administrators only.</Empty>;

  const read = async (f: File) => {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      const parsed = json.map((r) => ({ name: pick(r, ["name", "student name", "student"]), phone: pick(r, ["phone", "mobile", "whatsapp", "phone number", "mobile number"]), course: pick(r, ["course", "course name"]), category: pick(r, ["category", "winner category", "subcategory", "sub category", "rank", "prize"]), seat: pick(r, ["seat", "seat no", "seat number", "seat no."]) })).filter((r) => r.name || r.phone);
      if (!parsed.length) toast("No rows found. Use columns: Name, Phone, Category", "err");
      setRows(parsed); setResult(null);
    } catch { toast("Could not read this file. Use .xlsx or .csv", "err"); }
  };
  const upload = async () => {
    setBusy(true);
    try { const r = await api<any>("/expected/bulk", { method: "POST", body: { event_id: eventId, rows } }); setResult(r); setRows([]); reload(); toast(`${r.created} added, ${r.updated} updated`); }
    catch (e: any) { toast(e.message, "err"); }
    setBusy(false);
  };
  const template = () => {
    const ws = XLSX.utils.aoa_to_sheet([["Name", "Phone", "Course", "Category", "Seat"], ["Anu Krishnan", "9876543210", "CPA USA", "Partly Qualified", "G12"]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Winners"); XLSX.writeFile(wb, "winners-list-template.xlsx");
  };
  const del = async (id: number) => { try { await api("/expected/delete", { method: "POST", body: { id } }); reload(); } catch (e: any) { toast(e.message, "err"); } };
  const registered = (data || []).filter((r) => r.registered).length;
  return (
    <div>
      <PageHeader title="Winners list" subtitle="Upload winners with their category. Registrations that do not match appear in the review queue." actions={<Button variant="secondary" size="sm" onClick={template}><Download className="h-4 w-4" /> Template</Button>} />
      <Card className="mb-5 p-5">
        <input ref={file} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
        {!rows.length ? (
          <button onClick={() => file.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-10 text-slate-500 hover:border-brand-500 hover:text-brand-600"><Upload className="h-7 w-7" /><span className="font-medium">Upload Excel / CSV</span><span className="text-xs">Columns: Name, Phone, Course, Category (subcategory), Seat (optional, e.g. G12). Category names and seats must already exist</span></button>
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between"><span className="font-medium">{rows.length} rows ready</span><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setRows([])}>Cancel</Button><Button size="sm" loading={busy} onClick={upload}>Import {rows.length} rows</Button></div></div>
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 text-sm"><table className="w-full"><tbody className="divide-y divide-slate-100">{rows.slice(0, 100).map((r, i) => <tr key={i}><td className="px-3 py-1.5">{r.name}</td><td className="px-3 py-1.5">{r.phone}</td><td className="px-3 py-1.5">{r.course}</td><td className="px-3 py-1.5">{r.category}</td><td className="px-3 py-1.5">{r.seat}</td></tr>)}</tbody></table></div>
          </div>
        )}
        {result && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {result.created} added · {result.updated} updated</div>
            {result.errors.length > 0 && <div className="mt-2 text-rose-700">{result.errors.length} rows skipped: {result.errors.slice(0, 8).map((e: any) => `row ${e.row} (${e.error})`).join(", ")}</div>}
          </div>
        )}
      </Card>
      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : !data?.length ? <Empty>No winners uploaded yet. Without a list, every registration is approved automatically.</Empty> : (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">{registered} of {data.length} winners registered</div>
          <div className="divide-y divide-slate-100">
            {data.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{r.name}</div><div className="text-xs text-slate-500">{fmtPhone(r.phone)} · {r.category}{r.seat ? ` · Seat ${r.seat}` : ""}</div></div>
                <div className="flex items-center gap-2">{r.registered ? <Badge tone="green">Registered</Badge> : <Badge tone="amber">Not yet</Badge>}<button className="text-xs text-slate-400 hover:text-rose-600" onClick={() => del(r.id)}>Remove</button></div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
