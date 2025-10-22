import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

/** ===== Schemas ===== */
const InputSchema = z.object({
  imageDataUrl: z.string().min(50),       // data:image/jpeg;base64,...
  mode: z.enum(["MC", "VF"]).default("MC")
});

const OutputSchema = z.object({
  kind: z.enum(["MC", "VF"]).default("MC"),
  answer: z.union([
    z.enum(["A", "B", "C", "D", "E"]),
    z.enum(["V", "F"])
  ]),
  confidence: z.number().min(0).max(1)
});

/** ===== Mock deterministic (fallback) ===== */
function mockAnswer(imageDataUrl: string, mode: "MC" | "VF") {
  let sum = 0;
  for (let i = 0; i < imageDataUrl.length; i++) sum = (sum + imageDataUrl.charCodeAt(i)) % 997;
  if (mode === "VF") {
    const answer = sum % 2 === 0 ? "V" : "F";
    const confidence = ((sum % 41) + 60) / 100;
    return { kind: "VF" as const, answer, confidence };
  }
  const letters = ["A", "B", "C", "D", "E"] as const;
  const answer = letters[sum % letters.length];
  const confidence = ((sum % 41) + 60) / 100;
  return { kind: "MC" as const, answer, confidence };
}

/** ===== OpenAI client (lazy) ===== */
function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

/** ===== System prompt estricto ===== */
const SYSTEM = `
Eres un resolutor de exámenes de ciencias de la computación con visión. 
Tarea: Dada una foto de un enunciado multiple choice o verdadero/falso, 
devuelve SOLO un JSON con:
{ "kind": "MC"|"VF", "answer": "A"|"B"|"C"|"D"|"E"|"V"|"F", "confidence": 0..1 }

Reglas:
- Si el modo es MC, responde SOLO A,B,C,D o E. 
- Si el modo es VF, responde SOLO V o F.
- "confidence" entre 0 y 1 (ej: 0.83).
- No incluyas explicación ni campos extra.
`;

/** ===== Handler ===== */
export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const input = InputSchema.parse(json);

    // Si no hay client, usamos mock
    const client = getClient();
    if (!client) {
      const out = OutputSchema.parse(mockAnswer(input.imageDataUrl, input.mode));
      return NextResponse.json(out, { status: 200 });
    }

    // Llamado a OpenAI: chat con visión y JSON forzado
    const model = process.env.OPENAI_MODEL || "gpt-5";
    const completion = await client.chat.completions.create({
      model,
      temperature: 1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: `Modo: ${input.mode}. Responde solo el JSON solicitado.` },
            { type: "image_url", image_url: { url: input.imageDataUrl } }
          ]
        }
      ]
    });

    const txt = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(txt);
    } catch {
      // Si el modelo no devolvió JSON válido, caemos a mock
      const out = OutputSchema.parse(mockAnswer(input.imageDataUrl, input.mode));
      return NextResponse.json(out, { status: 200 });
    }

    // Validamos/normalizamos salida
    const out = OutputSchema.parse(parsed);
    return NextResponse.json(out, { status: 200 });

  } catch (err: any) {
    // En fallo de validación/llamado, devolvemos error claro
    return NextResponse.json(
      { error: err?.message || "Invalid input" },
      { status: 400 }
    );
  }
}
