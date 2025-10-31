export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { broadcastShot } from "../../../lib/realtime.server";

const ShotSchema = z.object({
  sessionId: z.string().uuid(),
  jobId: z.string().min(8),
  ts: z.number().int(),          // Date.now() del cliente
  intervalSec: z.number().int().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = ShotSchema.parse(body);
    await broadcastShot(input.sessionId, input);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Invalid shot" }, { status: 400 });
  }
}
