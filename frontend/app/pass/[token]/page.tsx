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
              {data.seat_row > 0 && <div className="mt-1 text-lg font-semibold text-emerald-800">Row {data.seat_row_name || data.seat_row}</div>}
            </div>
          )}
          {data.trophy_state === "given" && <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">🏆 Trophy collected — congratulations!</div>}
          {data.stage_note && <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">Your category's announcement is complete. Your trophy will be given at the end of the programme.</div>}
          {approved && data.items?.length > 0 ? (
            <div className={`mt-4 rounded-xl p-3 text-sm ring-1 ${data.hat_state === "returned" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200"}`}>
              <div className="flex items-center justify-center gap-1.5 font-semibold"><Crown className="h-4 w-4" />
                {data.hat_state === "returned" ? "All returned — thank you!" : data.hat_state === "lost" ? "Marked as lost" : "Please return after the programme"}</div>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {data.items.map((i: any) => (
                  <span key={i.name} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${i.state === "returned" ? "bg-emerald-600 text-white" : i.state === "lost" ? "bg-rose-600 text-white" : "bg-white ring-1 ring-amber-300"}`}>
                    {i.name} · {i.state === "returned" ? "Returned ✓" : i.state === "lost" ? "Lost" : "With you"}</span>
                ))}
              </div>
            </div>
          ) : (approved && data.planned_items?.length > 0 && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-amber-700"><Crown className="h-4 w-4" /> You will receive: {data.planned_items.join(", ")}. Please return {data.planned_items.length > 1 ? "them" : "it"} after the programme.</p>
          ))}
        </div>
        <div className="space-y-1 border-t border-slate-100 bg-slate-50 px-5 py-3 text-sm text-slate-600">
          <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{data.event.date}{data.event.time ? ` · ${data.event.time}` : ""}</div>
          {data.event.venue && <div className="flex items-center gap-2"><MapPin className="h-4 w-4" />{data.event.venue}</div>}
        </div>
      </Card>
    </main>
  );
}
