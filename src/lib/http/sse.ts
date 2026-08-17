/**
 * SSE 响应封装（openapi SSEEvent：type ∈ block|done|error）。
 * 前端 src/lib/api/sse.ts 按「事件以空行分隔、每行 data: <json>」解析，此处严格对齐。
 */

export type SseEvent =
  | { type: 'block'; payload: unknown; id?: string }
  | { type: 'done'; payload: unknown; id?: string }
  | { type: 'error'; payload: { message: string }; id?: string };

function frame(evt: SseEvent): string {
  return `data: ${JSON.stringify(evt)}\n\n`;
}

const HEADERS: Record<string, string> = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  // 反代（Caddy/Nginx）缓冲会把流攒成一坨，明确关掉
  'x-accel-buffering': 'no',
};

/**
 * 把异步事件生成器变成 SSE 响应。
 * 生成器抛错 → 转 error 事件后正常关闭流（HTTP 200 已发出，不能再改状态码）。
 * 客户端断开 → 通过 signal 中止生成器，避免模型继续烧 token。
 */
export function sseResponse(
  source: (signal: AbortSignal) => AsyncGenerator<SseEvent>,
  clientSignal?: AbortSignal | null,
): Response {
  const encoder = new TextEncoder();
  const controllerAbort = new AbortController();
  if (clientSignal) {
    if (clientSignal.aborted) controllerAbort.abort();
    else clientSignal.addEventListener('abort', () => controllerAbort.abort(), { once: true });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (evt: SseEvent) => {
        controller.enqueue(encoder.encode(frame(evt)));
      };
      try {
        for await (const evt of source(controllerAbort.signal)) {
          if (controllerAbort.signal.aborted) break;
          send(evt);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '生成失败，请重试';
        console.error('[sse] stream failed:', message);
        try {
          send({ type: 'error', payload: { message } });
        } catch {
          // 客户端已断开，忽略
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      controllerAbort.abort();
    },
  });

  return new Response(stream, { status: 200, headers: HEADERS });
}
