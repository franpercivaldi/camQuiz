"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Pusher from "pusher-js";

type AnswerEvent = { jobId?: string; kind: "MC" | "VF"; answer: string; confidence: number };
type ShotEvent   = { jobId: string; ts: number; intervalSec: number };

export default function RespuestasPage({ params }: { params: { id: string } }) {
  const [answers, setAnswers] = useState<AnswerEvent[]>([]);
  const [pending, setPending] = useState<Record<string, ShotEvent>>({});
  const [lastShot, setLastShot] = useState<ShotEvent | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  // ticker 1s para countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Pusher subscribe
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY!;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "mt1";
    if (!key) return;

    const p = new Pusher(key, { cluster });

    const channel = `sess-${params.id}`;
    const ch = p.subscribe(channel);

    const onShot = (ev: ShotEvent) => {
      setPending((old) => ({ ...old, [ev.jobId]: ev }));
      setLastShot(ev);
    };
    const onAnswer = (ev: AnswerEvent) => {
      setAnswers((old) => [...old, ev].slice(-200));
      if (ev.jobId) {
        setPending((old) => {
          const c = { ...old };
          delete c[ev.jobId];
          return c;
        });
      }
    };

    ch.bind("shot", onShot);
    ch.bind("answer", onAnswer);

    return () => {
      ch.unbind("shot", onShot);
      ch.unbind("answer", onAnswer);
      p.unsubscribe(channel);
      p.disconnect();
    };
  }, [params.id]);

  const nextIn = useMemo(() => {
    if (!lastShot) return null;
    const due = lastShot.ts + lastShot.intervalSec * 1000;
    const delta = Math.max(0, Math.ceil((due - now) / 1000));
    return delta;
  }, [lastShot, now]);

  return (
    <main style={{ padding: 16, color: "#fff", background: "#0b0b0b", minHeight: "100vh" }}>
      <h2>Respuestas — sesión {params.id.slice(0, 8)}</h2>

      {/* Barra superior: countdown + pendientes */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        background: "#141414", borderRadius: 10, padding: "8px 10px", marginBottom: 10, fontSize: 14
      }}>
        <div>
          Próxima captura:{" "}
          <strong>{nextIn !== null ? `${nextIn}s` : "—"}</strong>
          {lastShot && <span style={{ opacity: 0.7 }}> (cada {lastShot.intervalSec}s)</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Pendientes:
          <span>
            {Object.keys(pending).length === 0
              ? <span style={{ opacity: 0.6 }}>0</span>
              : Object.keys(pending).map((k) => (
                  <span key={k} title={k} style={{ marginRight: 6 }}>🟡</span>
                ))}
          </span>
        </div>
      </div>

      {/* Tira de resultados (último al final, wrap por ancho) */}
      <div style={{
        background: "#1b1b1b", borderRadius: 10, padding: "8px 10px",
        fontSize: 22, fontWeight: 700, lineHeight: 1.8, wordBreak: "break-word"
      }}>
        {answers.length
          ? answers.map((r, i) => (
              <span key={r.jobId || i} style={{ whiteSpace: "nowrap" }}>
                {r.answer}{i < answers.length - 1 ? " - " : ""}
              </span>
            ))
          : "Esperando respuestas…"}
      </div>
    </main>
  );
}
