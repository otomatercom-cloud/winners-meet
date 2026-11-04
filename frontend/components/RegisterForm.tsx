"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Trophy } from "lucide-react";
import { api, useFetch } from "@/lib/api";
import { Button, Card, Field, Spinner, inputCls } from "@/components/ui";

export default function RegisterForm({ kind }: { kind: "student" | "teacher" }) {
  const { data, loading } = useFetch<any>("/public/event");
  const [f, setF] = useState({ name: "", phone: "", place: "", institution: "", category_id: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<any>(null);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const ev = data?.event;
  const cats: { id: number; name: string; color: string }[] = (kind === "student" ? data?.student_categories : data?.teacher_categories) || [];
  const open = ev && (kind === "student" ? ev.reg_student_open : ev.reg_teacher_open);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const catId = f.category_id || (cats.length === 1 ? String(cats[0].id) : "");
      setDone(await api("/public/register", { method: "POST", body: { ...f, category_id: catId, kind, event_id: ev.id } }));
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };

  if (loading) return <Spinner />;
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-8">
      <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm text-slate-500"><Trophy className="h-4 w-4" /> {ev?.name || "Winners Meet"}</Link>
      {!ev || !open ? (
        <Card className="p-6 text-center text-slate-600">Registration is closed right now.</Card>
      ) : done ? (
        <Card className="p-8 text-center">
          {done.approval_state === "approved" ? <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" /> : <Clock className="mx-auto mb-3 h-12 w-12 text-amber-500" />}
          <h2 className="text-xl font-semibold">{done.already ? "Already registered" : done.approval_state === "approved" ? "You are registered!" : "Registration received"}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {done.message ||
              (done.approval_state === "approved"
                ? "Your entry pass has been sent on WhatsApp. Show the QR code at the desk on the event day."
                : "We are verifying your details. Your entry pass will arrive on WhatsApp once confirmed.")}
          </p>
          {done.token && <Link href={`/pass/${done.token}`}><Button size="lg" className="mt-5 w-full">View my entry pass</Button></Link>}
        </Card>
      ) : (
        <Card className="p-5 sm:p-6">
          <h1 className="text-xl font-semibold">{kind === "student" ? "Student" : "Teacher"} registration</h1>
          <p className="mb-5 mt-1 text-sm text-slate-500">{ev.date}{ev.time ? ` · ${ev.time}` : ""}{ev.venue ? ` · ${ev.venue}` : ""}</p>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Full name"><input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} required minLength={2} maxLength={100} autoComplete="name" /></Field>
            <Field label="WhatsApp number" hint="Your entry pass and seat details will be sent here.">
              <input className={inputCls} value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" required placeholder="10-digit mobile number" autoComplete="tel" />
            </Field>
            {cats.length > 1 && (
              <Field label={kind === "student" ? "Winner category" : "Category"}>
                <select className={inputCls} value={f.category_id} onChange={(e) => set("category_id", e.target.value)} required>
                  <option value="">Select…</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            <Field label={kind === "student" ? "Place" : "School / institution"}>
              <input className={inputCls} value={kind === "student" ? f.place : f.institution} onChange={(e) => set(kind === "student" ? "place" : "institution", e.target.value)} />
            </Field>
            <input type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} className="hidden" aria-hidden />
            {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
            <Button size="lg" className="w-full" loading={busy}>Register</Button>
          </form>
        </Card>
      )}
    </main>
  );
}
