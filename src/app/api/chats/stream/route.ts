import { getCurrentUser } from "@/lib/auth";
import { subscribeToChatActivity } from "@/lib/chat-events";

/**
 * Live chat channel (server-sent events).
 *
 * One connection per open tab, authenticated with the normal session cookie. The
 * server pushes the id of a conversation that just changed; the client refreshes
 * only that view. A comment heartbeat keeps proxies from closing an idle stream, and
 * every failure path detaches the listener so a closed tab cannot leak memory.
 */
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The reader went away between the abort signal and this tick.
          stop();
        }
      };

      const stop = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };

      write("retry: 3000\n\n");
      write(`event: ready\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);

      unsubscribe = subscribeToChatActivity(user.id, (conversationId) => {
        write(`event: message\ndata: ${JSON.stringify({ conversationId })}\n\n`);
      });

      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      request.signal.addEventListener("abort", stop);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops reverse proxies from buffering the stream in production.
      "X-Accel-Buffering": "no",
    },
  });
}
