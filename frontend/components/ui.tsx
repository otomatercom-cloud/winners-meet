"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export function Button({ variant = "primary", size = "md", loading, className, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" | "success"; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const v = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
    secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  const s = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-14 px-6 text-base" }[size];
  return (
    <button {...p} disabled={p.disabled || loading} className={cx("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none", v, s, className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>{children}</div>;
}

export function Badge({ tone = "slate", children, className }: { tone?: "slate" | "green" | "red" | "amber" | "blue" | "violet"; children: ReactNode; className?: string }) {
  const t = {
    slate: "bg-slate-100 text-slate-700", green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    red: "bg-rose-50 text-rose-700 ring-rose-200", amber: "bg-amber-50 text-amber-800 ring-amber-200",
    blue: "bg-sky-50 text-sky-700 ring-sky-200", violet: "bg-violet-50 text-violet-700 ring-violet-200",
  }[tone];
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent", t, className)}>{children}</span>;
}

export function CategoryChip({ name, color }: { name: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
      <span className="h-2 w-2 rounded-full" style={{ background: color || "#6366f1" }} />
      {name}
    </span>
  );
}

export const approvalBadge = (s: string) =>
  s === "approved" ? <Badge tone="green">Approved</Badge> : s === "pending" ? <Badge tone="red">Needs review</Badge> : <Badge tone="slate">Rejected</Badge>;
export const hatBadge = (s: string) =>
  s === "issued" ? <Badge tone="amber">Hat issued</Badge> : s === "returned" ? <Badge tone="green">Hat returned</Badge> : s === "lost" ? <Badge tone="red">Hat lost</Badge> : null;
export const waBadge = (s: string) =>
  s === "sent" ? <Badge tone="green">WhatsApp sent</Badge> : s === "failed" ? <Badge tone="red">WhatsApp failed</Badge> : s === "queued" ? <Badge tone="blue">WhatsApp queued</Badge> : s === "skipped" ? <Badge tone="amber">No number</Badge> : <Badge>—</Badge>;

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div className={cx("pop max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export const inputCls = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
      <span className="text-sm text-slate-700">{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cx("relative h-6 w-11 rounded-full transition", checked ? "bg-brand-600" : "bg-slate-300")}>
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center text-sm text-slate-500">{children}</div>;
}

export function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{message}</span>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

// ---- toasts
type Toast = { id: number; text: string; tone: "ok" | "err" };
const ToastCtx = createContext<(text: string, tone?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === "err" ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3">
        {items.map((t) => (
          <div key={t.id} className={cx("pop pointer-events-auto flex max-w-md items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg", t.tone === "ok" ? "bg-emerald-600" : "bg-rose-600")}>
            {t.tone === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function fmtTime(s?: string) {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T") + "Z");
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function fmtPhone(p: string) {
  return p && p.length === 12 && p.startsWith("91") ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : p ? `+${p}` : "";
}
