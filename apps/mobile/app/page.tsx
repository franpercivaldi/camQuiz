"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { postAnswer, type AnswerPayload, postShot } from "../lib/api";

type Job = { id: string; ts: number; dataUrl: string };
type Row = { id: string; ts: number; ok: boolean; resp?: AnswerPayload; err?: string };

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [sessionId] = useState(() => crypto.randomUUID()); // se fija al cargar

  // Cámara / estado básico
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Programación periódica
  const [autoOn, setAutoOn] = useState(true);
  const [intervalSec, setIntervalSec] = useState(40); // cada 40s por defecto
  const intervalId = useRef<number | null>(null);

  // Cola de envíos
  const queueRef = useRef<Job[]>([]);
  const [queueLen, setQueueLen] = useState(0);
  const sendingRef = useRef(false);

  // Resultados
  const [rows, setRows] = useState<Row[]>([]);

  // --- Cámara ---
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

  // --- Captura a dataURL (con opción de reducir tamaño si quisieras) ---
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return null;

    const w = video.videoWidth;
    const h = video.videoHeight;

    // Si querés reducir tamaño para acelerar uploads, descomenta:
    // const MAX_W = 1600;
    // const scale = Math.min(1, MAX_W / w);
    // const outW = Math.round(w * scale), outH = Math.round(h * scale);

    const outW = w, outH = h; // full-res por ahora
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, outW, outH);
    return canvas.toDataURL("image/jpeg", 0.9);
  }, []);

  // --- Encolar captura ---
  const enqueueCapture = useCallback(() => {
    const dataUrl = captureFrame();
    if (!dataUrl) return;
    const job: Job = { id: crypto.randomUUID(), ts: Date.now(), dataUrl };
    queueRef.current.push(job);
    setQueueLen(queueRef.current.length);

    // Avisar SHOT a la segunda pantalla (no bloqueante)
    postShot(sessionId, job.id, job.ts, intervalSec).catch(() => {});

    processQueue(); // intentar procesar ya
  }, [captureFrame, intervalSec, sessionId]);

  // --- Worker secuencial de la cola ---
  const processQueue = useCallback(async () => {
    if (sendingRef.current) return;
    const job = queueRef.current.shift();
    if (!job) return;

    sendingRef.current = true;
    setQueueLen(queueRef.current.length);

    try {
      // Pasamos también job.id para que el backend lo re-emita y el visor pueda casar respuesta↔pendiente
      const resp = await postAnswer(job.dataUrl, sessionId, job.id);
      setRows((old) => [...old, { id: job.id, ts: job.ts, ok: true, resp }].slice(-100)); // conserva últimos 100
    } catch (e: any) {
      setRows((old) => [...old, { id: job.id, ts: job.ts, ok: false, err: e?.message || String(e) }].slice(-100));
    } finally {
      sendingRef.current = false;
      // Si quedan trabajos, procesa el siguiente
      if (queueRef.current.length > 0) processQueue();
    }
  }, [sessionId]);

  // --- Timer periódico ---
  useEffect(() => {
    // limpiar timer previo
    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }
    if (autoOn && ready) {
      // dispara inmediatamente una vez al activar
      enqueueCapture();
      // y luego cada N segundos
      intervalId.current = window.setInterval(enqueueCapture, Math.max(5, intervalSec) * 1000);
    }
    return () => {
      if (intervalId.current) clearInterval(intervalId.current);
      intervalId.current = null;
    };
  }, [autoOn, intervalSec, ready, enqueueCapture]);

  // --- Disparo manual por si lo necesitás ---
  const manualShot = useCallback(() => enqueueCapture(), [enqueueCapture]);

  return (
    <main style={{ display: "grid", gap: 12, padding: 12 }}>
      <h2>Cámara</h2>
      <div style={{fontSize:12, opacity:.8}}>
        Ver en vivo: <code>/respuestas/{sessionId}</code>
      </div>
      <div
        style={{
          background: "#1b1b1b",
          borderRadius: 10,
          padding: "8px 10px",
          fontSize: 18,
          fontWeight: 600,
        }}
      >
        {rows.length
          ? rows.map((r, i) => {
              const txt = r.ok && r.resp ? r.resp.answer : "ERR";
              return (
                <span key={r.id} style={{ whiteSpace: "nowrap" }}>
                  {txt}{i < rows.length - 1 ? " - " : ""}
                </span>
              );
            })
          : "Sin resultados aún…"}
      </div>
      {error && <p style={{ color: "#f88" }}>{error}</p>}

      <div style={{ position: "relative" }}>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          onClick={manualShot} // por si querés tocar pantalla
          style={{ width: "100%", borderRadius: 12 }}
        />
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Estado arriba del video */}
        <div
          style={{
            position: "absolute", top: 8, left: 8,
            background: "rgba(0,0,0,0.5)", color: "#fff",
            padding: "6px 10px", borderRadius: 10, fontSize: 12
          }}
        >
          {autoOn ? `Auto cada ${intervalSec}s` : "Auto: off"}
          {" • "}
          {sendingRef.current ? "enviando…" : "idle"}
          {" • cola:"} {queueLen}
        </div>
      </div>

      {/* Controles */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} />
          Modo automático
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Intervalo (s)
          <input
            type="number"
            value={intervalSec}
            min={5}
            onChange={(e) => setIntervalSec(Math.max(5, Number(e.target.value) || 40))}
            style={{ width: 80, padding: 6, borderRadius: 8, background: "#111", color: "#fff", border: "1px solid #444" }}
          />
        </label>

        <button onClick={manualShot} disabled={!ready} style={{ padding: 12, borderRadius: 12 }}>
          Disparo manual ahora
        </button>

        <button
          onClick={() => { setRows([]); }}
          style={{ padding: 12, borderRadius: 12, background: "#222", border: "1px solid #444", color: "#ddd" }}
        >
          Limpiar resultados
        </button>
      </div>

      {/* Resultados (uno bajo otro) */}
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ background: "#1b1b1b", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {new Date(r.ts).toLocaleTimeString()} • {r.ok ? "OK" : "ERROR"}
            </div>

            {r.ok && r.resp ? (
              <>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {r.resp.answer}
                  <span style={{ fontSize: 14, marginLeft: 8, opacity: 0.7 }}>({r.resp.kind})</span>
                </div>
                <div style={{ marginTop: 6 }}>
                  Confianza: {(r.resp.confidence * 100).toFixed(0)}%
                  <div style={{ height: 8, background: "#333", borderRadius: 8, marginTop: 4 }}>
                    <div
                      style={{
                        height: 8,
                        width: `${Math.round(r.resp.confidence * 100)}%`,
                        background: "#4ade80",
                        borderRadius: 8,
                        transition: "width 200ms ease",
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: "#f88" }}>
                {r.err || "Error desconocido"}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <div style={{ opacity: 0.7, fontSize: 14 }}>Sin resultados aún…</div>}
      </div>
    </main>
  );
}
