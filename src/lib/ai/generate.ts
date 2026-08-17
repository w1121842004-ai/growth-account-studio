/**
 * 草稿生成编排（F2/AC-03）：模型流式输出 → 增量 Block AST 事件。
 * 路由层只负责把事件写成 SSE，不含业务逻辑。
 */
import type { Block } from '../block-ast/types';
import { streamChat, type CallMeta } from './adapter';
import { StreamingBlockParser } from './parse';
import { DRAFT_SYSTEM, buildDraftUser } from './prompts';

export interface GenerateParams {
  userId: string;
  topic: { id: string; title: string; platform: string; domain: string };
  tone: string;
  length: string;
  profile?: string;
}

export type GenerateEvent =
  | { type: 'block'; block: Block }
  | { type: 'meta'; meta: CallMeta; blocks: Block[] };

const MAX_BLOCKS = 400;

/** 当日日期只进 user 消息（ADR-004 禁写入可缓存 system 前缀）。 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 流式生成。逐块 yield，末尾 yield meta（含完整 blocks 供落库）。
 * 模型未配置/全链路失败时由 adapter 抛 ApiError（503/429），调用方转 SSE error 事件。
 */
export async function* streamDraftBlocks(params: GenerateParams): AsyncGenerator<GenerateEvent> {
  const handle = await streamChat({
    kind: 'generate',
    userId: params.userId,
    system: DRAFT_SYSTEM,
    user: buildDraftUser({
      today: today(),
      topicTitle: params.topic.title,
      platform: params.topic.platform,
      domain: params.topic.domain,
      tone: params.tone,
      length: params.length,
      profile: params.profile,
    }),
  });

  const parser = new StreamingBlockParser();
  const collected: Block[] = [];

  const emit = (blocks: Block[]): Block[] => {
    const accepted: Block[] = [];
    for (const block of blocks) {
      if (collected.length >= MAX_BLOCKS) break;
      collected.push(block);
      accepted.push(block);
    }
    return accepted;
  };

  for (const block of emit(parser.push(handle.firstChunk))) {
    yield { type: 'block', block };
  }
  for await (const chunk of handle.rest) {
    for (const block of emit(parser.push(chunk))) {
      yield { type: 'block', block };
    }
  }
  for (const block of emit(parser.end())) {
    yield { type: 'block', block };
  }

  const meta = await handle.finish();
  if (collected.length === 0) {
    throw new Error('模型未产出可用内容（输出为空或格式不可解析）');
  }
  yield { type: 'meta', meta, blocks: collected };
}
