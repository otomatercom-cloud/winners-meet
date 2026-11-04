"use client";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useEvent } from "@/components/EventContext";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, Card, CategoryChip, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Toggle, inputCls, useToast } from "@/components/ui";
import type { Block, Category, Course } from "@/lib/types";

export default function Setup() {
  const { eventId, me } = useEvent();
  const toast = useToast();
  const cats = useFetch<Category[]>(eventId ? "/categories" : null, { event_id: eventId });
  const courses = useFetch<Course[]>(eventId ? "/courses" : null, { event_id: eventId });
  const [crs, setCrs] = useState<any>(null);
  const blocks = useFetch<Block[]>(eventId ? "/blocks" : null, { event_id: eventId });
  const [cat, setCat] = useState<any>(null);
  const [blk, setBlk] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  if (!me?.manager) return <Empty>Administrators only.</Empty>;
  if (!eventId) return <Empty>Create an event first.</Empty>;
  if ((cats.loading && !cats.data) || (blocks.loading && !blocks.data)) return <Spinner />;
  if (cats.error && !cats.data) return <ErrorBox message={cats.error} onRetry={cats.reload} />;

  const save = async (path: string, body: any, done: () => void, reload: () => void) => {
    setBusy(true);
    try { await api(path, { method: "POST", body: { ...body, event_id: eventId } }); toast("Saved"); done(); reload(); blocks.reload(); cats.reload(); courses.reload(); }
    catch (e: any) { toast(e.message, "err"); }
    setBusy(false);
  };
  const del = async (id: number) => {
    if (!confirm("Delete this category?")) return;
    try { await api("/categories/delete", { method: "POST", body: { id } }); cats.reload(); } catch (e: any) { toast(e.message, "err"); }
  };
  const delCourse = async (id: number) => {
    if (!confirm("Delete this course?")) return;
    try { await api("/courses/delete", { method: "POST", body: { id } }); courses.reload(); } catch (e: any) { toast(e.message, "err"); }
  };
  const newCat = { name: "", course_id: "", kind: "student", color: "#4f46e5", hat: false, hat_label: "", seat_block_id: "", seat_mode: "auto", self_select: true };
  const newBlk = { name: "", prefix: "S", start_no: 1, end_no: 100 };
  return (
    <div className="space-y-8">
      <section>
        <PageHeader title="Courses" subtitle="Students pick a course first, then a winner subcategory of that course."
          actions={<Button size="sm" onClick={() => setCrs({ name: "", code: "" })}><Plus className="h-4 w-4" /> Course</Button>} />
        {!courses.data?.length ? <Empty>No courses yet. Add CPA USA, ACCA… (optional)</Empty> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courses.data.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between"><div><div className="font-semibold">{c.name}</div><div className="text-sm text-slate-500">{c.subs} subcategories</div></div><button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setCrs({ ...c })}><Pencil className="h-4 w-4" /></button></div>
                <button className="mt-3 text-xs text-slate-400 hover:text-rose-600" onClick={() => delCourse(c.id)}>Delete</button>
              </Card>
            ))}
          </div>
        )}
      </section>
      <section>
        <PageHeader title="Winner categories" subtitle="Each subcategory (under a course) decides the seat block, whether a hat is given, and how the seat is assigned at check-in."
          actions={<Button size="sm" onClick={() => setCat(newCat)}><Plus className="h-4 w-4" /> Category</Button>} />
        {!cats.data?.length ? <Empty>No categories yet. Add Gold, Silver, Teacher…</Empty> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {cats.data.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between"><CategoryChip name={c.name} color={c.color} /><div className="flex gap-1"><button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setCat({ ...c, name: c.sub, course_id: c.course_id || "", seat_block_id: c.seat_block_id || "" })}><Pencil className="h-4 w-4" /></button></div></div>
                <div className="mt-3 flex flex-wrap gap-1.5"><Badge tone="violet">{c.kind}</Badge>{c.hat && <Badge tone="amber">Hat{c.hat_label ? `: ${c.hat_label}` : ""}</Badge>}<Badge tone="blue">{c.seat_block || "no block"}</Badge><Badge>{c.seat_mode === "auto" ? "auto seat" : "manual seat"}</Badge>{!c.self_select && <Badge>admin only</Badge>}</div>
                <button className="mt-3 text-xs text-slate-400 hover:text-rose-600" onClick={() => del(c.id)}>Delete</button>
              </Card>
            ))}
          </div>
        )}
      </section>
      <section>
        <PageHeader title="Seat blocks" subtitle="Give a start and end seat; every seat is created automatically."
          actions={<Button size="sm" onClick={() => setBlk(newBlk)}><Plus className="h-4 w-4" /> Block</Button>} />
        {!blocks.data?.length ? <Empty>No seat blocks yet.</Empty> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {blocks.data.map((b) => (
              <Card key={b.id} className="p-4">
                <div className="flex items-start justify-between"><div><div className="font-semibold">{b.name}</div><div className="text-sm text-slate-500">{b.prefix}{b.start_no} – {b.prefix}{b.end_no}</div></div><button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setBlk({ ...b })}><Pencil className="h-4 w-4" /></button></div>
                <div className="mt-3 text-sm text-slate-600">{b.total} seats · {b.occupied} occupied · {b.free} free</div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Modal open={!!cat} onClose={() => setCat(null)} title={cat?.id ? "Edit category" : "New category"}>
        {cat && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save("/categories/save", cat, () => setCat(null), cats.reload); }}>
            {cat.kind === "student" && <Field label="Course"><select className={inputCls} value={cat.course_id} onChange={(e) => setCat({ ...cat, course_id: e.target.value })}><option value="">— no course —</option>{(courses.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
            <Field label="Subcategory name"><input className={inputCls} value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="For"><select className={inputCls} value={cat.kind} onChange={(e) => setCat({ ...cat, kind: e.target.value })}><option value="student">Students</option><option value="teacher">Teachers</option></select></Field>
              <Field label="Colour"><input type="color" className={inputCls + " p-1"} value={cat.color} onChange={(e) => setCat({ ...cat, color: e.target.value })} /></Field>
            </div>
            <Field label="Seat block"><select className={inputCls} value={cat.seat_block_id} onChange={(e) => setCat({ ...cat, seat_block_id: e.target.value })}><option value="">— none —</option>{(blocks.data || []).map((b) => <option key={b.id} value={b.id}>{b.name} ({b.prefix}{b.start_no}–{b.end_no})</option>)}</select></Field>
            <Field label="Seat assignment" hint="Automatic gives the next free seat of the block at check-in."><select className={inputCls} value={cat.seat_mode} onChange={(e) => setCat({ ...cat, seat_mode: e.target.value })}><option value="auto">Automatic (next free seat)</option><option value="manual">Manual (desk picks the seat)</option></select></Field>
            <Toggle label="Gets a hat (issued automatically at check-in)" checked={cat.hat} onChange={(v) => setCat({ ...cat, hat: v })} />
            {cat.hat && <Field label="Hat type (optional)"><input className={inputCls} value={cat.hat_label} onChange={(e) => setCat({ ...cat, hat_label: e.target.value })} placeholder="e.g. Gold hat" /></Field>}
            <Toggle label="Students can choose this on the registration form" checked={cat.self_select} onChange={(v) => setCat({ ...cat, self_select: v })} />
            <Button size="lg" className="w-full" loading={busy}>Save category</Button>
          </form>
        )}
      </Modal>
      <Modal open={!!crs} onClose={() => setCrs(null)} title={crs?.id ? "Edit course" : "New course"}>
        {crs && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save("/courses/save", crs, () => setCrs(null), courses.reload); }}>
            <Field label="Course name"><input className={inputCls} value={crs.name} onChange={(e) => setCrs({ ...crs, name: e.target.value })} placeholder="CPA USA" required /></Field>
            <Field label="Code (optional)"><input className={inputCls} value={crs.code} onChange={(e) => setCrs({ ...crs, code: e.target.value })} /></Field>
            <Button size="lg" className="w-full" loading={busy}>Save course</Button>
          </form>
        )}
      </Modal>
      <Modal open={!!blk} onClose={() => setBlk(null)} title={blk?.id ? "Edit block" : "New seat block"}>
        {blk && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save("/blocks/save", blk, () => setBlk(null), blocks.reload); }}>
            <Field label="Block name"><input className={inputCls} value={blk.name} onChange={(e) => setBlk({ ...blk, name: e.target.value })} placeholder="Gold winners" required /></Field>
            <Field label="Seat prefix" hint="Seat label = prefix + number, e.g. G45"><input className={inputCls} value={blk.prefix} onChange={(e) => setBlk({ ...blk, prefix: e.target.value })} required maxLength={6} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start seat"><input type="number" min={0} className={inputCls} value={blk.start_no} onChange={(e) => setBlk({ ...blk, start_no: e.target.value })} required /></Field>
              <Field label="End seat"><input type="number" min={0} className={inputCls} value={blk.end_no} onChange={(e) => setBlk({ ...blk, end_no: e.target.value })} required /></Field>
            </div>
            <p className="text-xs text-slate-500">Preview: {blk.prefix}{blk.start_no} … {blk.prefix}{blk.end_no} ({Math.max(0, Number(blk.end_no) - Number(blk.start_no) + 1)} seats)</p>
            <Button size="lg" className="w-full" loading={busy}>Save block</Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
