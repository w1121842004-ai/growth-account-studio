/**
 * 出网封装（C-4 / ADR-008）。
 * 唯一允许发起采集请求的地方：先过 robots 守卫，再带 UA + 超时。
 * 不做重试——重试与退避由 worker 统一编排（避免叠加放大请求量）。
 */
import { assertFetchAllowed, CollectionBlockedError } from './robots';
import { REQUEST_TIMEOUT_MS, USER_AGENT } from './sources';

export class CollectionFetchError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'CollectionFetchError';
    this.status = status;
  }
}

export type Fetcher = (url: string) => Promise<string>;

/**
 * 拉取文本。任何非 2xx 或超时都抛 CollectionFetchError，由 worker 记失败并退避。
 * 注意：robots 守卫在 fetch 之前执行，非法地址不会产生任何出网流量。
 */
export async function fetchText(rawUrl: string): Promise<string> {
  const url = assertFetchAllowed(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'manual', // 跳转可能绕过 robots 白名单，一律不跟随
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/json;q=0.9,*/*;q=0.5',
        'accept-language': 'zh-CN,zh;q=0.9',
      },
    });
    if (res.status >= 300 && res.status < 400) {
      throw new CollectionFetchError(`来源发生跳转（不跟随，避免绕过 robots）：${res.status}`, res.status);
    }
    if (!res.ok) {
      throw new CollectionFetchError(`来源返回 ${res.status}`, res.status);
    }
    return await res.text();
  } catch (err) {
    if (err instanceof CollectionBlockedError || err instanceof CollectionFetchError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new CollectionFetchError(`请求超时（${REQUEST_TIMEOUT_MS}ms）`);
    }
    throw new CollectionFetchError(err instanceof Error ? err.message : '网络错误');
  } finally {
    clearTimeout(timer);
  }
}
