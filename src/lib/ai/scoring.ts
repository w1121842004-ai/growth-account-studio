/**
 * 选题打分（F1/AC-01/AC-09/ADR-006）。
 * 竞争度输入只有三样：跨平台共现数、与历史采纳的标题重复度、LLM 对标题语义的判断。
 * 全程不抓取任何文章正文（R-3/B-3）。
 * 无可用模型（未配 key / 熔断）时降级为词典打分，端点仍返回结果并标记 degraded。
 */
import { completeText } from './adapter';
import { parseJsonLines } from './parse';
import { SCORING_SYSTEM, buildScoringUser, type ScoringItem } from './prompts';

export interface ScoreWeights {
  heat: number;
  relevance: number;
  competition: number;
}

/** ADR-006 默认权重：score = 0.45·heat + 0.40·relevance − 0.15·competition */
export const DEFAULT_WEIGHTS: ScoreWeights = { heat: 0.45, relevance: 0.4, competition: 0.15 };

/** 赛道词典（无模型时的降级依据；权重按与「个人成长」贴合度手工排序） */
const KEYWORDS: { words: string[]; weight: number }[] = [
  { words: ['自我提升', '个人成长', '自律', '习惯', '复盘', '认知', '心态', '内耗', '情绪'], weight: 0.9 },
  { words: ['效率', '时间管理', '专注', '拖延', '拖延症', '目标', '计划', '精力'], weight: 0.8 },
  { words: ['AI', '大模型', '工具', '自动化', '提效', 'ChatGPT', '智能体'], weight: 0.75 },
  { words: ['学习', '读书', '笔记', '考研', '考证', '技能', '写作', '表达'], weight: 0.7 },
  { words: ['副业', '兼职', '自由职业', '求职', '面试', '职场', '转行', '收入'], weight: 0.6 },
  { words: ['焦虑', '压力', '失眠', '健康', '运动', '早起', '断舍离'], weight: 0.55 },
];

const NOISE = ['明星', '八卦', '球队', '比赛', '股价', '涨停', '疫情', '车祸', '判刑', '彩票'];

/** 词典相关度（0-1）：命中最高权重打底，多命中小幅加成，噪声词扣分。 */
export function dictionaryRelevance(title: string): number {
  let best = 0.2;
  let hits = 0;
  for (const group of KEYWORDS) {
    if (group.words.some((w) => title.includes(w))) {
      best = Math.max(best, group.weight);
      hits += 1;
    }
  }
  let score = Math.min(1, best + Math.max(0, hits - 1) * 0.05);
  if (NOISE.some((w) => title.includes(w))) score = Math.max(0, score - 0.35);
  return round(score);
}

/** 竞争度信号合成（0-1）：跨平台共现越多、与历史采纳越重复，竞争越高。 */
export function competitionFromSignals(cooccurrence: number, historyOverlap: number): number {
  const cross = Math.min(1, Math.max(0, cooccurrence - 1) / 3); // 1 个平台=0，4 个平台=1
  return round(Math.min(1, cross * 0.6 + historyOverlap * 0.4));
}

/** 热度归一：榜单热度量级差异大，用对数压缩再截断到 0-1。 */
export function normalizeHeat(heat: number): number {
  if (heat <= 0) return 0;
  return round(Math.min(1, Math.log10(heat + 1) / 7));
}

export function computeScore(
  heatNorm: number,
  relevance: number,
  competition: number,
  w: ScoreWeights = DEFAULT_WEIGHTS,
): number {
  const raw = w.heat * heatNorm + w.relevance * relevance - w.competition * competition;
  return round(Math.min(1, Math.max(0, raw)));
}

function round(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export interface ScoredValue {
  relevance: number;
  competition: number;
}

export interface ScoreOutcome {
  values: Map<string, ScoredValue>;
  /** true = 未使用 LLM（无 key/熔断/解析失败），走词典降级 */
  degraded: boolean;
  degradedReason?: string;
  model?: string;
}

function fallbackValues(items: ScoringItem[]): Map<string, ScoredValue> {
  const map = new Map<string, ScoredValue>();
  for (const it of items) {
    map.set(it.id, {
      relevance: dictionaryRelevance(it.title),
      competition: competitionFromSignals(it.cooccurrence, it.historyOverlap),
    });
  }
  return map;
}

function clamp01(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return round(Math.min(1, Math.max(0, n)));
}

/**
 * 批量打分。LLM 成功则采用其 relevance/competition，未覆盖的条目用词典补齐；
 * LLM 不可用则整批降级（不抛错，选题池仍可用）。
 */
export async function scoreItems(
  items: ScoringItem[],
  opts: { domain: string; userId?: string; today?: string },
): Promise<ScoreOutcome> {
  const fallback = fallbackValues(items);
  if (items.length === 0) return { values: fallback, degraded: false };

  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  try {
    const { text, meta } = await completeText({
      kind: 'score',
      userId: opts.userId,
      system: SCORING_SYSTEM,
      user: buildScoringUser(opts.domain, today, items),
      temperature: 0.1,
      maxOutputTokens: Math.min(3_000, 120 + items.length * 40),
    });
    const rows = parseJsonLines(text);
    if (rows.length === 0) {
      return { values: fallback, degraded: true, degradedReason: '模型输出无法解析，已用词典打分' };
    }
    const values = new Map(fallback);
    for (const row of rows) {
      const id = typeof row.id === 'string' ? row.id : '';
      const base = values.get(id);
      if (!base) continue;
      values.set(id, {
        relevance: clamp01(row.relevance, base.relevance),
        competition: clamp01(row.competition, base.competition),
      });
    }
    return { values, degraded: false, model: meta.model };
  } catch (err) {
    return {
      values: fallback,
      degraded: true,
      degradedReason: `模型不可用，已用词典打分：${(err as Error).message}`,
    };
  }
}

export type { ScoringItem };
