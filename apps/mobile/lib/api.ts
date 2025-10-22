export type AnswerPayload = {
  kind: "MC" | "VF";
  // "V"|"F" o "A".."E" o "1".."10"
  answer: string;
  confidence: number;
};

export async function postAnswer(imageDataUrl: string) {
  const res = await fetch("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl }),
  });
  if (!res.ok) {
    const info = await res.json().catch(() => ({}));
    throw new Error(info?.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as AnswerPayload;
}
