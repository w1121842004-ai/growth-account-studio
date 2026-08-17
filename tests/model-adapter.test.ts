/**
 * 模型适配层单测（ADR-004 / AC-08）：熔断 + 降级链 + 重试 + 成本换算。
 * 不发真实网络：直接对纯函数 runWithFallback 注入 attempt；熔断走进程内 breaker。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithFallback } from '../src/lib/ai/adapter';
import {
  BREAKER_THRESHOLD,
  breakerKey,
  gate,
  recordFailure,
  resetBreakers,
  snapshot,
} from '../src/lib/ai/breaker';
import { ApiError } from '../src/lib/http/envelope';
import { costCents, priceOf } from '../src/lib/ai/pricing';
import type { ModelTarget } from '../src/lib/ai/registry';

function target(name: string, model: string): ModelTarget {
  return {
    name,
    baseUrl: `https://api.${name}.test/v1`,
    apiKey: 'sk-test',
    model,
    role: name === 'primary' ? 'primary' : 'fallback',
    tier: 'generate',
  };
}

const PRIMARY = target('primary', 'hy3');
const FALLBACK = target('fallback', 'glm-4.7-flash');

test('降级链：primary 抛可重试错误 → 自动切 fallback 成功', async () => {
  resetBreakers();
  const seen: string[] = [];
  const res = await runWithFallback(
    [PRIMARY, FALLBACK],
    async (t) => {
      seen.push(t.model);
      if (t.model === PRIMARY.model) {
        throw Object.assign(new Error('upstream 503'), { statusCode: 503 });
      }
      return 'ok';
    },
    { timeoutMs: 1_000, maxRetries: 0 },
  );
  assert.equal(res.value, 'ok');
  assert.equal(res.target.model, FALLBACK.model);
  assert.deepEqual(seen, [PRIMARY.model, FALLBACK.model]);
});

test('重试：可重试错误在同一档内重试 maxRetries 次后才降级', async () => {
  resetBreakers();
  let primaryTries = 0;
  const res = await runWithFallback(
    [PRIMARY, FALLBACK],
    async (t) => {
      if (t.model === PRIMARY.model) {
        primaryTries += 1;
        throw Object.assign(new Error('timeout'), { name: 'AbortError' });
      }
      return 'done';
    },
    { timeoutMs: 1_000, maxRetries: 2 },
  );
  assert.equal(primaryTries, 3, 'maxRetries=2 → 首次 + 2 次重试 = 3');
  assert.equal(res.target.model, FALLBACK.model);
});

test('4xx 认证错误不可重试：立即降级，不在本档空转', async () => {
  resetBreakers();
  let primaryTries = 0;
  const res = await runWithFallback(
    [PRIMARY, FALLBACK],
    async (t) => {
      if (t.model === PRIMARY.model) {
        primaryTries += 1;
        throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
      }
      return 'done';
    },
    { timeoutMs: 1_000, maxRetries: 3 },
  );
  assert.equal(primaryTries, 1, '4xx 不重试');
  assert.equal(res.target.model, FALLBACK.model);
});

test('熔断开路：连续失败达阈值后该档被跳过', async () => {
  resetBreakers();
  const key = breakerKey(PRIMARY.baseUrl, PRIMARY.model);
  for (let i = 0; i < BREAKER_THRESHOLD; i += 1) recordFailure(key);
  assert.equal(gate(key), 'open', '达阈值应开路');

  let primaryHit = false;
  const res = await runWithFallback(
    [PRIMARY, FALLBACK],
    async (t) => {
      if (t.model === PRIMARY.model) primaryHit = true;
      return t.model;
    },
    { timeoutMs: 1_000, maxRetries: 0 },
  );
  assert.equal(primaryHit, false, '开路档不应被调用');
  assert.equal(res.target.model, FALLBACK.model);
});

test('全链路熔断 → 抛 429（不击穿下游）', async () => {
  resetBreakers();
  for (const t of [PRIMARY, FALLBACK]) {
    const key = breakerKey(t.baseUrl, t.model);
    for (let i = 0; i < BREAKER_THRESHOLD; i += 1) recordFailure(key);
  }
  await assert.rejects(
    () => runWithFallback([PRIMARY, FALLBACK], async () => 'never', { timeoutMs: 1_000 }),
    (err: unknown) => err instanceof ApiError && err.status === 429,
  );
});

test('空链路 → 抛 503 并提示配置 API Key', async () => {
  resetBreakers();
  await assert.rejects(
    () => runWithFallback([], async () => 'x', { timeoutMs: 1_000 }),
    (err: unknown) => err instanceof ApiError && err.status === 503 && /API Key/.test(err.message),
  );
});

test('全档非熔断失败 → 抛 503 携带最后错误', async () => {
  resetBreakers();
  await assert.rejects(
    () =>
      runWithFallback(
        [PRIMARY, FALLBACK],
        async () => {
          throw Object.assign(new Error('boom'), { statusCode: 500 });
        },
        { timeoutMs: 1_000, maxRetries: 0 },
      ),
    (err: unknown) => err instanceof ApiError && err.status === 503,
  );
});

test('成功调用清零熔断计数（半开探测成功后恢复）', async () => {
  resetBreakers();
  const key = breakerKey(PRIMARY.baseUrl, PRIMARY.model);
  recordFailure(key);
  recordFailure(key);
  assert.equal(snapshot(key).failures, 2);
  await runWithFallback([PRIMARY], async () => 'ok', { timeoutMs: 1_000 });
  assert.equal(snapshot(key).failures, 0, '成功后应清零');
});

test('成本换算：Hy3 单价 + Prompt Cache 折扣（人民币分）', () => {
  // 1M 输入 = 100 分，1M 输出 = 400 分
  assert.equal(costCents('hy3', { tokensIn: 1_000_000, tokensOut: 0, cachedIn: 0 }), 100);
  assert.equal(costCents('hy3', { tokensIn: 0, tokensOut: 1_000_000, cachedIn: 0 }), 400);
  // 全部命中缓存：输入按 0.25 计
  assert.equal(
    costCents('hy3', { tokensIn: 1_000_000, tokensOut: 0, cachedIn: 1_000_000 }),
    25,
  );
  // lite 档单价为 1/10
  assert.equal(priceOf('hunyuan-lite').inCentsPerMTok, 10);
  // 未知模型保守按 Hy3 估
  assert.deepEqual(priceOf('some-unknown-model'), priceOf('hy3'));
});
