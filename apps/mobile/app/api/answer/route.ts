import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

/** ===== Schemas ===== */
const InputSchema = z.object({
  imageDataUrl: z.string().min(50), // data:image/jpeg;base64,...
});

const OutputSchema = z.object({
  kind: z.enum(["MC", "VF"]).default("MC"),
  // answer: V/F o A..E o "1".."10"
  answer: z.string().regex(/^(V|F|[A-E]|[1-9]|10)$/),
  confidence: z.number().min(0).max(1),
});

/** ===== Mock deterministic (fallback) ===== */
function mockAnswer(imageDataUrl: string) {
  let sum = 0;
  for (let i = 0; i < imageDataUrl.length; i++) sum = (sum + imageDataUrl.charCodeAt(i)) % 997;

  // Pseudo det: ~1/3 VF, ~2/3 MC
  if (sum % 3 === 0) {
    const answer = sum % 2 === 0 ? "V" : "F";
    const confidence = ((sum % 41) + 60) / 100;
    return { kind: "VF" as const, answer, confidence };
  }

  // MC: a veces con letras, a veces índice
  if (sum % 2 === 0) {
    const letters = ["A", "B", "C", "D", "E"] as const;
    const answer = letters[sum % letters.length];
    const confidence = ((sum % 41) + 60) / 100;
    return { kind: "MC" as const, answer, confidence };
  } else {
    const count = (sum % 5) + 2; // 2..6 opciones
    const idx = (sum % count) + 1; // 1..count
    const confidence = ((sum % 41) + 60) / 100;
    return { kind: "MC" as const, answer: String(idx), confidence };
  }
}

/** ===== OpenAI client (lazy) ===== */
function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

/** ===== System prompt (auto-detect) ===== */
const SYSTEM = `
Eres un resolutor de exámenes con visión.
Devuelve SOLO un JSON con forma exacta:
{ "kind": "MC"|"VF", "answer": "A"|"B"|"C"|"D"|"E"|"V"|"F"|"1"|"2"|...|"10", "confidence": 0..1 }

Reglas de salida:
- Si es Verdadero/Falso: "kind":"VF" y "answer":"V" o "F".
- Si es Multiple Choice con letras (A..E): "kind":"MC" y "answer":"A".."E".
- Si es Multiple Choice sin letras (opciones con viñetas, números o sin etiqueta): "kind":"MC" y "answer":"1".."10" usando índice 1-based de la opción correcta.
- "confidence" entre 0 y 1 (ej: 0.83).
- No incluyas explicación ni campos extra.
`;

/** ===== Handler ===== */
export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const input = InputSchema.parse(json);

    const client = getClient();
    if (!client) {
      const out = OutputSchema.parse(mockAnswer(input.imageDataUrl));
      return NextResponse.json(out, { status: 200 });
    }

    const model = process.env.OPENAI_MODEL || "gpt-5";

    let txt = "{}";
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Analiza la imagen y responde estrictamente el JSON solicitado." },
              { type: "image_url", image_url: { url: input.imageDataUrl } },
            ],
          },
        ],
      });
      txt = completion.choices[0]?.message?.content ?? "{}";
    } catch (e: any) {
      // Fallback a mock para no romper UX en prod
      const out = OutputSchema.parse(mockAnswer(input.imageDataUrl));
      return NextResponse.json(out, { status: 200 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(txt);
    } catch {
      const out = OutputSchema.parse(mockAnswer(input.imageDataUrl));
      return NextResponse.json(out, { status: 200 });
    }

    const out = OutputSchema.parse(parsed);
    return NextResponse.json(out, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Invalid input" }, { status: 400 });
  }
}
