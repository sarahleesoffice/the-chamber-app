/**
 * Streaming AI replies to the browser as newline-delimited JSON.
 * Lines: {"t": "text chunk"} while the reply is written, then one
 * {"done": true, ...} with the final data, or {"error": "..."}.
 */

/** Server: build a streaming Response; `run` sends lines with `send`. */
export function ndjsonResponse(run: (send: (line: object) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: object) => controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      try {
        await run(send);
      } catch (err) {
        send({ error: err instanceof Error ? err.message : "Something went wrong" });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export interface StreamDone {
  done: true;
  [key: string]: unknown;
}

/**
 * Client: read a streamed reply. Calls onText with the full text so far on
 * every chunk; resolves with the final {"done": true} line. Throws on an
 * {"error"} line or a non-OK (JSON error) response.
 */
export async function readReplyStream(res: Response, onText: (textSoFar: string) => void): Promise<StreamDone> {
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Something went wrong");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let done: StreamDone | null = null;
  const handle = (raw: string) => {
    if (!raw.trim()) return;
    const line = JSON.parse(raw);
    if (typeof line.t === "string") {
      text += line.t;
      onText(text);
    } else if (line.error) {
      throw new Error(line.error);
    } else if (line.done) {
      done = line as StreamDone;
    }
  };
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      handle(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  handle(buf);
  if (!done) throw new Error("The reply was cut off. Please try again.");
  return done;
}
