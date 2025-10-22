export type AnswerPayload =
  | { kind: "MC"; answer: "A"|"B"|"C"|"D"|"E"; confidence: number }
  | { kind: "VF"; answer: "V"|"F"; confidence: number };

export async function postAnswer(imageDataUrl: string, mode: "MC" | "VF") {
  const res = await fetch("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl, mode }),
  });
  if (!res.ok) {
    const info = await res.json().catch(() => ({}));
    throw new Error(info?.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as AnswerPayload;
}
