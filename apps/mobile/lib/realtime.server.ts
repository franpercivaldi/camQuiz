import Pusher from "pusher";

const hasPusher =
  !!process.env.PUSHER_APP_ID &&
  !!process.env.PUSHER_KEY &&
  !!process.env.PUSHER_SECRET;

export const pusherServer = hasPusher
  ? new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER || "mt1",
      useTLS: true,
    })
  : null;

export async function broadcastAnswer(sessionId: string | undefined, payload: any) {
  if (!pusherServer || !sessionId) return;
  await pusherServer.trigger(`sess-${sessionId}`, "answer", payload);
}

export async function broadcastShot(sessionId: string | undefined, payload: any) {
  if (!pusherServer || !sessionId) return;
  await pusherServer.trigger(`sess-${sessionId}`, "shot", payload);
}
