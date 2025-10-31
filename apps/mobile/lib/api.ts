export type AnswerPayload = { kind: "MC" | "VF"; answer: string; confidence: number };

export async function postAnswer(imageDataUrl: string, sessionId?: string, jobId?: string) {
  const res = await fetch("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl, sessionId, jobId }),
  });
  if (!res.ok) {
    const info = await res.json().catch(() => ({}));
    throw new Error(info?.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as AnswerPayload;
}

export async function postShot(sessionId: string, jobId: string, ts: number, intervalSec: number) {
  await fetch("/api/shot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, jobId, ts, intervalSec }),
  });
}
