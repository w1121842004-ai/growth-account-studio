/**
 * 生成草稿 SSE 客户端（POST /api/v1/drafts/generate，text/event-stream）。
 * 逐行解析 `data: {...}` 事件；type ∈ block|done|error（openapi SSEEvent）。
 * 前端仅消费事件，不自行渲染 Block AST（渲染交给后端 /render）。
 */
import { api } from "./client";
import type { Block, GenerationUsage, SSEEvent } from "./types";

export interface GenerateHandlers {
  onBlock: (block: Block) => void;
  onDone: (draftId: string, usage: GenerationUsage) => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
}

export async function generateDraftStream(
  topicId: string,
  opts: { tone?: string; length?: string },
  handlers: GenerateHandlers,
): Promise<void> {
  const res = await api.stream("/drafts/generate", {
    method: "POST",
    body: { topicId, ...opts },
    signal: handlers.signal,
  });

  if (!res.body) {
    handlers.onError("生成流不可用");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = () => {
    // 事件以空行分隔；每行 `data: <json>`
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const chunk of events) {
      const line = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      try {
        const evt = JSON.parse(raw) as SSEEvent;
        if (evt.type === "block") handlers.onBlock(evt.payload as Block);
        else if (evt.type === "done") {
          const p = evt.payload as { draftId: string; usage: GenerationUsage };
          handlers.onDone(p.draftId, p.usage);
        } else if (evt.type === "error") {
          handlers.onError((evt.payload as { message: string }).message);
        }
      } catch {
        // 忽略不完整/非 JSON 行
      }
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      flush();
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      handlers.onError((err as Error).message || "生成中断");
    }
  }
}
