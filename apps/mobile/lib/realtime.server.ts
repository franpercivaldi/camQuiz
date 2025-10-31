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
  if (!pusherServer || !sessionId) return;     // si no hay Pusher o session, no hace nada
  const channel = `sess-${sessionId}`;
  await pusherServer.trigger(channel, "answer", payload);
}
