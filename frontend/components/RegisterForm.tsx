"use client";
import { useState } from "react";
import Link from "next/link";
import { Camera, CheckCircle2, Clock, FileText, Trophy } from "lucide-react";
import { api, useFetch } from "@/lib/api";
import { Button, Card, Field, Spinner, cx, inputCls } from "@/components/ui";

/** Shrink a chosen photo in the browser (max 600px JPEG) so uploads stay small and fast on mobile data. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 600, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

/** Largest profile file the browser accepts. Keep it under the nginx client_max_body_size (default 1 MB, base64 adds 33%). */
const PROFILE_MAX_KB = Number(process.env.NEXT_PUBLIC_PROFILE_MAX_KB) || 700;

function Section({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-1 border-b border-slate-100 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 first:mt-0 sm:col-span-2">{children}</h2>;
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[][] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(([v, l]) => (
        <button type="button" key={v} data-on={value === v ? "1" : undefined} onClick={() => onChange(v)} className={cx("h-10 rounded-lg border text-sm font-medium transition", value === v ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400")}>{l}</button>
      ))}
    </div>
  );
}

export default function RegisterForm({ kind, slug }: { kind: "student" | "teacher"; slug?: string }) {
  const { data, loading } = useFetch<any>("/public/event", slug ? { slug } : undefined);
  const [f, setF] = useState({ name: "", phone: "", place: "", institution: "", category_id: "", course_id: "", website: "", email: "", food_pref: "", instagram: "", accompany_type: "none", accompany_count: "", photo: "", contact_id: "", bio: "" });
  const [profile, setProfile] = useState<{ name: string; data: string } | null>(null);
  const [profileErr, setProfileErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<any>(null);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const ev = data?.event;
  const allCats: { id: number; name: string; color: string; course_id: number | false }[] = (kind === "student" ? data?.student_categories : data?.teacher_categories) || [];
  const courses: { id: number; name: string }[] = kind === "student" ? data?.courses || [] : [];
  const cats = courses.length && kind === "student" ? allCats.filter((c) => String(c.course_id) === f.course_id) : allCats;
  const cfg = (data?.form?.[kind] || {}) as Record<string, string>;
  const on = (k: string) => (cfg[k] || "off") !== "off";
  const req = (k: string) => cfg[k] === "required";
  const open = ev && (kind === "student" ? ev.reg_student_open : ev.reg_teacher_open);

  const pickPhoto = async (file?: File) => {
    if (!file) return;
    try { set("photo", await shrink(file)); setErr(""); } catch { setErr("Could not read that photo. Please choose a JPG or PNG image."); }
  };
  const pickProfile = (file?: File) => {
    if (!file) return;
    setProfileErr("");
    if (!/\.(pdf|docx?)$/i.test(file.name)) { setProfileErr("Please upload the profile as a PDF or Word file (.pdf, .doc, .docx)."); return; }
    if (file.size > PROFILE_MAX_KB * 1024) { setProfileErr(`This file is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please upload a smaller Word / PDF file, maximum ${PROFILE_MAX_KB >= 1024 ? (PROFILE_MAX_KB / 1024).toFixed(0) + " MB" : PROFILE_MAX_KB + " KB"}.`); return; }
    const rd = new FileReader();
    rd.onload = () => { setProfile({ name: file.name, data: String(rd.result).split(",")[1] || "" }); setErr(""); setProfileErr(""); };
    rd.onerror = () => setProfileErr("Could not read that file. Please try again.");
    rd.readAsDataURL(file);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (req("photo") && !f.photo) { setErr("Please upload your photo."); return; }
    if (req("profile_either") && (on("bio") || on("profile")) && !f.bio.trim() && !profile) { setErr("Please write a short profile or upload a profile document (one of the two is enough)."); return; }
    if (req("profile") && !profile) { setErr("Please upload your short profile (Word or PDF)."); return; }
    if (req("food_pref") && !f.food_pref) { setErr("Please choose your food preference."); return; }
    setBusy(true);
    setErr("");
    try {
      const catId = f.category_id || (cats.length === 1 ? String(cats[0].id) : "");
      setDone(await api("/public/register", { method: "POST", body: { ...f, category_id: catId, kind, event_id: ev.id, profile_file: profile } }));
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };

  if (loading) return <Spinner />;
  return (
    <div className="wm-reg">
    <main className="relative z-10 mx-auto min-h-screen max-w-2xl px-4 py-8">
      <Link href={slug ? `/e/${slug}` : "/"} className="mb-5 inline-flex items-center gap-2 text-sm text-slate-500"><Trophy className="h-4 w-4" /> {ev?.name || "Winners Meet"}</Link>
      {!ev && data?.events?.length ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-slate-500">Choose your event to register</p>
          {data.events.map((e: any) => (
            <Link key={e.slug} href={`/e/${e.slug}/register${kind === "teacher" ? "/teacher" : ""}`} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-500">
              <div className="text-lg font-semibold">{e.name}</div>
              <div className="mt-1 text-sm text-slate-500">{e.date}{e.venue ? ` · ${e.venue}` : ""}</div>
            </Link>
          ))}
        </div>
      ) : !ev || !open ? (
        <Card className="p-6 text-center text-slate-600">Registration is closed right now.</Card>
      ) : done ? (
        <Card className="wm-card p-8 text-center">
          <img src="/logo.png" alt="Logic School of Management" className="mx-auto mb-5 h-12 w-auto rounded" />
          {done.approval_state === "approved" ? <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" /> : <Clock className="mx-auto mb-3 h-12 w-12 text-amber-500" />}
          <h2 className="text-xl font-semibold">{done.already ? "Already registered" : done.approval_state === "approved" ? "You are registered!" : "Registration received"}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {done.message ||
              (done.approval_state === "approved"
                ? "Your entry pass has been sent on WhatsApp. Show the QR code at the desk on the event day."
                : "We are verifying your details. Your entry pass will arrive on WhatsApp once confirmed.")}
          </p>
          {done.token && <Link href={`/pass/${done.token}`}><Button size="lg" className="mt-5 w-full">View my entry pass</Button></Link>}
        </Card>
      ) : (
        <Card className="wm-card p-5 sm:p-7">
          <img src="/logo.png" alt="Logic School of Management" className="mb-4 h-12 w-auto rounded" />
          <div className="wm-eyebrow"><i />{ev.name}</div>
          <h1 className="mt-2 text-2xl font-bold">{kind === "student" ? "Student" : "Teacher"} registration</h1>
          <p className="mb-4 mt-1 border-b border-slate-100 pb-4 text-sm text-slate-500">{ev.date}{ev.time ? ` · ${ev.time}` : ""}{ev.venue ? ` · ${ev.venue}` : ""}</p>
          <form onSubmit={submit} className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <Section>Your details</Section>
            <Field label="Full name"><input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} required minLength={2} maxLength={100} autoComplete="name" /></Field>
            <Field label="WhatsApp number" hint="Your entry pass and seat details will be sent here.">
              <input className={inputCls} value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" required placeholder="10-digit mobile number" autoComplete="tel" />
            </Field>
            {courses.length > 0 && (
              <Field label="Course">
                <select className={inputCls} value={f.course_id} onChange={(e) => setF((x) => ({ ...x, course_id: e.target.value, category_id: "" }))} required>
                  <option value="">Select course…</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            {kind === "student" && (courses.length === 0 ? cats.length > 1 : !!f.course_id) && (
              <Field label="Winner category">
                <select className={inputCls} value={f.category_id} onChange={(e) => set("category_id", e.target.value)} required>
                  <option value="">Select…</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            {on("institution") && <Field label="School / institution"><input className={inputCls} value={f.institution} onChange={(e) => set("institution", e.target.value)} required={req("institution")} /></Field>}
            {on("email") && <Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={(e) => set("email", e.target.value)} required={req("email")} autoComplete="email" /></Field>}
            {on("place") && <Field label="Place"><input className={inputCls} value={f.place} onChange={(e) => set("place", e.target.value)} required={req("place")} /></Field>}
            {on("instagram") && (
              <Field label="Instagram ID" hint="So we can tag you in your event photos."><div className="wm-ig flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-brand-500"><span className="pl-3 text-slate-400">@</span><input className="h-10 w-full rounded-lg bg-transparent px-2 text-sm outline-none" value={f.instagram} onChange={(e) => set("instagram", e.target.value.replace(/\s/g, ""))} required={req("instagram")} placeholder="your_instagram_id" autoCapitalize="none" autoCorrect="off" maxLength={60} /></div></Field>
            )}

            {(on("photo") || on("bio") || on("profile")) && <Section>{on("bio") || on("profile") ? "Photo & profile" : "Photo"}</Section>}
            {on("photo") && (
              <Field className="sm:col-span-2" label="Your photo">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 p-2.5 hover:border-brand-500">
                  {f.photo ? <img src={f.photo} alt="Your photo" className="h-14 w-14 rounded-lg object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><Camera className="h-6 w-6" /></span>}
                  <span className="min-w-0 text-sm"><span className="block font-medium text-brand-600">{f.photo ? "Change photo" : "Take or choose photo"}</span><span className="block text-xs text-slate-500">A clear face photo. It is shown at the entry desk.</span></span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </Field>
            )}
            {on("bio") && (
              <Field className="sm:col-span-2" label="Short profile" hint={req("profile_either") && on("profile") ? "Write a short paragraph about yourself, or upload a Word / PDF file below. One of the two is enough." : "Write a short paragraph about yourself, your teaching and achievements."}>
                <textarea className="min-h-[5.5rem] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" rows={4} maxLength={1500} value={f.bio} onChange={(e) => set("bio", e.target.value)} required={req("bio")} placeholder="Example: I teach Accountancy at ... for 12 years ..." />
                <div className="mt-0.5 text-right text-[11px] text-slate-400">{f.bio.length}/1500</div>
              </Field>
            )}
            {on("bio") && on("profile") && (
              <div className="-my-1 flex items-center gap-3 sm:col-span-2" aria-hidden="true">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs font-semibold tracking-widest text-slate-500">OR</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
            )}
            {on("profile") && (
              <Field className="sm:col-span-2" label="Profile document (Word / PDF)">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 p-2.5 hover:border-brand-500">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><FileText className="h-5 w-5" /></span>
                  <span className="min-w-0 text-sm"><span className="block truncate font-medium text-slate-700">{profile ? profile.name : "No file chosen"}</span><span className="block text-xs"><span className="font-medium text-brand-600">{profile ? "Change file" : "Choose Word / PDF file"}</span><span className="text-slate-500"> · max {PROFILE_MAX_KB >= 1024 ? Math.round(PROFILE_MAX_KB / 1024) + " MB" : PROFILE_MAX_KB + " KB"}</span></span></span>
                  <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => { pickProfile(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                {profileErr && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{profileErr}</p>}
              </Field>
            )}

            {(on("contact") && (data?.contacts?.length ?? 0) > 0 || on("food_pref") || on("accompany")) && <Section>Event details</Section>}
            {on("contact") && (data?.contacts?.length ?? 0) > 0 && (
              <Field label="Point of contact" hint="The Marketing Manager you are in touch with.">
                <select className={inputCls} value={f.contact_id} onChange={(e) => set("contact_id", e.target.value)} required={req("contact")}>
                  <option value="">Select Marketing Manager</option>
                  {data.contacts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            {on("food_pref") && (
              <Field label="Food preference">
                <Seg value={f.food_pref} onChange={(v) => set("food_pref", v)} options={[["veg", "Veg"], ["nonveg", "Non-veg"]]} />
              </Field>
            )}
            {on("accompany") && kind === "teacher" && (
              <>
                <Field label="Coming with anyone?">
                  <Seg value={f.accompany_type} onChange={(v) => setF((x) => ({ ...x, accompany_type: v, accompany_count: v === "none" ? "" : x.accompany_count }))} options={[["none", "No"], ["guest", "Yes"]]} />
                </Field>
                {f.accompany_type === "guest" && (
                  <Field label="How many people?">
                    <input className={inputCls} type="number" inputMode="numeric" min={1} max={10} value={f.accompany_count} onChange={(e) => set("accompany_count", e.target.value)} required placeholder="1 - 10" />
                  </Field>
                )}
              </>
            )}
            {on("accompany") && kind !== "teacher" && (
              <>
                <Field label="Coming with">
                  <select className={inputCls} value={f.accompany_type} onChange={(e) => setF((x) => ({ ...x, accompany_type: e.target.value, accompany_count: e.target.value === "none" ? "" : x.accompany_count }))}>
                    <option value="none">None (coming alone)</option>
                    <option value="friend">Friend</option>
                    <option value="guardian">Guardian</option>
                  </select>
                </Field>
                {f.accompany_type !== "none" && (
                  <Field label={`How many ${f.accompany_type === "friend" ? "friends" : "guardians"}?`}>
                    <input className={inputCls} type="number" inputMode="numeric" min={1} max={10} value={f.accompany_count} onChange={(e) => set("accompany_count", e.target.value)} required placeholder="1 - 10" />
                  </Field>
                )}
              </>
            )}
            <input type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} className="hidden" aria-hidden />
            {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{err}</p>}
            <Button size="lg" className="w-full sm:col-span-2" loading={busy}>Register</Button>
          </form>
        </Card>
      )}
    </main>
    </div>
  );
}
