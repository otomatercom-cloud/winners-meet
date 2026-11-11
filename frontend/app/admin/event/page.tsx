"use client";
import { useEffect, useState } from "react";
import { Copy, Plus } from "lucide-react";
import { useEvent } from "@/components/EventContext";
import { api, useFetch } from "@/lib/api";
import { Button, Card, Empty, Field, PageHeader, Toggle, inputCls, useToast } from "@/components/ui";
import type { EventInfo } from "@/lib/types";

const blank: any = { name: "", date: new Date().toISOString().slice(0, 10), time: "", venue: "", state: "draft", reg_student_open: true, reg_teacher_open: true, teacher_needs_approval: false, frontend_url: "", frontend_url_teacher: "", wa_seat_hat_param: false, form_student: { place: "optional", institution: "off", email: "off", photo: "off", food_pref: "off", accompany: "optional", instagram: "required" }, form_teacher: { place: "off", institution: "optional", email: "off", photo: "required", food_pref: "required", accompany: "off", instagram: "off" }, wa_tpl_confirm: "", wa_tpl_seat: "", wa_msg_confirm: "", wa_msg_seat: "", wa_tpl_confirm_teacher: "", wa_tpl_seat_teacher: "", wa_msg_confirm_teacher: "", wa_msg_seat_teacher: "" };

