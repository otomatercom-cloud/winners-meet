"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEvent } from "@/components/EventContext";
import { api, useFetch } from "@/lib/api";
import { Badge, Button, Card, CategoryChip, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Toggle, inputCls, useToast } from "@/components/ui";
import type { Block, Category, Course, KitItem } from "@/lib/types";

export default function Setup() {
  const { eventId, me } = useEvent();
  const toast = useToast();
  const cats = useFetch<Category[]>(eventId ? "/categories" : null, { event_id: eventId });
  const courses = useFetch<Course[]>(eventId ? "/courses" : null, { event_id: eventId });
  const items = useFetch<KitItem[]>(eventId ? "/items" : null, { event_id: eventId });
  const [itm, setItm] = useState<any>(null);
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
    try { await api(path, { method: "POST", body: { ...body, event_id: eventId } }); toast("Saved"); done(); reload(); blocks.reload(); cats.reload(); courses.reload(); items.reload(); }
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
  const newCat = { name: "", course_id: "", kind: "student", color: "#4f46e5", item_ids: [], seat_block_id: "", seat_from: 0, seat_to: 0, seat_mode: "auto", self_select: true };
  const newBlk = { name: "", prefix: "S", start_no: 1, end_no: 100, row_size: 0, row_layout: "", sequence: 10 };
  return (
    <div className="space-y-8">
      <section>
        <PageHeader title="Kit items" subtitle="Convocation hat, shawl... Enter how many pieces you have. Issued at check-in, returned later."
          actions={<Button size="sm" onClick={() => setItm({ name: "", quantity: 0 })}><Plus className="h-4 w-4" /> Item</Button>} />
        {!items.data?.length ? <Empty>No kit items yet. Add Hat, Shawl… (optional)</Empty> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.data.map((i) => (
              <Card key={i.id} className="p-4">
                <div className="flex items-start justify-between"><div><div className="font-semibold">{i.name}</div><div className="text-sm text-slate-500">Stock {i.quantity} · with people {i.out} · available {i.available}</div></div><button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setItm({ ...i })}><Pencil className="h-4 w-4" /></button></div>
                <button className="mt-3 text-xs text-slate-400 hover:text-rose-600" onClick={async () => { if (!confirm("Delete this item?")) return; try { await api("/items/delete", { method: "POST", body: { id: i.id } }); items.reload(); } catch (e: any) { toast(e.message, "err"); } }}>Delete</button>
              </Card>
            ))}
          </div>
        )}
      </section>
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
        <PageHeader title="Winner categories" subtitle="Each subcategory (under a course) decides the seat block, which kit items are given, and how the seat is assigned at check-in."
          actions={<Button size="sm" onClick={() => setCat(newCat)}><Plus className="h-4 w-4" /> Category</Button>} />
        {!cats.data?.length ? <Empty>No categories yet. Add Gold, Silver, Teacher…</Empty> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {cats.data.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between"><CategoryChip name={c.name} color={c.color} /><div className="flex gap-1"><button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setCat({ ...c, name: c.sub, course_id: c.course_id || "", seat_block_id: c.seat_block_id || "", seat_from: c.seat_from || 0, seat_to: c.seat_to || 0 })}><Pencil className="h-4 w-4" /></button></div></div>
                <div className="mt-3 flex flex-wrap gap-1.5"><Badge tone="violet">{c.kind}</Badge>{c.items?.map((i) => <Badge key={i.id} tone="amber">{i.name}</Badge>)}<Badge tone="blue">{c.seat_block || "no block"}</Badge><Badge>{c.seat_mode === "auto" ? "auto seat" : "manual seat"}</Badge>{!c.self_select && <Badge>admin only</Badge>}</div>
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
                <div className="flex items-start justify-between"><div><div className="font-semibold">{b.name}</div><div className="text-sm text-slate-500">{b.prefix}{b.start_no} – {b.prefix}{b.end_no}</div></div><div className="flex"><button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setBlk({ ...b })}><Pencil className="h-4 w-4" /></button><button className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete block" onClick={async () => { if (!confirm(`Delete block "${b.name}" and its ${b.total} seats?`)) return; try { await api("/blocks/delete", { method: "POST", body: { id: b.id } }); toast("Block deleted"); blocks.reload(); } catch (e: any) { toast(e.message, "err"); } }}><Trash2 className="h-4 w-4" /></button></div></div>
                <div className="mt-3 text-sm text-slate-600">{b.row_layout ? `${b.row_layout.split(",").join(" | ")} per row · ` : b.row_size ? `${b.row_size} per row · ` : ""}{b.total} seats · {b.occupied} occupied · {b.free} free</div>
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
            {cat.seat_block_id && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Seats from (optional)" hint="Use only part of the block, e.g. 469 to 473."><input type="number" min={0} className={inputCls} value={cat.seat_from || ""} onChange={(e) => setCat({ ...cat, seat_from: e.target.value })} placeholder="start" /></Field>
                <Field label="Seats to"><input type="number" min={0} className={inputCls} value={cat.seat_to || ""} onChange={(e) => setCat({ ...cat, seat_to: e.target.value })} placeholder="end" /></Field>
              </div>
            )}
            <Field label="Seat assignment" hint="Automatic gives the next free seat of the block at check-in."><select className={inputCls} value={cat.seat_mode} onChange={(e) => setCat({ ...cat, seat_mode: e.target.value })}><option value="auto">Automatic (next free seat)</option><option value="manual">Manual (desk picks the seat)</option></select></Field>
            <Field label="Kit items given at check-in" hint="Collected back later. Add items in the Kit items section above.">
              <div className="flex flex-wrap gap-2">
                {(items.data || []).length === 0 && <span className="text-xs text-slate-400">No kit items yet.</span>}
                {(items.data || []).map((i) => { const on = (cat.item_ids || []).includes(i.id); return (
                  <button type="button" key={i.id} onClick={() => setCat({ ...cat, item_ids: on ? cat.item_ids.filter((x: number) => x !== i.id) : [...(cat.item_ids || []), i.id] })}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 bg-white text-slate-600"}`}>{on ? "✓ " : ""}{i.name}</button>
                ); })}
              </div>
            </Field>
            <Toggle label="Students can choose this on the registration form" checked={cat.self_select} onChange={(v) => setCat({ ...cat, self_select: v })} />
            <Button size="lg" className="w-full" loading={busy}>Save category</Button>
          </form>
        )}
      </Modal>
      <Modal open={!!itm} onClose={() => setItm(null)} title={itm?.id ? "Edit item" : "New kit item"}>
        {itm && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save("/items/save", itm, () => setItm(null), items.reload); }}>
            <Field label="Item name"><input className={inputCls} value={itm.name} onChange={(e) => setItm({ ...itm, name: e.target.value })} placeholder="Convocation hat" required /></Field>
            <Field label="Stock quantity" hint="Total pieces you have in hand."><input type="number" min={0} className={inputCls} value={itm.quantity} onChange={(e) => setItm({ ...itm, quantity: e.target.value })} required /></Field>
            <Button size="lg" className="w-full" loading={busy}>Save item</Button>
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
            <Field label="Theatre row layout (optional)" hint="Sections of each row, left to right, with an aisle between. Example: 13,13 (left 13 · gap · right 13) or 7,13,7 for a balcony. Overrides seats per row."><input className={inputCls} value={blk.row_layout || ""} onChange={(e) => setBlk({ ...blk, row_layout: e.target.value })} placeholder="13,13" /></Field>
            <Field label="Display order" hint="Smaller number shows first on the seat map (e.g. stalls 10, balcony 20)."><input type="number" className={inputCls} value={blk.sequence ?? 10} onChange={(e) => setBlk({ ...blk, sequence: e.target.value })} /></Field>
            <Field label="Seats per row (optional)" hint="Example: 14 means seats 1-14 are Row 1, 15-28 are Row 2... Leave 0 for no rows."><input type="number" min={0} max={500} className={inputCls} value={blk.row_size} onChange={(e) => setBlk({ ...blk, row_size: e.target.value })} /></Field>
            {Number(blk.row_size) > 0 && (() => { const total = Math.max(0, Number(blk.end_no) - Number(blk.start_no) + 1), rs = Number(blk.row_size), rows = Math.ceil(total / rs), last = total - (rows - 1) * rs; return <p className="text-xs text-violet-700">{rows} rows: {rows > 1 ? `${rows - 1} full rows of ${rs}` : ""}{rows > 1 ? ", last row has " : "one row of "}{last} seats</p>; })()}
            <p className="text-xs text-slate-500">Preview: {blk.prefix}{blk.start_no} … {blk.prefix}{blk.end_no} ({Math.max(0, Number(blk.end_no) - Number(blk.start_no) + 1)} seats)</p>
            <Button size="lg" className="w-full" loading={busy}>Save block</Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
