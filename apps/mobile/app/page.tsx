"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { postAnswer, type AnswerPayload } from "../lib/api";

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const focusTrapRef = useRef<HTMLInputElement | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [serverResp, setServerResp] = useState<AnswerPayload | null>(null);
  const [debugKey, setDebugKey] = useState<string>(""); // muestra última señal capturada
  const [armed, setArmed] = useState(false);            // indica si pudimos “armar” sesión media + focus

  const lastShotTs = useRef<number>(0);

  // --- Disparo principal ---
  const shoot = useCallback(async () => {
    if (!ready || isSending) return;
    const now = Date.now();
    if (now - lastShotTs.current < 800) return; // anti-doble-disparo
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

  // --- Cámara ---
  useEffect(() => {
    let stream: MediaStream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
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
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // --- Intentamos “armar” (media session + focus teclado) ---
  const armRemote = useCallback(async () => {
    // 1) reproducir audio silencioso en loop (activa MediaSession en iOS)
    if (!audioRef.current) {
      const el = document.createElement("audio");
      el.muted = true;
      el.loop = true;
      el.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="; // 1s silencio
      audioRef.current = el;
    }
    try {
      await audioRef.current.play();
    } catch {
      // puede fallar si no hay gesto del usuario; no es fatal
    }

    // 2) Media Session handlers (Play/Pause/Prev/Next/Stop)
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: "Camera Remote" });
      const set = (action: MediaSessionAction, handler: () => void) => {
        try {
          navigator.mediaSession!.setActionHandler(action, () => {
            setDebugKey(`mediaAction="${action}"`);
            handler();
          });
        } catch {}
      };
      set("play", shoot);
      set("pause", shoot);
      set("previoustrack", shoot);
      set("nexttrack", shoot);
      set("stop", shoot);
      // (si querés, también podrías mapear seek* a shoot)
    }

    // 3) Forzamos foco en input oculto para recibir teclas (Enter/Space)
    const inp = focusTrapRef.current;
    if (inp) {
      try {
        inp.focus({ preventScroll: true });
      } catch {}
    }

    setArmed(true);
  }, [shoot]);

  // Intento automático de armado al montar + al tocar pantalla (para cumplir gesto de usuario en iOS)
  useEffect(() => {
    armRemote();
    const tapToArm = () => armRemote();
    window.addEventListener("touchstart", tapToArm, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) armRemote();
    });
    return () => {
      window.removeEventListener("touchstart", tapToArm);
    };
  }, [armRemote]);

  // --- Teclado (Enter / Space / NumpadEnter) ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      setDebugKey(`key="${e.key}" code="${(e as any).code || ""}"`);
      const keys = new Set(["Enter", " ", "NumpadEnter"]);
      if (keys.has(e.key)) {
        e.preventDefault();
        shoot();
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
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

        {/* input oculto para recibir teclas del control (modo teclado) */}
        <input
          ref={focusTrapRef}
          aria-hidden
          tabIndex={-1}
          style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
          onBlur={() => {
            // si pierde foco, reintenta
            setTimeout(() => focusTrapRef.current?.focus({ preventScroll: true }), 0);
          }}
        />

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

      {/* Banda de estado para armar / debug */}
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        {armed ? "Remoto: armado" : "Remoto: armando… (si tu iPhone pide gesto, toca una vez la pantalla)"}
        {debugKey && <div>Input capturado: {debugKey}</div>}
      </div>

      {/* Botón manual de respaldo */}
      <button onClick={shoot} disabled={!ready || isSending} style={{ padding: 12, borderRadius: 12 }}>
        Disparar (control BT / teclas media / tap)
      </button>

      {serverResp && (
        <div style={{ marginTop: 8, padding: 12, borderRadius: 12, background: "#1b1b1b" }}>
          <div style={{ fontSize: 14, opacity: 0.7 }}>Respuesta</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>
            {serverResp.answer}
            <span style={{ fontSize: 16, marginLeft: 8, opacity: 0.7 }}>({serverResp.kind})</span>
          </div>
          <div style={{ marginTop: 8 }}>
            Confianza: {(serverResp.confidence * 100).toFixed(0)}%
            <div style={{ height: 8, background: "#333", borderRadius: 8, marginTop: 4 }}>
              <div
                style={{
                  height: 8,
                  width: `${Math.round(serverResp.confidence * 100)}%`,
                  borderRadius: 8,
                  background: "#4ade80",
                  transition: "width 200ms ease",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
