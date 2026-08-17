/**
 * 各平台热榜解析（只取标题 / 热度 / 榜位 —— C-4「不抓正文」）。
 * 解析目标是页面内嵌的 JSON（比 DOM 抓取稳），失败即抛，由 worker 记失败退避。
 * 页面结构随时可能变，所以：解析器只负责「尽力提取」，字段缺失不致命，整体空数组才算失败。
 */
import type { RawItem } from './normalize';
import type { SourceKey } from './sources';

export class CollectionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectionParseError';
  }
}

type Json = Record<string, unknown>;

function asString(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

/** 热度可能是 "1234万" / "4,382,109" / 数字，统一转整数。 */
export function parseHeat(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
  const s = asString(v).replace(/[, ]/g, '');
  if (!s) return 0;
  const m = /^([\d.]+)\s*(万|亿)?/.exec(s);
  if (!m) return 0;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return 0;
  const mult = m[2] === '亿' ? 1e8 : m[2] === '万' ? 1e4 : 1;
  return Math.max(0, Math.trunc(base * mult));
}

/** 从 html 中截取首个平衡括号的 JSON 对象/数组。 */
function sliceJson(html: string, startIdx: number): string | null {
  const open = html[startIdx];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = startIdx; i < html.length; i += 1) {
    const ch = html[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return html.slice(startIdx, i + 1);
    }
  }
  return null;
}

function jsonAfter(html: string, marker: RegExp): Json | unknown[] | null {
  const m = marker.exec(html);
  if (!m) return null;
  const from = html.indexOf(m[0]) + m[0].length;
  const braceAt = html.slice(from).search(/[[{]/);
  if (braceAt < 0) return null;
  const raw = sliceJson(html, from + braceAt);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Json | unknown[];
  } catch {
    return null;
  }
}

function pickList(root: unknown, keys: string[]): unknown[] {
  if (Array.isArray(root)) return root;
  if (!root || typeof root !== 'object') return [];
  const obj = root as Json;
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) return v;
  }
  // 兜底：深度优先找第一个「元素含 title 类字段」的数组
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && v.some((e) => e && typeof e === 'object' && hasTitle(e as Json))) return v;
    if (v && typeof v === 'object') {
      const nested = pickList(v, keys);
      if (nested.length) return nested;
    }
  }
  return [];
}

const TITLE_KEYS = ['Title', 'title', 'word', 'query', 'name', 'target_title'];
const HEAT_KEYS = ['HotValue', 'hotValue', 'hot_value', 'heat', 'hotScore', 'hot_score', 'view', 'score'];
const ID_KEYS = ['ClusterIdStr', 'ClusterId', 'id', 'bvid', 'aid', 'card_id', 'url'];

function hasTitle(o: Json): boolean {
  return TITLE_KEYS.some((k) => typeof o[k] === 'string' && (o[k] as string).trim().length > 0);
}

function readBy(o: Json, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
}

/** 通用条目提取：从任意数组里榨出 {title, heat, id}。 */
export function itemsFromList(list: unknown[]): RawItem[] {
  const out: RawItem[] = [];
  list.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') return;
    const o = entry as Json;
    // 部分平台把内容包一层（如 { target: {...} }）
    const src = hasTitle(o) ? o : ((o.target ?? o.data ?? o.card) as Json | undefined);
    if (!src || typeof src !== 'object' || !hasTitle(src)) return;
    const title = asString(readBy(src, TITLE_KEYS)).trim();
    if (!title) return;
    out.push({
      id: asString(readBy(src, ID_KEYS)) || undefined,
      title,
      heat: parseHeat(readBy(src, HEAT_KEYS)),
      rank: out.length + 1 || idx + 1,
    });
  });
  return out;
}

const MARKERS: Record<SourceKey, RegExp[]> = {
  toutiao_hot_event: [/window\._ROUTER_DATA\s*=/, /"data"\s*:/],
  baidu_rs: [/<!--s-data:/, /"cards"\s*:/],
  zhihu_hot: [/js-initialData"[^>]*>/, /"initialState"\s*:/],
  bilibili_hot: [/__INITIAL_STATE__\s*=/, /"list"\s*:/],
};

const LIST_KEYS = ['data', 'list', 'cards', 'content', 'hotBoardData', 'items', 'result'];

/**
 * 解析入口。html 可能本身就是 JSON（部分源直接返回 API JSON）。
 * 空结果一律抛错 —— 静默返回 0 条会让「采集成功但没数据」变成沉默故障（失效模式 #2）。
 */
export function parseSource(key: SourceKey, body: string): RawItem[] {
  const trimmed = body.trim();
  let root: unknown = null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      root = JSON.parse(trimmed);
    } catch {
      root = null;
    }
  }
  if (!root) {
    for (const marker of MARKERS[key]) {
      root = jsonAfter(body, marker);
      if (root) break;
    }
  }
  if (!root) throw new CollectionParseError(`${key}：页面内未找到可解析的 JSON 数据`);
  const list = pickList(root, LIST_KEYS);
  const items = itemsFromList(list);
  if (!items.length) throw new CollectionParseError(`${key}：解析到 0 条榜单数据（页面结构可能已变）`);
  return items;
}
