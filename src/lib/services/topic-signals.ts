/**
 * 竞争度与重复预警的信号计算（AC-01 / AC-09）。
 *
 * 关键合规点：这里**只读 topics 表里的标题元数据**。不发任何出网请求、不抓文章正文。
 * 竞争度的三个输入：跨平台共现、与历史采纳标题的重复度、LLM 语义判断（LLM 在 scoring.ts）。
 */

/** 中文标题分词退化方案：抽取 2-gram 字组 + 连续英文/数字词。 */
export function titleGrams(title: string): Set<string> {
  const cleaned = title.replace(/[\s\p{P}]+/gu, '');
  const grams = new Set<string>();
  for (const word of title.match(/[A-Za-z0-9]{2,}/g) ?? []) grams.add(word.toLowerCase());
  for (let i = 0; i + 2 <= cleaned.length; i += 1) grams.add(cleaned.slice(i, i + 2));
  if (grams.size === 0 && cleaned.length > 0) grams.add(cleaned);
  return grams;
}

/** Jaccard 相似度（0-1）。用于共现判定与历史重复预警。 */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export const COOCCURRENCE_SIM = 0.5;
export const HISTORY_WARN_SIM = 0.72;

export interface SignalInput {
  id: string;
  title: string;
  platform: string;
}

export interface SignalOutput {
  /** 同题出现在几个平台（含自身，最小 1） */
  cooccurrence: number;
  /** 与历史已采纳标题的最大相似度（0-1） */
  historyOverlap: number;
  /** 高重复预警（AC-01） */
  duplicateWarning: boolean;
}

/**
 * 批内跨平台共现 + 与历史采纳标题的重复度。
 * 复杂度 O(n²)，n 受 batchSize（默认 50，上限 200）约束，够用且无需索引。
 */
export function computeSignals(
  batch: SignalInput[],
  adoptedTitles: string[],
): Map<string, SignalOutput> {
  const grams = new Map<string, Set<string>>();
  for (const item of batch) grams.set(item.id, titleGrams(item.title));
  const history = adoptedTitles.map((t) => titleGrams(t));

  const out = new Map<string, SignalOutput>();
  for (const item of batch) {
    const g = grams.get(item.id)!;
    const platforms = new Set<string>([item.platform]);
    for (const other of batch) {
      if (other.id === item.id || other.platform === item.platform) continue;
      if (similarity(g, grams.get(other.id)!) >= COOCCURRENCE_SIM) platforms.add(other.platform);
    }
    let overlap = 0;
    for (const h of history) overlap = Math.max(overlap, similarity(g, h));
    overlap = Math.round(overlap * 10_000) / 10_000;
    out.set(item.id, {
      cooccurrence: platforms.size,
      historyOverlap: overlap,
      duplicateWarning: overlap >= HISTORY_WARN_SIM,
    });
  }
  return out;
}
