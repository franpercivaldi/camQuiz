"use client";
import { useEffect, useRef, useState } from "react";
import { postAnswer, type AnswerPayload } from "../../lib/api";

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastShotUrl, setLastShotUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"MC" | "VF">("MC");
  const [isSending, setIsSending] = useState(false);
  const [serverResp, setServerResp] = useState<AnswerPayload | null>(null);

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
          // con muted + playsInline + autoPlay debería reproducir solo en móvil
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

  const shoot = async () => {
    if (!ready) return;
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, w, h);

    // calidad 0.9 para achicar peso sin perder legibilidad
    const url = canvas.toDataURL("image/jpeg", 0.9);
    setLastShotUrl(url);
    setServerResp(null); // limpiar resultado previo

    // descarga local para inspección (opcional)
    const a = document.createElement("a");
    a.href = url;
    a.download = `shot_${Date.now()}.jpg`;
    a.click();
  };

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
          style={{ width: "100%", borderRadius: 12, transform: "rotate(0deg)" }}
          onClick={shoot} // permite disparar con control BT (simula click)
        />
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={shoot} disabled={!ready} style={{ padding: 12, borderRadius: 12 }}>
          Disparar (o usa el control)
        </button>

        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "MC" | "VF")}
          style={{ padding: 12, borderRadius: 12 }}
          aria-label="Modo de respuesta"
        >
          <option value="MC">MC (A–E)</option>
          <option value="VF">V/F</option>
        </select>
      </div>

      <button
        onClick={async () => {
          if (!lastShotUrl || isSending) return;
          try {
            setIsSending(true);
            const resp = await postAnswer(lastShotUrl, mode);
            setServerResp(resp);
          } catch (e: any) {
            alert(`Error: ${e?.message || e}`);
          } finally {
            setIsSending(false);
          }
        }}
        disabled={!lastShotUrl || isSending}
        style={{ padding: 12, borderRadius: 12, opacity: !lastShotUrl ? 0.6 : 1 }}
      >
        {isSending ? "Enviando…" : "Enviar a /api/answer"}
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
                  background: "#4ade80",
                  borderRadius: 8,
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
