import { addClient, removeClient } from "@/lib/sse";
import type { AppEvent } from "@/lib/sse";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let listener: ((event: AppEvent) => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection comment
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Push broadcast events to this SSE client
      listener = (event: AppEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: event })}\n\n`),
          );
        } catch {
          // Client gone — cleanup will happen in cancel()
        }
      };

      addClient(listener);

      // Keep-alive heartbeat every 30s
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // Client gone
        }
      }, 30_000);
    },
    cancel() {
      if (listener) removeClient(listener);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
