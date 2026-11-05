"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { Crown, MapPin, CalendarDays, Armchair } from "lucide-react";
import { useFetch } from "@/lib/api";
import { Badge, Card, Spinner } from "@/components/ui";

export default function Pass() {
  const { token } = useParams<{ token: string }>();
  const { data, error, loading } = useFetch<any>(`/public/pass/${token}`, undefined, 10000);
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!token) return;
    QRCode.toDataURL(`${window.location.origin}/pass/${token}`, { width: 560, margin: 1, errorCorrectionLevel: "M" }).then(setQr).catch(() => {});
  }, [token]);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <main className="grid min-h-screen place-items-center px-4 text-center text-slate-600">This pass link is not valid.</main>;
  const approved = data.approval_state === "approved";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-6">
      <Card className="overflow-hidden">
        <div className="bg-brand-600 px-5 py-4 text-white">
          <div className="text-xs uppercase tracking-wider opacity-80">Entry pass</div>
          <div className="text-lg font-semibold leading-tight">{data.event.name}</div>
        </div>
        <div className="p-5 text-center">
          <div className="text-2xl font-bold">{data.name}</div>
          <div className="mt-1 flex items-center justify-center gap-2">
            <Badge tone="violet">{data.kind === "teacher" ? "Teacher" : "Student"}</Badge>
          </div>
          {approved ? (
            <>
              {qr && <img src={qr} alt="Entry QR code" className="mx-auto mt-5 w-full max-w-[260px] rounded-lg border border-slate-200 p-2" />}
              <p className="mt-2 text-xs text-slate-500">Show this QR code at the check-in desk</p>
            </>
          ) : (
            <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{data.approval_state === "rejected" ? "This registration could not be verified. Please contact the organisers." : "Your registration is being verified. Your pass will be active soon."}</p>
          )}
          {data.seat && (
            <div className="mt-5 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
              <div className="flex items-center justify-center gap-1.5 text-sm text-emerald-700"><Armchair className="h-4 w-4" /> Your seat</div>
              <div className="text-5xl font-extrabold tracking-tight text-emerald-700">{data.seat}</div>
            </div>
          )}
          {data.hat && approved && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-amber-700"><Crown className="h-4 w-4" /> You will receive a winner hat. Please return it after the programme.</p>
          )}
        </div>
        <div className="space-y-1 border-t border-slate-100 bg-slate-50 px-5 py-3 text-sm text-slate-600">
          <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{data.event.date}{data.event.time ? ` · ${data.event.time}` : ""}</div>
          {data.event.venue && <div className="flex items-center gap-2"><MapPin className="h-4 w-4" />{data.event.venue}</div>}
        </div>
      </Card>
    </main>
  );
}
