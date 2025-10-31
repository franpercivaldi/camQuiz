"use client";
import { useEffect, useState } from "react";
import Pusher from "pusher-js";

type AnswerPayload = { kind: "MC"|"VF"; answer: string; confidence: number };

export default function RespuestasPage({ params }: { params: { id: string } }) {
  const [items, setItems] = useState<AnswerPayload[]>([]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY!;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "mt1";
    if (!key) return; // si no hay Pusher configurado, no intenta

    const p = new Pusher(key, { cluster });
    const ch = p.subscribe(`sess-${params.id}`);
    const handler = (data: AnswerPayload) => {
      setItems((prev) => [...prev, data].slice(-200)); // append al final
    };
    ch.bind("answer", handler);

    return () => {
      ch.unbind("answer", handler);
      p.unsubscribe(`sess-${params.id}`);
      p.disconnect();
    };
  }, [params.id]);

  return (
    <main style={{ padding: 16, color: "#fff", background: "#0b0b0b", minHeight: "100vh" }}>
      <h2>Respuestas — sesión {params.id.slice(0,8)}</h2>
      <div style={{
        background: "#1b1b1b",
        borderRadius: 10,
        padding: "8px 10px",
        fontSize: 22,
        fontWeight: 700,
        lineHeight: 1.8,
        wordBreak: "break-word"
      }}>
        {items.length
          ? items.map((r, i) => (
              <span key={i} style={{ whiteSpace: "nowrap" }}>
                {r.answer}{i < items.length - 1 ? " - " : ""}
              </span>
            ))
          : "Esperando respuestas…"}
      </div>
    </main>
  );
}