export default function EventSettings() {
  const { event, me, reloadEvents, setEventId } = useEvent();
  const toast = useToast();
  const [f, setF] = useState<any>(event || blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(event || blank); }, [event?.id]);
  if (!me?.manager) return <Empty>Administrators only.</Empty>;
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const save = async () => {
    setBusy(true);
    try {
      const saved = await api<EventInfo>("/events/save", { method: "POST", body: f });
      await reloadEvents();
      setEventId(saved.id);
      toast("Event saved");
    } catch (e: any) { toast(e.message, "err"); }
    setBusy(false);
  };
  const copy = (t: string) => { navigator.clipboard?.writeText(t); toast("Link copied"); };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={f.id ? "Event settings" : "New event"} actions={f.id ? <Button size="sm" variant="secondary" onClick={() => setF(blank)}><Plus className="h-4 w-4" /> New event</Button> : undefined} />
      <Card className="mb-5 space-y-4 p-5">
        <Field label="Event name"><input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Public URL name" hint="Used in links: /e/<name>/register. Leave blank to auto-generate."><input className={inputCls} value={f.slug || ""} onChange={(e) => set("slug", e.target.value)} placeholder="winners-meet-2026" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date"><input type="date" className={inputCls} value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
          <Field label="Time"><input className={inputCls} value={f.time} onChange={(e) => set("time", e.target.value)} placeholder="9:30 AM" /></Field>
          <Field label="Status"><select className={inputCls} value={f.state} onChange={(e) => set("state", e.target.value)}><option value="draft">Draft</option><option value="open">Open for registration</option><option value="closed">Closed</option></select></Field>
        </div>
        <Field label="Venue"><input className={inputCls} value={f.venue} onChange={(e) => set("venue", e.target.value)} /></Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle label="Student registration open" checked={f.reg_student_open} onChange={(v) => set("reg_student_open", v)} />
          <Toggle label="Teacher registration open" checked={f.reg_teacher_open} onChange={(v) => set("reg_teacher_open", v)} />
        </div>
        <Toggle label="Teachers need admin approval (off = auto-approved)" checked={f.teacher_needs_approval} onChange={(v) => set("teacher_needs_approval", v)} />
      </Card>
      <Card className="mb-5 p-5">
        <h3 className="font-semibold">Registration form fields</h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">Name and WhatsApp number are always asked. Choose what else each form shows. Students also always choose course / category.</p>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5 pr-3">Field</th><th className="px-2">Students</th><th className="px-2">Teachers</th></tr></thead><tbody className="divide-y divide-slate-100">
          {([["place", "Place"], ["institution", "School / institution"], ["email", "Email"], ["photo", "Photo"], ["food_pref", "Food preference (veg / non-veg)"], ["accompany", "Coming with (students: friend / guardian, teachers: any guests)"], ["instagram", "Instagram ID (to tag in photos)"], ["profile", "Profile document upload (Word / PDF)"], ["contact", "Point of contact (Marketing Manager)"], ["bio", "Short profile (written paragraph)"], ["profile_either", "Profile: paragraph OR document, one of the two required"]] as const).map(([k, label]) => (
            <tr key={k}><td className="py-2 pr-3">{label}</td>
              {(["form_student", "form_teacher"] as const).map((fk) => (
                <td key={fk} className="px-2 py-1.5"><select className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm" value={f[fk]?.[k] || "off"} onChange={(e) => set(fk, { ...f[fk], [k]: e.target.value })}>
                  <option value="off">Hidden</option><option value="optional">Optional</option>{k !== "accompany" && <option value="required">Required</option>}
                </select></td>
              ))}
            </tr>
          ))}
        </tbody></table></div>
      </Card>
      <Card className="mb-5 space-y-4 p-5">
        <h3 className="font-semibold">WhatsApp - Students</h3>
        <Field label="Student pass link website URL" hint="Entry-pass links sent to students use this. Example: https://meet.logiceducation.org"><input className={inputCls} value={f.frontend_url} onChange={(e) => set("frontend_url", e.target.value)} placeholder={origin} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Confirmation template name" hint="Params: 1 name, 2 event, 3 date, 4 venue, 5 pass link"><input className={inputCls} value={f.wa_tpl_confirm} onChange={(e) => set("wa_tpl_confirm", e.target.value)} /></Field>
          <Field label="Seat template name" hint="Params: 1 name, 2 seat, 3 event, 4 pass link (5 variables if hat note is on)"><input className={inputCls} value={f.wa_tpl_seat} onChange={(e) => set("wa_tpl_seat", e.target.value)} /></Field>
        </div>
        <Toggle label="Seat template has a hat-note variable (5 variables). Off = 4 variables: name, seat, event, link" checked={!!f.wa_seat_hat_param} onChange={(v) => set("wa_seat_hat_param", v)} />
        <Field label="Confirmation text (used when no template)" hint="{name} {event} {date} {venue} {link}"><textarea className={inputCls + " h-20 py-2"} value={f.wa_msg_confirm} onChange={(e) => set("wa_msg_confirm", e.target.value)} /></Field>
        <Field label="Seat text (used when no template)" hint="{name} {event} {seat} {hat} {link}"><textarea className={inputCls + " h-20 py-2"} value={f.wa_msg_seat} onChange={(e) => set("wa_msg_seat", e.target.value)} /></Field>
      </Card>
      <Card className="mb-5 space-y-4 p-5">
        <h3 className="font-semibold">WhatsApp - Teachers</h3>
        <Field label="Teacher pass link website URL" hint="Optional. Leave blank to use the student URL."><input className={inputCls} value={f.frontend_url_teacher} onChange={(e) => set("frontend_url_teacher", e.target.value)} placeholder={f.frontend_url || origin} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Confirmation template name" hint="Blank = use the student template"><input className={inputCls} value={f.wa_tpl_confirm_teacher} onChange={(e) => set("wa_tpl_confirm_teacher", e.target.value)} /></Field>
          <Field label="Seat template name" hint="Blank = use the student template"><input className={inputCls} value={f.wa_tpl_seat_teacher} onChange={(e) => set("wa_tpl_seat_teacher", e.target.value)} /></Field>
        </div>
        <Field label="Confirmation text (used when no template)" hint="{name} {event} {date} {venue} {link}"><textarea className={inputCls + " h-20 py-2"} value={f.wa_msg_confirm_teacher} onChange={(e) => set("wa_msg_confirm_teacher", e.target.value)} /></Field>
        <Field label="Seat text (used when no template)" hint="{name} {event} {seat} {hat} {link}"><textarea className={inputCls + " h-20 py-2"} value={f.wa_msg_seat_teacher} onChange={(e) => set("wa_msg_seat_teacher", e.target.value)} /></Field>
      </Card>
      <Card className="mb-5 space-y-4 p-5">
        <h3 className="font-semibold">WhatsApp - Stage staff</h3>
        <p className="text-xs text-slate-500">Registered staff numbers get a message when a category's announcement is complete and when someone arrives after their category was announced. Utility templates; blank name = plain text.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category complete template" hint="Params: 1 category, 2 collected, 3 moved to Missed, 4 event"><input className={inputCls} value={f.wa_tpl_stage_done || ""} onChange={(e) => set("wa_tpl_stage_done", e.target.value)} /></Field>
          <Field label="Late arrival template" hint="Params: 1 name, 2 category, 3 event"><input className={inputCls} value={f.wa_tpl_stage_late || ""} onChange={(e) => set("wa_tpl_stage_late", e.target.value)} /></Field>
        </div>
        {f.id && <StaffContacts eventId={f.id} />}
        {!f.id && <p className="text-xs text-slate-500">Save the event first, then add staff numbers.</p>}
      </Card>
      <Card className="mb-5 space-y-3 p-5">
        <h3 className="font-semibold">Marketing Managers (teacher point of contact)</h3>
        <p className="text-xs text-slate-500">Teachers pick one of these on their registration form. Turn the field on, optional or required in "Registration form fields" above. The form hides it while this list is empty.</p>
        {f.id ? <MarketingManagers eventId={f.id} /> : <p className="text-xs text-slate-500">Save the event first, then add Marketing Managers.</p>}
      </Card>
      <Button size="lg" className="w-full sm:w-auto" loading={busy} onClick={save}>Save event</Button>
      {f.id && (
        <Card className="mt-6 space-y-2 p-5 text-sm">
          <h3 className="font-semibold">Share these links</h3>
          {[["Student registration", `${f.frontend_url || origin}/e/${f.slug}/register`], ["Event page (all links)", `${f.frontend_url || origin}/e/${f.slug}`], ["Teacher registration", `${f.frontend_url_teacher || f.frontend_url || origin}/e/${f.slug}/register/teacher`]].map(([l, u]) => (
            <div key={l} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"><div className="min-w-0"><div className="text-xs text-slate-500">{l}</div><div className="truncate">{u}</div></div><Button size="sm" variant="secondary" onClick={() => copy(u)}><Copy className="h-4 w-4" /></Button></div>
          ))}
        </Card>
      )}
    </div>
  );
}

