"use client";
import { useState } from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import { Button, Field, Modal, inputCls, cx } from "@/components/ui";
import { api, useFetch } from "@/lib/api";
import type { Category, Participant } from "@/lib/types";

const shrink = (file: File, max = 1280): Promise<string> =>
  new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.85)); };
    img.onerror = () => rej(new Error("Could not read the photo."));
    img.src = url;
  });
const b64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("Could not read file.")); r.readAsDataURL(f); });

export default function EditParticipant({ p, eventId, onClose, onSaved }: { p: Participant; eventId: number | string; onClose: () => void; onSaved: (p: Participant) => void }) {
  const teacher = p.category?.kind === "teacher" || p.accompany_type === "guest" || (p as any).kind === "teacher";
  const { data: cats } = useFetch<Category[]>("/categories", { event_id: eventId });
  const { data: contacts } = useFetch<{ id: number; name: string }[]>(teacher ? "/contacts" : null, { event_id: eventId });
  const [f, setF] = useState({
    name: p.name, phone: p.phone, email: (p as any).email || "", institution: p.institution || "", place: p.place || "", instagram: p.instagram || "",
    category_id: String(p.category?.id || ""), food_pref: p.food_pref || "", accompany_type: p.accompany_type || "none", accompany_count: String(p.accompany_count || 1),
    contact_id: String((p as any).contact_id || ""), bio: p.bio || "",
  });
  const [photo, setPhoto] = useState(""); const [rmPhoto, setRmPhoto] = useState(false);
  const [doc, setDoc] = useState<{ name: string; data: string } | null>(null); const [rmDoc, setRmDoc] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));
  const kind = teacher ? "teacher" : "student";
  const save = async () => {
    setBusy(true); setErr("");
    try {
      const body: any = { ...f, category_id: Number(f.category_id) || undefined, contact_id: Number(f.contact_id) || 0, accompany_count: Number(f.accompany_count) };
      if (!teacher) delete body.contact_id;
      if (photo) body.photo = photo; if (rmPhoto && !photo) body.remove_photo = true;
      if (doc) body.profile = doc; if (rmDoc && !doc) body.remove_profile = true;
      onSaved(await api<Participant>(`/participants/${p.id}/update`, { method: "POST", body }));
      onClose();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Modal open onClose={onClose} title={`Edit ${teacher ? "teacher" : "student"} details`}>
      <div className="space-y-3">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><input className={inputCls} inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Email"><input className={inputCls} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label={teacher ? "College / institution" : "School / institution"}><input className={inputCls} value={f.institution} onChange={(e) => set("institution", e.target.value)} /></Field>
          <Field label="Place"><input className={inputCls} value={f.place} onChange={(e) => set("place", e.target.value)} /></Field>
        </div>
        <Field label="Category">
          <select className={inputCls} value={f.category_id} onChange={(e) => set("category_id", e.target.value)}>
            {(cats || []).filter((c) => c.kind === kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Food preference"><select className={inputCls} value={f.food_pref} onChange={(e) => set("food_pref", e.target.value)}><option value="">Not set</option><option value="veg">Veg</option><option value="nonveg">Non-veg</option></select></Field>
          <Field label="Instagram ID"><input className={inputCls} value={f.instagram} onChange={(e) => set("instagram", e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={teacher ? "Will anyone accompany?" : "Accompanied by"}>
            <select className={inputCls} value={f.accompany_type} onChange={(e) => set("accompany_type", e.target.value)}>
              <option value="none">{teacher ? "No" : "Attending alone"}</option>
              {teacher ? <option value="guest">Yes</option> : <><option value="friend">Friends</option><option value="guardian">Guardians</option></>}
            </select>
          </Field>
          {f.accompany_type !== "none" && <Field label="Persons (excluding you)"><select className={inputCls} value={f.accompany_count} onChange={(e) => set("accompany_count", e.target.value)}><option value="1">1 person</option><option value="2">2 persons</option></select></Field>}
        </div>
        {teacher && (
          <>
            <Field label="Point of contact"><select className={inputCls} value={f.contact_id} onChange={(e) => set("contact_id", e.target.value)}><option value="">None</option>{(contacts || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Short profile"><textarea className={cx(inputCls, "h-24 py-2")} maxLength={1500} value={f.bio} onChange={(e) => set("bio", e.target.value)} /></Field>
          </>
        )}
        <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3"><Camera className="h-4 w-4" />{photo ? "Photo selected" : p.has_photo && !rmPhoto ? "Replace photo" : "Add photo"}
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const fl = e.target.files?.[0]; if (fl) try { setPhoto(await shrink(fl)); setRmPhoto(false); } catch (x: any) { setErr(x.message); } }} /></label>
            {p.has_photo && !photo && <button type="button" className={cx("inline-flex items-center gap-1 text-xs", rmPhoto ? "text-slate-500" : "text-rose-600")} onClick={() => setRmPhoto(!rmPhoto)}><Trash2 className="h-3.5 w-3.5" />{rmPhoto ? "Undo remove" : "Remove photo"}</button>}
          </div>
          {teacher && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3"><Upload className="h-4 w-4" />{doc ? doc.name : p.profile_name && !rmDoc ? "Replace profile document" : "Add profile document"}
                <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={async (e) => { const fl = e.target.files?.[0]; if (fl) try { setDoc({ name: fl.name, data: await b64(fl) }); setRmDoc(false); } catch (x: any) { setErr(x.message); } }} /></label>
              {p.profile_name && !doc && <button type="button" className={cx("inline-flex items-center gap-1 text-xs", rmDoc ? "text-slate-500" : "text-rose-600")} onClick={() => setRmDoc(!rmDoc)}><Trash2 className="h-3.5 w-3.5" />{rmDoc ? "Undo remove" : "Remove document"}</button>}
            </div>
          )}
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" loading={busy} onClick={save}>Save changes</Button></div>
      </div>
    </Modal>
  );
}
