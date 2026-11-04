"use client";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useEvent } from "@/components/EventContext";
import ParticipantCard from "@/components/ParticipantCard";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner, fmtTime } from "@/components/ui";
import type { Participant } from "@/lib/types";

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { eventId, me } = useEvent();
  const { data, error, loading, reload, setData } = useFetch<Participant>(`/participants/${id}`);
  const [qr, setQr] = useState("");
  useEffect(() => { if (data?.token) QRCode.toDataURL(`${window.location.origin}/pass/${data.token}`, { width: 300, margin: 1 }).then(setQr); }, [data?.token]);
  const remove = async () => {
    if (!data || !confirm(`Delete ${data.name}? The registration, seat and WhatsApp history will be removed permanently.`)) return;
    try { await api(`/participants/${id}/delete`, { method: "POST", body: {} }); router.replace("/admin/participants"); }
    catch (e: any) { alert(e.message); }
  };
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error || "Not found"} onRetry={reload} />;
  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" className="mb-3" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /> Back</Button>
      <PageHeader title="Participant" actions={me?.manager ? <Button variant="secondary" size="sm" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</Button> : undefined} />
      <div className="grid gap-5 md:grid-cols-5">
        <div className="md:col-span-3">{eventId && <ParticipantCard p={data} eventId={eventId} manager={!!me?.manager} onChange={setData as any} />}</div>
        <div className="space-y-4 md:col-span-2">
          {qr && <Card className="p-4 text-center"><img src={qr} alt="QR" className="mx-auto w-44" /><a className="mt-2 block text-xs text-brand-600 underline" href={`/pass/${data.token}`} target="_blank">Open entry pass</a></Card>}
          <Card className="p-4 text-sm">
            <div className="mb-2 font-semibold">Details</div>
            <dl className="space-y-1.5 text-slate-600">
              <div className="flex justify-between"><dt>Registered</dt><dd>{fmtTime(data.create_date)}</dd></div>
              <div className="flex justify-between"><dt>Via</dt><dd>{data.registered_via}</dd></div>
              {data.claimed_category && <div className="flex justify-between"><dt>Chose</dt><dd>{data.claimed_category.name}</dd></div>}
              {data.expected && <div className="flex justify-between"><dt>Winners list</dt><dd>{data.expected.category}</dd></div>}
              {data.approved_by && <div className="flex justify-between"><dt>Approved by</dt><dd>{data.approved_by}</dd></div>}
              {data.hat_issued_on && <div className="flex justify-between"><dt>Hat issued</dt><dd>{fmtTime(data.hat_issued_on)}</dd></div>}
              {data.hat_returned_on && <div className="flex justify-between"><dt>Hat returned</dt><dd>{fmtTime(data.hat_returned_on)}</dd></div>}
            </dl>
          </Card>
          <Card className="p-4 text-sm">
            <div className="mb-2 font-semibold">WhatsApp</div>
            {!data.messages?.length ? <p className="text-slate-500">No messages yet.</p> : data.messages.map((m) => (
              <div key={m.id} className="border-t border-slate-100 py-1.5 first:border-0">
                <div className="flex items-center justify-between">
                  <span>{m.type === "confirm" ? "Confirmation" : "Seat"}<span className="ml-2 text-xs text-slate-400">{fmtTime(m.created)}</span></span>
                  <Badge tone={m.state === "sent" ? "green" : m.state === "failed" ? "red" : "blue"}>{m.state}</Badge>
                </div>
                {m.error && <p className="mt-1 break-words rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{m.error}</p>}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