function MarketingManagers({ eventId }: { eventId: number }) {
  const toast = useToast();
  const { data, reload } = useFetch<any[]>("/contacts", { event_id: eventId });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try { await api("/contacts/save", { method: "POST", body: { event_id: eventId, name, phone } }); setName(""); setPhone(""); reload(); toast("Added"); }
    catch (e: any) { toast(e.message, "err"); }
    setBusy(false);
  };
  const del = async (id: number) => { try { await api("/contacts/delete", { method: "POST", body: { id } }); reload(); } catch (e: any) { toast(e.message, "err"); } };
  return (
    <div>
      <div className="space-y-1.5">{(data || []).map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{s.name}{s.phone ? ` · ${s.phone}` : ""} <span className="text-xs text-slate-400">· {s.teachers} teacher{s.teachers === 1 ? "" : "s"}</span></span><button className="text-xs text-slate-400 hover:text-rose-600" onClick={() => del(s.id)}>Remove</button></div>
      ))}</div>
      <div className="mt-2 flex gap-2"><input className={inputCls} placeholder="Marketing Manager name" value={name} onChange={(e) => setName(e.target.value)} /><input className={inputCls} placeholder="Phone (optional)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /><Button disabled={!name} loading={busy} onClick={add}>Add</Button></div>
    </div>
  );
}

function StaffContacts({ eventId }: { eventId: number }) {
  const toast = useToast();
  const { data, reload } = useFetch<any[]>("/staff-contacts", { event_id: eventId });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try { await api("/staff-contacts/save", { method: "POST", body: { event_id: eventId, name, phone } }); setName(""); setPhone(""); reload(); toast("Added"); }
    catch (e: any) { toast(e.message, "err"); }
    setBusy(false);
  };
  const del = async (id: number) => { try { await api("/staff-contacts/delete", { method: "POST", body: { id } }); reload(); } catch (e: any) { toast(e.message, "err"); } };
  return (
    <div>
      <div className="space-y-1.5">{(data || []).map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{s.name} · {s.phone}</span><button className="text-xs text-slate-400 hover:text-rose-600" onClick={() => del(s.id)}>Remove</button></div>
      ))}</div>
      <div className="mt-2 flex gap-2"><input className={inputCls} placeholder="Staff name" value={name} onChange={(e) => setName(e.target.value)} /><input className={inputCls} placeholder="WhatsApp number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /><Button disabled={!name || !phone} loading={busy} onClick={add}>Add</Button></div>
    </div>
  );
}
