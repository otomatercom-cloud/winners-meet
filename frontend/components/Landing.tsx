"use client";
import Link from "next/link";
import { GraduationCap, Presentation, ShieldCheck, Trophy } from "lucide-react";
import { useFetch } from "@/lib/api";

export default function Landing({ slug }: { slug?: string }) {
  const { data } = useFetch<any>("/public/event", slug ? { slug } : undefined);
  const base = slug ? `/e/${slug}` : "";
  const ev = data?.event;
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg"><Trophy className="h-7 w-7" /></div>
        <h1 className="text-3xl font-bold tracking-tight">{ev?.name || "Winners Meet"}</h1>
        {ev && <p className="mt-2 text-slate-600">{ev.date}{ev.time ? ` · ${ev.time}` : ""}{ev.venue ? ` · ${ev.venue}` : ""}</p>}
        {data && !ev && !data.events?.length && <p className="mt-2 text-slate-500">Registration is not open right now.</p>}
      </div>
      {data?.events?.length > 0 && (
        <div className="mb-6 space-y-3">
          <p className="text-center text-sm text-slate-500">Choose your event</p>
          {data.events.map((e: any) => (
            <Link key={e.slug} href={`/e/${e.slug}`} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500 hover:shadow-md">
              <div className="text-lg font-semibold">{e.name}</div>
              <div className="mt-1 text-sm text-slate-500">{e.date}{e.time ? ` · ${e.time}` : ""}{e.venue ? ` · ${e.venue}` : ""}</div>
            </Link>
          ))}
        </div>
      )}
      <div className={`grid gap-4 sm:grid-cols-2 ${ev ? "" : "hidden"}`}>
        <Link href={`${base}/register`} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-brand-500 hover:shadow-md">
          <GraduationCap className="mb-3 h-8 w-8 text-brand-600" />
          <div className="text-lg font-semibold">Student registration</div>
          <p className="mt-1 text-sm text-slate-500">Register and get your entry pass on WhatsApp.</p>
        </Link>
        <Link href={`${base}/register/teacher`} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-brand-500 hover:shadow-md">
          <Presentation className="mb-3 h-8 w-8 text-brand-600" />
          <div className="text-lg font-semibold">Teacher registration</div>
          <p className="mt-1 text-sm text-slate-500">Register for the teachers programme.</p>
        </Link>
      </div>
      <div className="mt-8 text-center">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"><ShieldCheck className="h-4 w-4" /> Staff sign in</Link>
      </div>
    </main>
  );
}
