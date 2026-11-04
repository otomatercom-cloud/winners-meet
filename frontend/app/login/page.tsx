"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { Button, Card, Field, inputCls } from "@/components/ui";

export default function Login() {
  const r = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login, password }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) setErr(j?.error || "Login failed.");
      else r.replace("/admin");
    } catch {
      setErr("No network. Try again.");
    }
    setBusy(false);
  };
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-white"><Trophy className="h-6 w-6" /></div>
          <h1 className="text-lg font-semibold">Winners Meet · Staff</h1>
          <p className="text-sm text-slate-500">Sign in with your ERP account</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Username / email"><input className={inputCls} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" required /></Field>
          <Field label="Password"><input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <Button className="w-full" size="lg" loading={busy}>Sign in</Button>
        </form>
      </Card>
    </main>
  );
}
