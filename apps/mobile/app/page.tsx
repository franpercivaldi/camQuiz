"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { postAnswer, type AnswerPayload } from "../lib/api";

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const photoCanvasRef = useRef<HTMLCanvasElement | null>(null);     // para tomar la foto full
  const analyzeCanvasRef = useRef<HTMLCanvasElement | null>(null);   // para análisis (downscaled)
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [serverResp, setServerResp] = useState<AnswerPayload | null>(null);

  // ---- AUTO MODE ----
  const [autoOn, setAutoOn] = useState(true);
  const [autoStatus, setAutoStatus] = useState<"inicializando" | "buscando" | "estable" | "capturando" | "enviando">("inicializando");
  const rafId = useRef<number | null>(null);
  const stableCount = useRef(0);
  const lastShotAt = useRef(0);

  // config de auto
  const ANALYZE_W = 320;          // downscale para análisis
  const ROI_RATIO = 0.5;          // 50% central (menos bordes/luz)
  const PIX_DIFF_THRESH = 20;     // 18–22 suele ir bien con AF de iPhone
  const MOTION_PCT_THRESH = 3.5;  // antes 0.8 → subimos a 3.5%
  const STABLE_FRAMES_NEEDED = 6; // menos frames para entrar a “estable”
  const COOLDOWN_MS = 1500;       // igual
  const ANALYZE_MIN_MS = 100;     // ~10 fps de análisis (menos nervioso)
  
  // beep de feedback
  const audioCtxRef = useRef<AudioContext | null>(null);
  const beep = useCallback((freq = 1200, dur = 0.12) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ac = audioCtxRef.current!;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(ac.destination);
      const now = ac.currentTime;
      o.start(now);
      g.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.stop(now + dur + 0.01);
    } catch {}
  }, []);

  // cámara
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
          setAutoStatus("buscando");
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

  const lastFrameGray = useRef<Uint8ClampedArray | null>(null);
  const lastMeanY = useRef(0);
  const lastAnalysisAt = useRef(0);
  const [dbg, setDbg] = useState({ motionPct: 0, meanY: 0 });


  // tomar foto completa y enviar
  const shootAndSend = useCallback(async () => {
    if (!ready || isSending) return;
    const now = Date.now();
    if (now - lastShotAt.current < COOLDOWN_MS) return;
    lastShotAt.current = now;

    const video = videoRef.current!;
    const photoCanvas = photoCanvasRef.current!;
    // foto full a resolución del video
    const w = video.videoWidth;
    const h = video.videoHeight;
    photoCanvas.width = w;
    photoCanvas.height = h;
    const pctx = photoCanvas.getContext("2d")!;
    pctx.drawImage(video, 0, 0, w, h);
    const dataUrl = photoCanvas.toDataURL("image/jpeg", 0.9);

    setServerResp(null);
    setAutoStatus("enviando");
    beep(1000, 0.08); // beep corto de “capturado”

    try {
      setIsSending(true);
      const resp = await postAnswer(dataUrl);
      setServerResp(resp);
    } catch (e: any) {
      alert(`Error: ${e?.message || e}`);
    } finally {
      setIsSending(false);
      // tras enviar, volvemos a buscar otra captura
      setAutoStatus("buscando");
      stableCount.current = 0;
    }
  }, [ready, isSending]);

  // loop de análisis (autodisparo por estabilidad)
  const analyzeLoop = useCallback(() => {
    if (!autoOn || !ready) return;

    // throttle a ~12 fps
    const now = performance.now();
    if (now - lastAnalysisAt.current < ANALYZE_MIN_MS) {
      rafId.current = requestAnimationFrame(analyzeLoop);
      return;
    }
    lastAnalysisAt.current = now;

    const video = videoRef.current!;
    if (!video.videoWidth || !video.videoHeight) {
      rafId.current = requestAnimationFrame(analyzeLoop);
      return;
    }

    const aCanvas = analyzeCanvasRef.current!;
    const ratio = video.videoHeight / video.videoWidth;
    const ah = Math.max(1, Math.round(ANALYZE_W * ratio));
    aCanvas.width = ANALYZE_W;
    aCanvas.height = ah;
    const actx = aCanvas.getContext("2d", { willReadFrequently: true })!;
    actx.drawImage(video, 0, 0, ANALYZE_W, ah);

    // ROI central
    const roiW = Math.max(8, Math.round(ANALYZE_W * ROI_RATIO));
    const roiH = Math.max(8, Math.round(roiW * ratio));
    const x0 = Math.floor((ANALYZE_W - roiW) / 2);
    const y0 = Math.floor((ah - roiH) / 2);

    const img = actx.getImageData(x0, y0, roiW, roiH).data;
    const N = roiW * roiH;

    // Luma + media
    const curGray = new Uint8ClampedArray(N);
    let sumY = 0;
    for (let i = 0, p = 0; i < img.length; i += 4, p++) {
      const r = img[i], g = img[i + 1], b = img[i + 2];
      const y = (r * 299 + g * 587 + b * 114) / 1000; // 0..255
      curGray[p] = y;
      sumY += y;
    }
    const meanY = sumY / N;

    // Compensación de exposición global entre frames
    let motionPct = 100; // por defecto "mucho movimiento" si no hay frame previo
    if (lastFrameGray.current) {
      const prev = lastFrameGray.current;
      const deltaMean = meanY - lastMeanY.current; // exposición global +/-

      let changed = 0;
      for (let p = 0; p < N; p++) {
        // diferencia "compensada" por exposición global
        const d = Math.abs((curGray[p] - prev[p]) - deltaMean);
        if (d > PIX_DIFF_THRESH) changed++;
      }
      motionPct = (changed / N) * 100;
    }

    // Condiciones: luz aceptable + baja variación
    const lightOk = meanY > 25 && meanY < 245;  // menos exigente en luz
    if (lightOk && motionPct < MOTION_PCT_THRESH) {
      stableCount.current++;
      setAutoStatus("estable");
      if (stableCount.current >= STABLE_FRAMES_NEEDED) {
        stableCount.current = 0;
        setAutoStatus("capturando");
        shootAndSend();
      }
    } else {
      stableCount.current = 0;
      setAutoStatus("buscando");
    }


    // Debug y estado para el próximo ciclo
    setDbg({ motionPct, meanY });
    lastFrameGray.current = curGray;
    lastMeanY.current = meanY;

    rafId.current = requestAnimationFrame(analyzeLoop);
  }, [autoOn, ready, shootAndSend]);


  // arranque/parada del loop
  useEffect(() => {
    if (autoOn && ready) {
      // activar audio al primer tap (requisito iOS): toquecito en pantalla o en botón
      const tapToInitAudio = () => {
        try {
          if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioCtxRef.current.resume().catch(() => {});
        } catch {}
        window.removeEventListener("touchstart", tapToInitAudio);
      };
      window.addEventListener("touchstart", tapToInitAudio, { passive: true });

      rafId.current = requestAnimationFrame(analyzeLoop);
      return () => {
        if (rafId.current) cancelAnimationFrame(rafId.current);
        rafId.current = null;
      };
    }
  }, [autoOn, ready, analyzeLoop]);

  // disparo manual por si lo necesitás
  const manualShot = useCallback(() => {
    beep(900, 0.05);
    shootAndSend();
  }, [shootAndSend, beep]);

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
          onClick={manualShot} // por si querés tocar la pantalla
          style={{ width: "100%", borderRadius: 12 }}
        />
        <canvas ref={photoCanvasRef} style={{ display: "none" }} />
        <canvas ref={analyzeCanvasRef} style={{ display: "none" }} />

        {/* overlay de estado */}
        {(isSending || autoOn) && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "end center",
              padding: 8,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                background: "rgba(0,0,0,0.45)",
                color: "#fff",
                padding: "6px 10px",
                borderRadius: 10,
                fontSize: 12,
              }}
            >
              {autoOn ? `Auto: ${autoStatus}` : "Auto: off"}
              {isSending ? " • enviando…" : ""}
            </div>
          </div>
        )}
      </div>

      {/* controles */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={autoOn}
            onChange={(e) => setAutoOn(e.target.checked)}
          />
          Modo auto
        </label>
        <button onClick={manualShot} disabled={!ready || isSending} style={{ padding: 12, borderRadius: 12 }}>
          Disparo manual
        </button>
      </div>

      {serverResp && (
        <div style={{ marginTop: 8, padding: 12, borderRadius: 20, background: "#1b1b1b" }}>
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
