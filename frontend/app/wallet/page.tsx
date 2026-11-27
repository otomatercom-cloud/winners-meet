"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUp, Clock, Plus, XCircle } from "lucide-react";
import { api } from "@/lib/api";

type Row = { kind: string; name: string; course: string; state: string; amount: number; discount_pct: number; date: string };
type Wallet = {
  name: string; code: string; balance: number; expected: number; confirmed: number; added: number;
  discount_enabled: boolean; discount_slots: number; discount_pct: number; discount_used: number;
  referral_enabled: boolean; referral_pct: number; can_add: boolean; courses: { id: number; name: string }[]; rows: Row[];
};

const rs = (n: number) => "₹ " + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const KEY = "wm_wallet";
const inp = "h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-200";
const lbl = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600";

/** Public referral wallet: mobile number + coupon code, no login. */
export default function WalletPage() {
  const [cred, setCred] = useState<{ phone: string; code: string } | null>(null);
  const [data, setData] = useState<Wallet | null>(null);
  const [view, setView] = useState<"login" | "wallet" | "add">("login");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ student_name: "", student_phone: "", course_id: "", school: "" });
  const [okMsg, setOkMsg] = useState("");

  const load = async (c: { phone: string; code: string }) => {
    setBusy(true); setErr("");
    try {
      const d = await api<Wallet>("/public/wallet", { method: "POST", body: c });
      setData(d); setCred(c); setView("wallet");
      try { sessionStorage.setItem(KEY, JSON.stringify(c)); } catch {}
    } catch (e: any) { setErr(e.message || "Something went wrong"); setView("login"); try { sessionStorage.removeItem(KEY); } catch {} }
    setBusy(false);
  };
  useEffect(() => {
    try { const s = sessionStorage.getItem(KEY); if (s) load(JSON.parse(s)); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = () => { try { sessionStorage.removeItem(KEY); } catch {} setData(null); setCred(null); setView("login"); setCode(""); };
  const submitStudent = async (e: React.FormEvent) => {
    e.preventDefault(); if (!cred) return;
    setBusy(true); setErr("");
    try {
      await api("/public/wallet/add", { method: "POST", body: { ...cred, ...f, course_id: Number(f.course_id) } });
      setOkMsg(`${f.student_name} added. Our team will contact the student.`);
      setF({ student_name: "", student_phone: "", course_id: "", school: "" });
      const d = await api<Wallet>("/public/wallet", { method: "POST", body: cred });
      setData(d); setView("wallet");
    } catch (e: any) { setErr(e.message || "Could not add the student"); }
    setBusy(false);
  };

  const shell = "mx-auto min-h-screen max-w-md";
  if (view === "login" || !data) {
    return (
      <main className="min-h-screen bg-emerald-900 px-6 py-10 text-white">
        <div className="mx-auto flex max-w-md flex-col gap-7">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">Referral wallet</h1>
            <p className="mt-2 text-emerald-100">Enter your mobile number and the coupon code you received to see your wallet.</p>
          </div>
          <form className="space-y-4 rounded-2xl bg-white p-5 text-slate-900" onSubmit={(e) => { e.preventDefault(); load({ phone, code }); }}>
            <div><label className={lbl} htmlFor="mob">Mobile number</label><input id="mob" className={inp} type="tel" inputMode="numeric" autoComplete="tel" placeholder="10-digit mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div><label className={lbl} htmlFor="cpn">Coupon code</label><input id="cpn" className={inp + " uppercase tracking-wider"} type="text" autoCapitalize="characters" placeholder="WMT-XXXXXX" value={code} onChange={(e) => setCode(e.target.value)} /></div>
            {err && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
            <button disabled={busy || !phone || !code} className="h-12 w-full rounded-xl bg-amber-400 text-base font-semibold text-slate-900 disabled:opacity-50">{busy ? "Please wait…" : "Open my wallet"}</button>
          </form>
          <p className="text-center text-sm text-emerald-100">Your coupon code was sent to your WhatsApp when you attended the event.</p>
        </div>
      </main>
    );
  }

  if (view === "add") {
    return (
      <main className="min-h-screen bg-emerald-50/60">
        <div className={shell}>
          <header className="flex items-center gap-3 bg-emerald-900 px-5 py-6 text-white">
            <button aria-label="Back to wallet" onClick={() => { setView("wallet"); setErr(""); }} className="grid h-10 w-10 place-items-center rounded-full bg-white/15"><ArrowLeft className="h-5 w-5" /></button>
            <div><div className="text-xl font-bold">Add a student</div>{data.discount_enabled && <div className="text-sm text-emerald-100">{Math.max(0, data.discount_slots - data.discount_used)} of {data.discount_slots} discount slots left</div>}</div>
          </header>
          <form onSubmit={submitStudent} className="m-4 space-y-4 rounded-2xl bg-white p-5">
            <div><label className={lbl} htmlFor="sn">Name of student</label><input id="sn" required minLength={2} className={inp} placeholder="Student's full name" value={f.student_name} onChange={(e) => setF({ ...f, student_name: e.target.value })} /></div>
            <div><label className={lbl} htmlFor="sp">Phone number</label><input id="sp" required className={inp} type="tel" inputMode="numeric" placeholder="10-digit mobile number" value={f.student_phone} onChange={(e) => setF({ ...f, student_phone: e.target.value })} /></div>
            <div><label className={lbl} htmlFor="sc">Course interested in</label>
              <select id="sc" required className={inp} value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value })}><option value="">Select a course</option>{data.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className={lbl} htmlFor="ss">School or college</label><input id="ss" className={inp} placeholder="Where the student studies" value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })} /></div>
            {err && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
            <button disabled={busy} className="h-12 w-full rounded-xl bg-amber-400 text-base font-semibold text-slate-900 disabled:opacity-50">{busy ? "Please wait…" : "Submit student"}</button>
          </form>
          <p className="mx-4 rounded-xl bg-emerald-100 p-3.5 text-sm text-emerald-900">
            Our team lead will contact the student.{data.referral_enabled ? ` When the admission is confirmed, ${data.referral_pct}% of the tuition fee is added to your wallet.` : ""}
          </p>
        </div>
      </main>
    );
  }

  const stateChip = (r: Row) => {
    if (r.state === "credited") return <span className="text-[15px] font-bold text-emerald-700">+ {rs(r.amount)}</span>;
    if (r.state === "paid") return <span className="text-[15px] font-bold text-rose-700">− {rs(r.amount)}</span>;
    if (r.state === "adjust") return <span className={"text-[15px] font-bold " + (r.amount < 0 ? "text-rose-700" : "text-emerald-700")}>{r.amount < 0 ? "− " : "+ "}{rs(r.amount)}</span>;
    if (r.state === "closed") return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Not admitted</span>;
    if (r.state === "approval") return <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">Verifying</span>;
    return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">In progress</span>;
  };
  const sub = (r: Row) =>
    r.state === "credited" ? `${r.course ? r.course + " · " : ""}Admitted${r.discount_pct ? ` · student got ${r.discount_pct}% off` : ""}`
    : r.state === "approval" ? `${r.course ? r.course + " · " : ""}Admission being verified`
    : r.state === "closed" ? `${r.course ? r.course + " · " : ""}Did not join`
    : r.state === "paid" || r.state === "adjust" ? r.course
    : `${r.course ? r.course + " · " : ""}With our team`;
  const icon = (r: Row) => r.state === "credited" ? { bg: "bg-emerald-100", el: <ArrowUp className="h-[18px] w-[18px] text-emerald-700" /> }
    : r.state === "paid" ? { bg: "bg-rose-100", el: <ArrowUp className="h-[18px] w-[18px] rotate-180 text-rose-700" /> }
    : r.state === "closed" ? { bg: "bg-slate-100", el: <XCircle className="h-[18px] w-[18px] text-slate-500" /> }
    : { bg: "bg-amber-100", el: <Clock className="h-[18px] w-[18px] text-amber-800" /> };

  return (
    <main className="min-h-screen bg-emerald-50/60 pb-8">
      <div className={shell}>
        <header className="bg-emerald-900 px-5 pb-20 pt-7 text-white">
          <div className="flex items-start justify-between">
            <div><div className="text-sm text-emerald-200">Hello,</div><div className="text-xl font-bold">{data.name}</div></div>
            <div className="text-right"><div className="text-[11px] uppercase tracking-wider text-emerald-200">Your coupon</div><div className="font-semibold tracking-wide text-amber-300">{data.code}</div></div>
          </div>
        </header>
        <section className="-mt-14 mx-4 space-y-4 rounded-2xl bg-white p-5 shadow-lg shadow-emerald-900/10">
          <div><div className="text-sm text-slate-600">Wallet balance</div><div className="text-4xl font-bold tracking-tight text-slate-900">{rs(data.balance)}</div></div>
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl bg-emerald-50 px-3 py-2.5"><div className="text-xs text-slate-600">Expected</div><div className="font-semibold text-amber-800">{rs(data.expected)}</div></div>
            <div className="flex-1 rounded-xl bg-emerald-50 px-3 py-2.5"><div className="text-xs text-slate-600">Admissions</div><div className="font-semibold text-emerald-800">{data.confirmed} confirmed</div></div>
          </div>
          {data.discount_enabled && data.discount_slots > 0 && (
            <div>
              <div className="flex gap-1.5">{Array.from({ length: data.discount_slots }).map((_, i) => <div key={i} className={"h-2 flex-1 rounded " + (i < data.discount_used ? "bg-emerald-600" : "bg-slate-200")} />)}</div>
              <p className="mt-2 text-xs text-slate-600">Student discount used: {data.discount_used} of {data.discount_slots} · first {data.discount_slots} students get {data.discount_pct}% off</p>
            </div>
          )}
          {data.can_add && <button onClick={() => { setView("add"); setErr(""); setOkMsg(""); }} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 text-[15px] font-semibold text-slate-900"><Plus className="h-[18px] w-[18px]" /> Add a student</button>}
        </section>
        {okMsg && <p role="status" className="mx-4 mt-4 rounded-xl bg-emerald-100 p-3 text-sm text-emerald-900">{okMsg}</p>}
        <div className="flex items-center justify-between px-5 pb-2 pt-6"><h2 className="font-semibold text-slate-900">Transactions</h2><span className="text-sm font-medium text-emerald-700">{data.added} student{data.added === 1 ? "" : "s"} added</span></div>
        <div className="mx-4 divide-y divide-slate-100 rounded-2xl bg-white">
          {data.rows.length === 0 && <p className="p-5 text-center text-sm text-slate-500">No students added yet.</p>}
          {data.rows.map((r, i) => { const ic = icon(r); return (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className={"grid h-10 w-10 shrink-0 place-items-center rounded-full " + ic.bg}>{ic.el}</div>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-900">{r.name}</div><div className="text-xs text-slate-600">{sub(r)}</div></div>
              {stateChip(r)}
            </div>); })}
        </div>
        <p className="px-5 pt-4 text-center text-xs text-slate-600">{data.referral_enabled ? `You earn ${data.referral_pct}% of the tuition fee for every confirmed admission.` : ""}</p>
        <div className="flex justify-center gap-6 pt-3 text-sm"><button className="text-emerald-800 underline" onClick={() => cred && load(cred)}>Refresh</button><button className="text-slate-600 underline" onClick={signOut}>Sign out</button></div>
      </div>
    </main>
  );
}
