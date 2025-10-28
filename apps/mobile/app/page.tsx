"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { postAnswer, type AnswerPayload } from "../lib/api";

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null); // +++
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [serverResp, setServerResp] = useState<AnswerPayload | null>(null);
  const lastShotTs = useRef<number>(0);

  // Disparo
  const shoot = useCallback(async () => {
    if (!ready || isSending) return;
    const now = Date.now();
    if (now - lastShotTs.current < 800) return; // anti-doble
    lastShotTs.current = now;

    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, w, h);

    const url = canvas.toDataURL("image/jpeg", 0.9);
    setServerResp(null);

    try {
      setIsSending(true);
      const resp = await postAnswer(url);
      setServerResp(resp);
    } catch (e: any) {
      alert(`Error: ${e?.message || e}`);
    } finally {
      setIsSending(false);
    }
  }, [ready, isSending]);

  // Cámara
  useEffect(() => {
    let stream: MediaStream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch (e: any) {
        console.error("getUserMedia error", e);
        setError(e?.message || "No se pudo acceder a la cámara");
      }
    })();
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // Teclado (Enter/Space/NumpadEnter)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const keys = new Set(["Enter", " ", "NumpadEnter"]);
      if (keys.has(e.key)) {
        e.preventDefault();
        shoot();
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shoot]);

  // Media keys (Play/Pause/Prev/Next) vía Media Session
  useEffect(() => {
    // Audio silencioso para activar la sesión (muted para permitir autoplay)
    const el = document.createElement("audio");
    el.muted = true;
    el.loop = true;
    // 1 segundo de silencio PCM WAV (data URL corta)
    el.src =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
    audioRef.current = el;
    el.play().catch(() => {
      // algunos navegadores requieren un tap inicial; si no, igual los handlers se setean
    });

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: "Camera Remote" });
      const set = (action: MediaSessionAction, handler: () => void) => {
        try { navigator.mediaSession!.setActionHandler(action, handler); } catch {}
      };
      set("play", shoot);
      set("pause", shoot);
      set("previoustrack", shoot);
      set("nexttrack", shoot);
      set("stop", shoot);
      // opcional: seekto/seekbackward/seekforward podrían mapear a shoot también si querés
    }

    return () => {
      try {
        if ("mediaSession" in navigator) {
          const clear = (a: MediaSessionAction) => {
            try { navigator.mediaSession!.setActionHandler(a, null); } catch {}
          };
          ["play","pause","previoustrack","nexttrack","stop"].forEach(a => clear(a as MediaSessionAction));
        }
      } catch {}
      try { el.pause(); } catch {}
    };
  }, [shoot]);

  return (
    <main style={{ display: "grid", gap: 12, padding: 12 }}>
      <h2>Cámara</h2>
      {error && <p style={{ color: "#f88" }}>{error}</p>}

      <div style={{ position: "relative" }}>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          onClick={shoot} // por si querés tocar pantalla
          style={{ width: "100%", borderRadius: 12 }}
        />
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {isSending && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "grid",
              placeItems: "center",
              borderRadius: 12,
              fontWeight: 600,
            }}
          >
            Procesando…
          </div>
        )}
      </div>

      {/* Botón manual como respaldo */}
      <button onClick={shoot} disabled={!ready || isSending} style={{ padding: 12, borderRadius: 12 }}>
        Disparar (control BT / teclas media / tap)
      </button>
    </main>
  );
}
