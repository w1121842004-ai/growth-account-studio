/**
 * 采集源白名单（Spec AC-02 / C-4 / ADR-008）——单一来源，改此处须走变更流程并补单测。
 *
 * 硬约束：
 * - 微博永不采集（《开发者协议》明文禁采，R-3），改由用户手动粘贴导入兜底。
 * - 头条仅采 hot-event 聚合路径；/trending/ /item/ /group/ /search 在 robots Disallow。
 * - 知乎/B站 robots 未在 Phase 1 核验 → robotsAllowed=false 且 defaultEnabled=false，启用前必验。
 * - 只取标题/热度/榜位元数据，绝不抓文章正文（AC-09 竞争度改用共现+去重+LLM）。
 */
export type SourceKey = 'toutiao_hot_event' | 'baidu_rs' | 'zhihu_hot' | 'bilibili_hot';

export type SourcePlatform = 'toutiao' | 'baidu' | 'zhihu' | 'bilibili';

export interface SourceDef {
  key: SourceKey;
  platform: SourcePlatform;
  label: string;
  /** 仅聚合/热榜路径 */
  endpoint: string;
  /** 实测结论：是否已核验允许抓取 */
  robotsAllowed: boolean;
  defaultEnabled: boolean;
  robotsNote: string;
}

export const ALLOWED_SOURCES: SourceDef[] = [
  {
    key: 'toutiao_hot_event',
    platform: 'toutiao',
    label: '头条热榜',
    endpoint: 'https://www.toutiao.com/hot-event/',
    robotsAllowed: true,
    defaultEnabled: true,
    robotsNote: '仅 hot-event 聚合路径；/trending/ /item/ /group/ /search 在 robots Disallow（禁采）',
  },
  {
    key: 'baidu_rs',
    platform: 'baidu',
    label: '百度热搜',
    endpoint: 'https://top.baidu.com/board?tab=realtime',
    robotsAllowed: true,
    defaultEnabled: true,
    robotsNote: 'robots 返回 404，无明确禁止',
  },
  {
    key: 'zhihu_hot',
    platform: 'zhihu',
    label: '知乎热榜',
    endpoint: 'https://www.zhihu.com/hot',
    robotsAllowed: false,
    defaultEnabled: false,
    robotsNote: 'Phase1 未核验 robots，启用前必验',
  },
  {
    key: 'bilibili_hot',
    platform: 'bilibili',
    label: 'B站热门',
    endpoint: 'https://www.bilibili.com/v/popular/rank/all',
    robotsAllowed: false,
    defaultEnabled: false,
    robotsNote: 'Phase1 未核验 robots，启用前必验',
  },
];

/** 永久禁采（开发者协议禁采，R-3） */
export const BLOCKED_SOURCES = ['weibo'];

/** 禁采域名（任何请求命中即拦截） */
export const BLOCKED_HOSTS = ['weibo.com', 's.weibo.com', 'weibo.cn', 'm.weibo.cn'];

/** 每域名 robots 边界（硬编码 + 单测，C-4） */
export const ROBOTS_RULES: { host: string; allowPrefixes: string[]; denyPrefixes: string[] }[] = [
  {
    host: 'www.toutiao.com',
    allowPrefixes: ['/hot-event'],
    denyPrefixes: ['/trending', '/item', '/group', '/search'],
  },
  { host: 'top.baidu.com', allowPrefixes: ['/board'], denyPrefixes: [] },
  { host: 'www.zhihu.com', allowPrefixes: ['/hot'], denyPrefixes: ['/question', '/people', '/search'] },
  {
    host: 'www.bilibili.com',
    allowPrefixes: ['/v/popular'],
    denyPrefixes: ['/video', '/read', '/search'],
  },
];

export const MIN_INTERVAL_MS = Number(process.env.COLLECTION_MIN_INTERVAL_MIN ?? 30) * 60_000;
export const BACKOFF_BASE_MS = 60_000;
export const BACKOFF_CAP_MS = 30 * 60_000;
export const REQUEST_TIMEOUT_MS = 15_000;
export const USER_AGENT =
  'GrowthStudioBot/0.1 (+https://example.com/bot; 仅采集公开热榜标题与热度元数据，不抓正文)';

export function sourceByKey(key: string): SourceDef | undefined {
  return ALLOWED_SOURCES.find((s) => s.key === key);
}

/** 指数退避：60s → 120s → … 上限 30min（达上限后不再指数爆炸）。 */
export function backoffMs(failures: number): number {
  if (failures <= 0) return 0;
  const raw = BACKOFF_BASE_MS * 2 ** (failures - 1);
  return Math.min(BACKOFF_CAP_MS, raw);
}
