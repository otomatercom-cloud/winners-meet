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
    } catch {
      setErr("Camera not available. Allow camera access (HTTPS is required on phones) or use search below.");
      ref.current = null;
    }
  };
  useEffect(() => { if (!active) stop(); return () => { stop(); }; /* eslint-disable-next-line */ }, [active]);

  return (
    <div>
      <div id={id} className={on ? "overflow-hidden rounded-xl bg-black" : "hidden"} />
      {!on && (
        <Button size="lg" className="w-full" onClick={start}><Camera className="h-5 w-5" /> Start camera scan</Button>
      )}
      {on && <Button variant="secondary" className="mt-2 w-full" onClick={stop}><CameraOff className="h-4 w-4" /> Stop camera</Button>}
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
    </div>
  );
}
