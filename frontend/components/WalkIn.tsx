"use client";
import { useState } from "react";
import { api, useFetch } from "@/lib/api";
import { Button, Field, Modal, inputCls, useToast } from "@/components/ui";
import type { Category, Participant } from "@/lib/types";

export default function WalkIn({ open, onClose, eventId, onDone }: { open: boolean; onClose: () => void; eventId: number; onDone: (p: Participant) => void }) {
  const toast = useToast();
  const { data: cats } = useFetch<Category[]>(open ? "/categories" : null, { event_id: eventId });
  const [f, setF] = useState({ name: "", phone: "", place: "", category_id: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api<Participant>("/participants/create", { method: "POST", body: { ...f, event_id: eventId, via: "desk" } });
      toast("Registered");
      setF({ name: "", phone: "", place: "", category_id: "" });
      onDone(p);
      onClose();
    } catch (e: any) { toast(e.message, "err"); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="On-spot registration">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="WhatsApp number"><input className={inputCls} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required /></Field>
        <Field label="Category">
          <select className={inputCls} value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })} required>
            <option value="">Select…</option>
            {(cats || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}
          </select>
        </Field>
        <Field label="Place / institution"><input className={inputCls} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} /></Field>
        <Button size="lg" className="w-full" loading={busy}>Register &amp; continue</Button>
      </form>
    </Modal>
  );
}
