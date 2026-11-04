"use client";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "./ui";

/** Camera QR scanner. Calls onScan(text) once per distinct code (2.5s debounce). */
export default function Scanner({ onScan, active = true }: { onScan: (text: string) => void; active?: boolean }) {
  const ref = useRef<Html5Qrcode | null>(null);
  const last = useRef({ text: "", at: 0 });
  const cb = useRef(onScan);
  cb.current = onScan;
  const [on, setOn] = useState(false);
  const [err, setErr] = useState("");
  const id = "wm-qr-reader";

  const stop = async () => {
    const s = ref.current;
    ref.current = null;
    if (s) {
      try { if (s.isScanning) await s.stop(); s.clear(); } catch {}
    }
    setOn(false);
  };
  const start = async () => {
    setErr("");
    try {
      const s = new Html5Qrcode(id, { verbose: false });
      ref.current = s;
      await s.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: (w, h) => { const m = Math.min(w, h); return { width: Math.floor(m * 0.8), height: Math.floor(m * 0.8) }; } },
        (text) => {
          const now = Date.now();
          if (text === last.current.text && now - last.current.at < 2500) return;
          last.current = { text, at: now };
          cb.current(text);
        },
        () => {}
      );
      setOn(true);
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      if (typeof window !== "undefined" && !window.isSecureContext) setErr("Camera needs a secure (https://) address. This page is opened over http, so the browser blocks the camera. Use the https link, or tap 'Take photo of QR' below.");
      else if (/denied|NotAllowed|Permission/i.test(msg)) setErr("Camera permission is blocked. Tap the lock icon in the address bar > Permissions > Camera > Allow, then reload. Or tap 'Take photo of QR' below.");
      else if (/NotFound|Requested device not found/i.test(msg)) setErr("No camera found on this device.");
      else setErr("Camera could not start (" + (msg.slice(0, 80) || "unknown") + "). Close other apps using the camera, or tap 'Take photo of QR' below.");
      ref.current = null;
    }
  };
  const fromPhoto = async (f?: File) => {
    if (!f) return;
    setErr("");
    try {
      const s = new Html5Qrcode(id + "-file", { verbose: false });
      const text = await s.scanFile(f, false);
      cb.current(text);
    } catch { setErr("No QR code found in that photo. Move closer and try again."); }
  };
  useEffect(() => { if (!active) stop(); return () => { stop(); }; /* eslint-disable-next-line */ }, [active]);

  return (
    <div>
      <div id={id} className={on ? "overflow-hidden rounded-xl bg-black" : "hidden"} />
      {!on && (
        <Button size="lg" className="w-full" onClick={start}><Camera className="h-5 w-5" /> Start camera scan</Button>
      )}
      {on && <Button variant="secondary" className="mt-2 w-full" onClick={stop}><CameraOff className="h-4 w-4" /> Stop camera</Button>}
      <label className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700">
        <Camera className="h-4 w-4" /> Take photo of QR
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { fromPhoto(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <div id={id + "-file"} className="hidden" />
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
    </div>
  );
}
