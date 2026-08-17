/**
 * 草稿生成编排（F2/AC-03）：选题 → 流式 Block AST → 落库 → done 事件。
 *
 * 合规约束：本端点只产出草稿，绝不触发任何发布动作（Spec §3 Out-of-Scope / ADR-003）。
 * 生成完成后自动把选题标记 adopted，避免同题被反复生成（AC-01 采纳链路）。
 */
import { streamDraftBlocks } from '../ai/generate';
import type { Block, BlockAst } from '../block-ast/types';
import type { SseEvent } from '../http/sse';
import { createDraft } from './draft-service';
import { getSettings } from './config-service';
import { adoptTopic, getTopic } from './topic-service';

export interface GenerateInput {
  userId: string;
  topicId: string;
  tone?: string;
  length?: string;
}

const LENGTHS = ['短', '中', '长'];

/**
 * 事件序列：block × N → done{draftId, usage}。
 * 落库放在 done 之前 —— 前端拿到 draftId 就必须能立刻 GET 到草稿。
 */
export async function* generateDraftEvents(
  input: GenerateInput,
  signal: AbortSignal,
): AsyncGenerator<SseEvent> {
  const topic = await getTopic(input.topicId);
  const settings = await getSettings(input.userId).catch(() => null);
  const tone = (input.tone ?? settings?.tone ?? '温暖、有共鸣、可操作').slice(0, 120);
  const length = LENGTHS.includes(input.length ?? '') ? (input.length as string) : '中';

  const blocks: Block[] = [];
  let meta: { provider: string; model: string; tokensIn: number; tokensOut: number; costCents: number; latencyMs: number; cacheHit: boolean } | null = null;

  for await (const evt of streamDraftBlocks({
    userId: input.userId,
    topic: {
      id: topic.id,
      title: topic.title,
      platform: topic.platform,
      domain: topic.domain,
    },
    tone,
    length,
    profile: settings?.profile || undefined,
  })) {
    if (signal.aborted) return; // 客户端断开：停止消费，adapter 侧超时会收尾
    if (evt.type === 'block') {
      blocks.push(evt.block);
      yield { type: 'block', payload: evt.block };
      continue;
    }
    meta = evt.meta;
    blocks.length = 0;
    blocks.push(...evt.blocks);
  }

  const ast: BlockAst = { version: '1.0', blocks };
  const draft = await createDraft({ userId: input.userId, topicId: topic.id, blocks: ast });
  // 采纳失败不该让整次生成白费，草稿已落库
  await adoptTopic(topic.id).catch((err) =>
    console.warn('[generate] 标记选题采纳失败:', (err as Error).message),
  );

  yield {
    type: 'done',
    payload: {
      draftId: draft.id,
      usage: meta ?? {
        provider: 'unknown',
        model: 'unknown',
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        latencyMs: 0,
        cacheHit: false,
      },
    },
  };
}
