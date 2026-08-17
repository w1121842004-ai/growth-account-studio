/**
 * 选题业务（F1：AC-01 / AC-09 / ADR-006）。
 * 打分只用标题元数据 + LLM 语义判断，绝不抓正文；LLM 不可用降级词典打分（端点仍可用）。
 */
import { and, desc, eq, gte, sql, type SQL } from 'drizzle-orm';
import { getDb, topics } from '../../db';
import {
  DEFAULT_WEIGHTS,
  computeScore,
  normalizeHeat,
  scoreItems,
  type ScoringItem,
} from '../ai/scoring';
import { ALLOWED_SOURCES, BLOCKED_SOURCES } from '../collection/sources';
import { bucketDate, cleanTitle } from '../collection/normalize';
import { notFound } from '../http/envelope';
import { paginate, type Page } from '../http/envelope';
import { computeSignals } from './topic-signals';

export type TopicRow = typeof topics.$inferSelect;

export interface TopicDto {
  id: string;
  platform: TopicRow['platform'];
  sourceItemKey: string;
  bucketDate: string;
  title: string;
  heat: number;
  relevance: number;
  competition: number;
  score: number;
  domain: string;
  adopted: boolean;
  duplicateWarning: boolean | null;
}

export function toDto(row: TopicRow): TopicDto {
  return {
    id: row.id,
    platform: row.platform,
    sourceItemKey: row.sourceItemKey,
    bucketDate: row.bucketDate,
    title: row.title,
    heat: row.heat,
    relevance: Number(row.relevance),
    competition: Number(row.competition),
    score: Number(row.score),
    domain: row.domain,
    adopted: row.adopted,
    duplicateWarning: row.duplicateWarning,
  };
}

export interface ListQuery {
  domain?: string;
  platform?: TopicRow['platform'];
  minScore?: number;
  page: number;
  limit: number;
}

export async function listTopics(q: ListQuery): Promise<Page<TopicDto>> {
  const db = getDb();
  const filters: SQL[] = [];
  if (q.domain) filters.push(eq(topics.domain, q.domain));
  if (q.platform) filters.push(eq(topics.platform, q.platform));
  if (q.minScore !== undefined) filters.push(gte(topics.score, String(q.minScore)));
  const where = filters.length ? and(...filters) : undefined;

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(topics)
    .where(where);
  const rows = await db
    .select()
    .from(topics)
    .where(where)
    .orderBy(desc(topics.score), desc(topics.heat), desc(topics.createdAt))
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);

  return paginate(rows.map(toDto), countRow?.n ?? 0, q.page, q.limit);
}

export async function getTopic(id: string): Promise<TopicDto> {
  const rows = await getDb().select().from(topics).where(eq(topics.id, id)).limit(1);
  if (!rows[0]) throw notFound('选题不存在');
  return toDto(rows[0]);
}

export async function adoptTopic(id: string): Promise<TopicDto> {
  const rows = await getDb()
    .update(topics)
    .set({ adopted: true })
    .where(eq(topics.id, id))
    .returning();
  if (!rows[0]) throw notFound('选题不存在');
  return toDto(rows[0]);
}

export interface ScoreResult {
  items: TopicDto[];
  degraded: boolean;
  degradedReason?: string;
  model?: string;
}

/**
 * 批量打分：取未采纳选题（按热度优先），算信号 → LLM/词典打分 → 回写 relevance/competition/score。
 * 逐条 update 而非批量 CASE：batchSize 上限 200，可读性优先；后续压测超标再改批量。
 */
export async function scoreTopics(opts: {
  domain?: string;
  batchSize?: number;
  userId: string;
}): Promise<ScoreResult> {
  const db = getDb();
  const limit = Math.min(200, Math.max(1, opts.batchSize ?? 50));
  const filters: SQL[] = [eq(topics.adopted, false)];
  if (opts.domain) filters.push(eq(topics.domain, opts.domain));
  const batch = await db
    .select()
    .from(topics)
    .where(and(...filters))
    .orderBy(desc(topics.heat), desc(topics.createdAt))
    .limit(limit);
  if (batch.length === 0) return { items: [], degraded: false };

  const adopted = await db
    .select({ title: topics.title })
    .from(topics)
    .where(eq(topics.adopted, true))
    .limit(500);
  const signals = computeSignals(
    batch.map((r) => ({ id: r.id, title: r.title, platform: r.platform })),
    adopted.map((r) => r.title),
  );

  const domain = opts.domain ?? batch[0].domain;
  const scoringItems: ScoringItem[] = batch.map((r) => {
    const s = signals.get(r.id)!;
    return {
      id: r.id,
      title: r.title,
      platform: r.platform,
      heat: r.heat,
      cooccurrence: s.cooccurrence,
      historyOverlap: s.historyOverlap,
    };
  });

  const outcome = await scoreItems(scoringItems, { domain, userId: opts.userId });
  const updated: TopicDto[] = [];
  for (const row of batch) {
    const v = outcome.values.get(row.id);
    if (!v) continue;
    const score = computeScore(normalizeHeat(row.heat), v.relevance, v.competition, DEFAULT_WEIGHTS);
    const [saved] = await db
      .update(topics)
      .set({
        relevance: v.relevance.toFixed(4),
        competition: v.competition.toFixed(4),
        score: score.toFixed(4),
        duplicateWarning: signals.get(row.id)!.duplicateWarning,
      })
      .where(eq(topics.id, row.id))
      .returning();
    if (saved) updated.push(toDto(saved));
  }
  updated.sort((a, b) => b.score - a.score);
  return {
    items: updated,
    degraded: outcome.degraded,
    degradedReason: outcome.degradedReason,
    model: outcome.model,
  };
}

export interface ImportInput {
  titles: string[];
  platform: TopicRow['platform'];
  domain?: string;
}

/**
 * 手动导入（微博等禁采源的兜底路径，R-3/C-4）。
 * 平台枚举仅限白名单四家；写入走同一唯一索引，重复粘贴不会产生重复选题。
 */
export async function importTopics(input: ImportInput): Promise<TopicDto[]> {
  const titles = input.titles
    .map((t) => cleanTitle(t))
    .filter((t) => t.length >= 4)
    .slice(0, 100);
  if (titles.length === 0) return [];
  const date = bucketDate();
  const domain = input.domain ?? '个人成长';
  const values = titles.map((title, i) => ({
    platform: input.platform,
    sourceItemKey: `manual-${date}-${hash(title)}`,
    bucketDate: date,
    title,
    heat: 0,
    rank: i + 1,
    domain,
  }));
  const rows = await getDb()
    .insert(topics)
    .values(values)
    .onConflictDoUpdate({
      target: [topics.platform, topics.sourceItemKey, topics.bucketDate],
      set: { title: sql`excluded.title` },
    })
    .returning();
  return rows.map(toDto);
}

/** 稳定短哈希（同标题同日 → 同键，保证手动导入幂等）。 */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** 采集白名单说明（前端设置页展示合规依据）。 */
export function whiteList() {
  return {
    allowed: ALLOWED_SOURCES.map((s) => ({
      key: s.key,
      platform: s.platform,
      name: s.label,
      endpoint: s.endpoint,
      robotsAllowed: s.robotsAllowed,
      robotsNote: s.robotsNote,
    })),
    blocked: BLOCKED_SOURCES.map((name) => ({
      name,
      reason: '《开发者协议》明文禁止采集，改由手动粘贴导入（R-3）',
    })),
    weights: DEFAULT_WEIGHTS,
  };
}
