/**
 * 采集结果归一化（C-4：只留标题/热度/榜位元数据）。
 * 这里是「不抓正文」的最后一道闸：产出对象的字段是白名单，正文字段无处可去。
 */
import type { SourcePlatform } from './sources';

export interface RawItem {
  /** 平台条目稳定 ID；缺失时用榜位兜底 */
  id?: string;
  title: string;
  heat?: number;
  rank: number;
}

export interface TopicRow {
  platform: SourcePlatform;
  sourceItemKey: string;
  bucketDate: string;
  title: string;
  heat: number;
  rank: number;
  domain: string;
}

const MAX_TITLE = 180;
const MAX_ITEMS = 60;

export function bucketDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 标题清洗：去 HTML 实体残留、压缩空白、截断。 */
export function cleanTitle(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE);
}

/**
 * 归一化为 topics 行。
 * source_item_key = 平台条目 ID 或榜位（同日同榜位即同键，配合唯一索引保证幂等）。
 */
export function normalizeItems(
  platform: SourcePlatform,
  items: RawItem[],
  opts: { domain?: string; now?: Date } = {},
): TopicRow[] {
  const date = bucketDate(opts.now);
  const domain = opts.domain ?? '个人成长';
  const seen = new Set<string>();
  const rows: TopicRow[] = [];
  for (const item of items) {
    const title = cleanTitle(item.title ?? '');
    if (title.length < 4) continue;
    const key = (item.id && item.id.trim()) || `rank-${item.rank}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      platform,
      sourceItemKey: key,
      bucketDate: date,
      title,
      heat: Number.isFinite(item.heat) ? Math.max(0, Math.trunc(item.heat as number)) : 0,
      rank: Math.max(0, Math.trunc(item.rank)),
      domain,
    });
    if (rows.length >= MAX_ITEMS) break;
  }
  return rows;
}
