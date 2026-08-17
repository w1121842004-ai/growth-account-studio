/**
 * robots / 协议守卫（C-4 / ADR-008）。
 * 所有出网请求必须先过 assertFetchAllowed —— 不合规的 URL 在「发起请求前」就被拦下。
 */
import { BLOCKED_HOSTS, BLOCKED_SOURCES, ROBOTS_RULES, sourceByKey, type SourceDef } from './sources';

export class CollectionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectionBlockedError';
  }
}

/** URL 级守卫：禁采域名、robots Disallow 前缀、白名单前缀之外一律拒绝。 */
export function assertFetchAllowed(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CollectionBlockedError(`采集地址非法：${rawUrl}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CollectionBlockedError(`采集协议不允许：${url.protocol}`);
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new CollectionBlockedError(`该域名永久禁采（开发者协议）：${host}`);
  }
  if (BLOCKED_SOURCES.some((name) => host.includes(name))) {
    throw new CollectionBlockedError(`该来源在禁采名单内：${host}`);
  }
  const rule = ROBOTS_RULES.find((r) => r.host === host);
  if (!rule) {
    throw new CollectionBlockedError(`域名不在采集白名单内：${host}`);
  }
  const path = url.pathname;
  if (rule.denyPrefixes.some((p) => path.startsWith(p))) {
    throw new CollectionBlockedError(`robots Disallow 路径，拒绝采集：${host}${path}`);
  }
  if (!rule.allowPrefixes.some((p) => path.startsWith(p))) {
    throw new CollectionBlockedError(`路径不在白名单前缀内：${host}${path}`);
  }
  return url;
}

/** 源级守卫：未核验 robots 的源即使被人工启用也拒绝出网（zhihu/bilibili）。 */
export function assertSourceEnabled(def: SourceDef): void {
  if (!def.robotsAllowed) {
    throw new CollectionBlockedError(
      `${def.label} 尚未核验 robots，禁止采集：${def.robotsNote}（核验通过后改 ALLOWED_SOURCES 并补单测）`,
    );
  }
}

/** 供路由层做启用前校验（PUT /sources/:id）。 */
export function canEnableSource(key: string): { ok: boolean; reason?: string } {
  const def = sourceByKey(key);
  if (!def) return { ok: false, reason: '该源不在白名单内（ALLOWED_SOURCES）' };
  if (!def.robotsAllowed) return { ok: false, reason: def.robotsNote };
  return { ok: true };
}
