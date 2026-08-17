/**
 * 模型适配层（ADR-004 / AC-08）：OpenAI 兼容协议 + 熔断 + 重试 + 降级链 + 用量落库。
 *
 * - 协议：Vercel AI SDK 6（ai 6.0.x）+ @ai-sdk/openai 的 createOpenAI().chat()
 *   —— 走 chat completions，第三方兼容端点（混元/智谱/通义）均支持该形态。
 * - 超时：生成 90s / 打分 30s（AbortSignal.timeout）。
 * - 重试：同一档最多 MAX_RETRIES 次，仅对可重试错误（网络/5xx/超时）；4xx 认证类立刻换档。
 * - 降级：primary 失败或熔断开路 → 下一 enabled 档；全部不可用抛 503，全部熔断抛 429。
 * - 用量：每次成功调用落 usages（tokens/cost/kind）。
 */
import { createOpenAI } from '@ai-sdk/openai';
import { generateText as aiGenerateText, streamText as aiStreamText, type LanguageModel } from 'ai';
import { getDb, usages } from '../../db';
import { rateLimited, unavailable } from '../http/envelope';
import { breakerKey, gate, recordFailure, recordSuccess } from './breaker';
import { costCents } from './pricing';
import { resolveChain, type ModelKind, type ModelTarget } from './registry';

export const TIMEOUT_MS: Record<ModelKind, number> = {
  generate: Number(process.env.MODEL_TIMEOUT_GENERATE_MS ?? 90_000),
  score: Number(process.env.MODEL_TIMEOUT_SCORE_MS ?? 30_000),
};
export const MAX_RETRIES = Number(process.env.MODEL_MAX_RETRIES ?? 1);

export interface CallMeta {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  latencyMs: number;
  cacheHit: boolean;
}

export interface Messages {
  /** 可缓存前缀：稳定人设/规则，禁写日期（ADR-004 Prompt Cache） */
  system: string;
  /** 非缓存部分：当日日期、选题等易变值 */
  user: string;
}

type ModelFactory = (target: ModelTarget) => LanguageModel;

let modelFactory: ModelFactory = (target) =>
  createOpenAI({ baseURL: target.baseUrl, apiKey: target.apiKey }).chat(target.model);

/** 测试注入点：替换模型工厂，避免单测发真实网络请求。 */
export function setModelFactoryForTests(factory: ModelFactory | null): void {
  modelFactory =
    factory ??
    ((target) => createOpenAI({ baseURL: target.baseUrl, apiKey: target.apiKey }).chat(target.model));
}

function isRetryable(err: unknown): boolean {
  const e = err as { statusCode?: number; isRetryable?: boolean; name?: string; message?: string };
  if (typeof e?.isRetryable === 'boolean') return e.isRetryable;
  if (typeof e?.statusCode === 'number') return e.statusCode >= 500 || e.statusCode === 429;
  const msg = `${e?.name ?? ''} ${e?.message ?? ''}`;
  return /timeout|abort|ECONNRESET|ETIMEDOUT|fetch failed|socket/i.test(msg);
}

export type Attempt<T> = (target: ModelTarget, signal: AbortSignal) => Promise<T>;

export interface FallbackResult<T> {
  value: T;
  target: ModelTarget;
}

/**
 * 按链路逐档尝试（纯逻辑，便于单测注入 attempt）。
 * 熔断开路的档直接跳过；全链路皆开路 → 429（不击穿下游）。
 */
export async function runWithFallback<T>(
  chain: ModelTarget[],
  attempt: Attempt<T>,
  opts: { timeoutMs: number; maxRetries?: number } = { timeoutMs: 30_000 },
): Promise<FallbackResult<T>> {
  if (chain.length === 0) {
    throw unavailable('未配置可用模型：请在设置页填写模型 API Key（model_configs）后重试');
  }
  const retries = opts.maxRetries ?? MAX_RETRIES;
  let skippedByBreaker = 0;
  let lastError: unknown = null;

  for (const target of chain) {
    const key = breakerKey(target.baseUrl, target.model);
    if (gate(key) === 'open') {
      skippedByBreaker += 1;
      continue;
    }
    for (let i = 0; i <= retries; i += 1) {
      try {
        const value = await attempt(target, AbortSignal.timeout(opts.timeoutMs));
        recordSuccess(key);
        return { value, target };
      } catch (err) {
        lastError = err;
        const state = recordFailure(key);
        console.warn(
          `[ai] model ${target.name}/${target.model} attempt ${i + 1} failed ` +
            `(failures=${state.failures}): ${(err as Error).message}`,
        );
        if (!isRetryable(err) || i === retries) break;
      }
    }
  }

  if (skippedByBreaker === chain.length) {
    throw rateLimited('模型触发熔断保护，请稍后重试或在设置页切换 provider');
  }
  throw unavailable(`所有模型档位调用失败：${(lastError as Error)?.message ?? '未知错误'}`);
}

function readUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}): { tokensIn: number; tokensOut: number; cachedIn: number } {
  return {
    tokensIn: usage.inputTokens ?? 0,
    tokensOut: usage.outputTokens ?? 0,
    cachedIn: usage.cachedInputTokens ?? 0,
  };
}

function toMeta(target: ModelTarget, tokens: ReturnType<typeof readUsage>, startedAt: number): CallMeta {
  return {
    provider: target.name,
    model: target.model,
    tokensIn: tokens.tokensIn,
    tokensOut: tokens.tokensOut,
    costCents: costCents(target.model, tokens),
    latencyMs: Date.now() - startedAt,
    cacheHit: tokens.cachedIn > 0,
  };
}

/** 用量落库（失败只告警，不影响主流程；无 userId 时跳过）。 */
export async function recordUsage(userId: string | undefined, kind: ModelKind, meta: CallMeta): Promise<void> {
  if (!userId) return;
  try {
    await getDb().insert(usages).values({
      userId,
      model: meta.model,
      kind,
      tokensIn: meta.tokensIn,
      tokensOut: meta.tokensOut,
      cost: String(meta.costCents),
    });
  } catch (err) {
    console.warn('[ai] usages 落库失败:', (err as Error).message);
  }
}

export interface CompleteParams extends Messages {
  kind: ModelKind;
  userId?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/** 一次性文本补全（选题打分等短任务）。 */
export async function completeText(params: CompleteParams): Promise<{ text: string; meta: CallMeta }> {
  const chain = await resolveChain(params.kind);
  const startedAt = Date.now();
  const { value, target } = await runWithFallback(
    chain,
    async (target, signal) =>
      aiGenerateText({
        model: modelFactory(target),
        system: params.system,
        prompt: params.user,
        temperature: params.temperature ?? 0.3,
        maxOutputTokens: params.maxOutputTokens ?? 1_500,
        abortSignal: signal,
      }),
    { timeoutMs: TIMEOUT_MS[params.kind] },
  );
  const meta = toMeta(target, readUsage(value.usage), startedAt);
  await recordUsage(params.userId, params.kind, meta);
  return { text: value.text, meta };
}

export interface StreamHandle {
  /** 已消费首块后的续流（首块单独给出，用于连通性判定与降级） */
  firstChunk: string;
  rest: AsyncIterable<string>;
  target: ModelTarget;
  /** 流结束后解析用量（必须在 rest 消费完后 await） */
  finish: () => Promise<CallMeta>;
}

/**
 * 流式补全（草稿生成）。首块读取失败才触发降级——一旦开始输出就不再切换模型，
 * 避免同一次生成出现两种风格拼接。
 */
export async function streamChat(params: CompleteParams): Promise<StreamHandle> {
  const chain = await resolveChain(params.kind);
  const startedAt = Date.now();
  const { value, target } = await runWithFallback(
    chain,
    async (target, signal) => {
      const result = aiStreamText({
        model: modelFactory(target),
        system: params.system,
        prompt: params.user,
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxOutputTokens ?? 4_000,
        abortSignal: signal,
      });
      const iterator = result.textStream[Symbol.asyncIterator]();
      const first = await iterator.next();
      return { result, iterator, first };
    },
    { timeoutMs: TIMEOUT_MS[params.kind] },
  );

  const { result, iterator, first } = value;
  async function* rest(): AsyncGenerator<string> {
    for (;;) {
      const next = await iterator.next();
      if (next.done) return;
      yield next.value;
    }
  }
  return {
    firstChunk: first.done ? '' : first.value,
    rest: rest(),
    target,
    finish: async () => {
      const meta = toMeta(target, readUsage(await result.usage), startedAt);
      await recordUsage(params.userId, params.kind, meta);
      return meta;
    },
  };
}
