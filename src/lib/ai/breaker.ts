/**
 * 熔断器（AC-08 / impl/model-adapter.md）。
 * 连续失败达阈值开路；冷却后放行一次半开探测；探测成功清零。
 * 进程内状态（单实例部署，Spec §3 明确不引 Redis）。
 */

export const BREAKER_THRESHOLD = Number(process.env.MODEL_BREAKER_THRESHOLD ?? 5);
export const BREAKER_OPEN_MS = Number(process.env.MODEL_BREAKER_OPEN_MS ?? 5 * 60_000);

export interface BreakerState {
  failures: number;
  openUntil: number;
  /** 半开探测占用中：同一时间只允许 1 个探测请求 */
  probing: boolean;
}

const states = new Map<string, BreakerState>();

export function breakerKey(baseUrl: string, model: string): string {
  return `${baseUrl}|${model}`;
}

function stateOf(key: string): BreakerState {
  const s = states.get(key) ?? { failures: 0, openUntil: 0, probing: false };
  states.set(key, s);
  return s;
}

export type Gate = 'closed' | 'half-open' | 'open';

/** 判定当前是否放行。half-open 表示这是唯一探测名额。 */
export function gate(key: string, now = Date.now()): Gate {
  const s = stateOf(key);
  if (s.openUntil === 0) return 'closed';
  if (now < s.openUntil) return 'open';
  if (s.probing) return 'open';
  s.probing = true;
  return 'half-open';
}

export function recordSuccess(key: string): void {
  states.set(key, { failures: 0, openUntil: 0, probing: false });
}

export function recordFailure(key: string, now = Date.now()): BreakerState {
  const s = stateOf(key);
  s.failures += 1;
  s.probing = false;
  if (s.failures >= BREAKER_THRESHOLD) {
    s.openUntil = now + BREAKER_OPEN_MS;
  }
  states.set(key, s);
  return s;
}

export function snapshot(key: string): BreakerState {
  const s = stateOf(key);
  return { ...s };
}

/** 测试与运维复位。 */
export function resetBreakers(): void {
  states.clear();
}
