/**
 * 采集编排（AC-02 / C-4 / ADR-008）。
 *
 * 硬约束落地位置：
 * - 单并发：模块级 running 闸 + 源之间串行（绝不并行出网）。
 * - 间隔 >= 30min：读 source_configs.last_fetch 判断，未到点直接 skip。
 * - 指数退避：失败累加 failures，写 next_retry_at = now + backoffMs(failures)。
 * - 幂等：唯一索引 (platform, source_item_key, bucket_date) + onConflictDoUpdate（只刷热度/榜位）。
 * - robots：出网前经 fetch.ts → assertFetchAllowed；未核验源经 assertSourceEnabled 拒绝。
 */
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { sourceConfigs, topics } from '../../db/schema';
import { fetchText, CollectionFetchError, type Fetcher } from './fetch';
import { normalizeItems, type TopicRow } from './normalize';
import { parseSource } from './parsers';
import { assertSourceEnabled, CollectionBlockedError } from './robots';
import { ALLOWED_SOURCES, MIN_INTERVAL_MS, backoffMs, sourceByKey, type SourceDef } from './sources';

export interface SourceResult {
  key: string;
  status: 'inserted' | 'skipped' | 'blocked' | 'failed';
  fetched: number;
  inserted: number;
  reason?: string;
}

export interface CollectRunReport {
  startedAt: string;
  finishedAt: string;
  results: SourceResult[];
  inserted: number;
  skipped: boolean;
}

export interface CollectOptions {
  /** 手动触发时忽略 30min 间隔（仍受 robots / 退避约束） */
  force?: boolean;
  /** 只跑指定源 */
  onlyKey?: string;
  /** 注入抓取实现（单测用；生产走 fetchText） */
  fetcher?: Fetcher;
  now?: Date;
}

let running = false;

export function isCollecting(): boolean {
  return running;
}

/** 首次运行把白名单写入 source_configs（幂等，key 唯一）。 */
export async function ensureSourceConfigs(): Promise<void> {
  const db = getDb();
  for (const def of ALLOWED_SOURCES) {
    await db
      .insert(sourceConfigs)
      .values({
        key: def.key,
        name: def.label,
        endpoint: def.endpoint,
        enabled: def.defaultEnabled && def.robotsAllowed,
      })
      .onConflictDoNothing({ target: sourceConfigs.key });
  }
}

type SourceConfigRow = typeof sourceConfigs.$inferSelect;

function gate(def: SourceDef, cfg: SourceConfigRow, opts: CollectOptions, now: Date): string | null {
  if (!cfg.enabled) return '该源未启用';
  if (cfg.nextRetryAt && cfg.nextRetryAt.getTime() > now.getTime()) {
    const wait = Math.ceil((cfg.nextRetryAt.getTime() - now.getTime()) / 1000);
    return `退避中，${wait}s 后重试（已连续失败 ${cfg.failures} 次）`;
  }
  if (!opts.force && cfg.lastFetch && now.getTime() - cfg.lastFetch.getTime() < MIN_INTERVAL_MS) {
    const left = Math.ceil((MIN_INTERVAL_MS - (now.getTime() - cfg.lastFetch.getTime())) / 60_000);
    return `未到最小采集间隔，还需 ${left} 分钟`;
  }
  void def;
  return null;
}

/** 写入选题：冲突时只刷热度/榜位，绝不覆盖评分与采纳状态。 */
export async function persistTopics(rows: TopicRow[]): Promise<number> {
  if (!rows.length) return 0;
  const db = getDb();
  const inserted = await db
    .insert(topics)
    .values(
      rows.map((r) => ({
        platform: r.platform,
        sourceItemKey: r.sourceItemKey,
        bucketDate: r.bucketDate,
        title: r.title,
        heat: r.heat,
        rank: r.rank,
        domain: r.domain,
      })),
    )
    .onConflictDoUpdate({
      target: [topics.platform, topics.sourceItemKey, topics.bucketDate],
      set: { heat: sql`excluded.heat`, rank: sql`excluded.rank` },
    })
    .returning({ id: topics.id });
  return inserted.length;
}

