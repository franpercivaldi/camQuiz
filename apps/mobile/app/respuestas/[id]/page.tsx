"use client";
import { useEffect, useMemo, useState } from "react";
import Pusher from "pusher-js";

type AnswerEvent = { jobId: string; kind: "MC" | "VF"; answer: string; confidence: number };
type ShotEvent   = { jobId: string; ts: number; intervalSec: number };

export default function RespuestasPage({ params }: { params: { id: string } }) {
  const [answers, setAnswers] = useState<AnswerEvent[]>([]);
  const [pending, setPending] = useState<Record<string, ShotEvent>>({});
  const [lastShot, setLastShot] = useState<ShotEvent | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  // Ticker para el countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Suscripción a Pusher
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY!;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "mt1";
    if (!key) return;

    const p = new Pusher(key, { cluster });
    const channelName = `sess-${params.id}`;
    const ch = p.subscribe(channelName);

    const onShot = (ev: ShotEvent) => {
      if (!ev?.jobId) return;
      setPending((old) => ({ ...old, [ev.jobId]: ev }));
      setLastShot(ev);
    };

    const onAnswer = (ev: AnswerEvent) => {
      // agregar respuesta al final
      setAnswers((old) => [...old, ev].slice(-200));

      // quitar pendiente (forma type-safe)
      setPending((old) => {
        if (!ev?.jobId) return old;
        const { [ev.jobId]: _removed, ...rest } = old;
        return rest;
      });
    };

    ch.bind("shot", onShot);
    ch.bind("answer", onAnswer);

    return () => {
      ch.unbind("shot", onShot);
      ch.unbind("answer", onAnswer);
      p.unsubscribe(channelName);
      p.disconnect();
    };
  }, [params.id]);

  const nextIn = useMemo(() => {
    if (!lastShot) return null;
    const due = lastShot.ts + lastShot.intervalSec * 1000;
    return Math.max(0, Math.ceil((due - now) / 1000));
  }, [lastShot, now]);

  return (
    <main style={{ padding: 16, color: "#fff", background: "#0b0b0b", minHeight: "100vh" }}>
      <h2>Respuestas — sesión {params.id.slice(0, 8)}</h2>

      {/* Barra superior: countdown + pendientes */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          background: "#141414",
          borderRadius: 10,
          padding: "8px 10px",
          marginBottom: 10,
          fontSize: 14,
        }}
      >
        <div>
          Próxima captura: <strong>{nextIn !== null ? `${nextIn}s` : "—"}</strong>
          {lastShot && <span style={{ opacity: 0.7 }}> (cada {lastShot.intervalSec}s)</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Pendientes:
          <span>
            {Object.keys(pending).length === 0 ? (
              <span style={{ opacity: 0.6 }}>0</span>
            ) : (
              Object.keys(pending).map((k) => (
                <span key={k} title={k} style={{ marginRight: 6 }}>
                  🟡
                </span>
              ))
            )}
          </span>
        </div>
      </div>

      {/* Tira de resultados (último al final, wrap por ancho) */}
      <div
        style={{
          background: "#1b1b1b",
          borderRadius: 10,
          padding: "8px 10px",
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.8,
          wordBreak: "break-word",
        }}
      >
        {answers.length
          ? answers.map((r, i) => (
              <span key={r.jobId || i} style={{ whiteSpace: "nowrap" }}>
                {r.answer}
                {i < answers.length - 1 ? " - " : ""}
              </span>
            ))
          : "Esperando respuestas…"}
      </div>
    </main>
  );
}
