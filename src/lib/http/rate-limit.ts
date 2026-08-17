/**
 * 进程内滑动窗口限流（敏感端点：登录/注册/打分/生成）。
 * 不引 Redis（Spec §3 明确不做）；MVP 单实例单用户，进程内计数足够。
 * 超限抛 429，与 openapi RateLimited 对齐。
 */
import { rateLimited } from './envelope';

interface Window {
  hits: number[];
}

const buckets = new Map<string, Window>();
const MAX_KEYS = 5_000;

export interface LimitRule {
  /** 窗口长度（毫秒） */
  windowMs: number;
  /** 窗口内最大请求数 */
  max: number;
}

export const LIMITS: Record<string, LimitRule> = {
  auth: { windowMs: 60_000, max: 10 },
  score: { windowMs: 60_000, max: 6 },
  generate: { windowMs: 60_000, max: 6 },
};

/** 客户端标识：优先真实用户，其次代理链 IP（Caddy 反代注入）。 */
export function clientKey(req: Request, userId?: string): string {
  if (userId) return `u:${userId}`;
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  const ip = fwd.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}

export function enforceLimit(scope: keyof typeof LIMITS | string, key: string): void {
  const rule = LIMITS[scope] ?? { windowMs: 60_000, max: 30 };
  const now = Date.now();
  const id = `${scope}:${key}`;
  if (buckets.size > MAX_KEYS) buckets.clear();
  const bucket = buckets.get(id) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < rule.windowMs);
  if (bucket.hits.length >= rule.max) {
    buckets.set(id, bucket);
    const retryInSec = Math.ceil((rule.windowMs - (now - bucket.hits[0])) / 1000);
    throw rateLimited(`请求过于频繁，请 ${retryInSec} 秒后重试`);
  }
  bucket.hits.push(now);
  buckets.set(id, bucket);
}

/** 测试辅助：清空计数。 */
export function resetLimits(): void {
  buckets.clear();
}