async function markSuccess(cfgId: string, now: Date): Promise<void> {
  await getDb()
    .update(sourceConfigs)
    .set({ lastFetch: now, failures: 0, nextRetryAt: null })
    .where(eq(sourceConfigs.id, cfgId));
}

async function markFailure(cfg: SourceConfigRow, now: Date): Promise<void> {
  const failures = cfg.failures + 1;
  await getDb()
    .update(sourceConfigs)
    .set({ failures, nextRetryAt: new Date(now.getTime() + backoffMs(failures)) })
    .where(eq(sourceConfigs.id, cfg.id));
}

async function runOne(
  def: SourceDef,
  cfg: SourceConfigRow,
  opts: CollectOptions,
  now: Date,
): Promise<SourceResult> {
  const skip = gate(def, cfg, opts, now);
  if (skip) return { key: def.key, status: 'skipped', fetched: 0, inserted: 0, reason: skip };
  try {
    assertSourceEnabled(def); // 未核验 robots 的源即使被启用也在此拦死
    const body = await (opts.fetcher ?? fetchText)(def.endpoint);
    const items = parseSource(def.key, body);
    const rows = normalizeItems(def.platform, items, { now });
    const inserted = await persistTopics(rows);
    await markSuccess(cfg.id, now);
    console.log(`[collect] ${def.key} ok, fetched=${items.length} upserted=${inserted}`);
    return { key: def.key, status: 'inserted', fetched: items.length, inserted };
  } catch (err) {
    if (err instanceof CollectionBlockedError) {
      console.warn(`[collect] ${def.key} blocked: ${err.message}`);
      return { key: def.key, status: 'blocked', fetched: 0, inserted: 0, reason: err.message };
    }
    const reason = err instanceof Error ? err.message : '未知错误';
    await markFailure(cfg, now).catch(() => undefined);
    const status = err instanceof CollectionFetchError ? err.status : 0;
    console.error(`[collect] ${def.key} failed (http=${status}): ${reason}`);
    return { key: def.key, status: 'failed', fetched: 0, inserted: 0, reason };
  }
}

/**
 * 跑一轮采集。串行遍历白名单源；已有任务在跑则直接返回 skipped（单并发）。
 */
export async function collectAll(opts: CollectOptions = {}): Promise<CollectRunReport> {
  const startedAt = new Date().toISOString();
  if (running) {
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      results: [],
      inserted: 0,
      skipped: true,
    };
  }
  running = true;
  const now = opts.now ?? new Date();
  const results: SourceResult[] = [];
  try {
    await ensureSourceConfigs();
    const db = getDb();
    const configs = opts.onlyKey
      ? await db.select().from(sourceConfigs).where(eq(sourceConfigs.key, opts.onlyKey))
      : await db.select().from(sourceConfigs);
    for (const cfg of configs) {
      const def = sourceByKey(cfg.key);
      if (!def) {
        results.push({
          key: cfg.key,
          status: 'blocked',
          fetched: 0,
          inserted: 0,
          reason: '该源不在白名单内，已跳过',
        });
        continue;
      }
      // 串行 await —— 单并发要求，禁止改成 Promise.all
      results.push(await runOne(def, cfg, opts, now));
    }
  } finally {
    running = false;
  }
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    results,
    inserted: results.reduce((sum, r) => sum + r.inserted, 0),
    skipped: false,
  };
}

/** 供 /sources 展示：白名单定义 + 库内启停状态合并。 */
export async function listSources() {
  await ensureSourceConfigs();
  const rows = await getDb().select().from(sourceConfigs);
  return ALLOWED_SOURCES.map((def) => {
    const row = rows.find((r) => r.key === def.key);
    return {
      id: row?.id ?? def.key,
      key: def.key,
      name: def.label,
      platform: def.platform,
      endpoint: def.endpoint,
      enabled: row?.enabled ?? false,
      robotsAllowed: def.robotsAllowed,
      robotsNote: def.robotsNote,
      lastFetch: row?.lastFetch?.toISOString() ?? null,
      failures: row?.failures ?? 0,
      nextRetryAt: row?.nextRetryAt?.toISOString() ?? null,
    };
  });
}

/** 仅供单测：暴露闸门判定，避免测试去 mock 数据库。 */
export const collectionInternals = { gate };
