/**
 * 采集层单测（AC-02 / C-4 / ADR-008）。
 * 覆盖：robots 守卫、白名单、单并发闸门、最小间隔、指数退避、幂等归一化、解析失败不静默。
 * 不连数据库：gate 走 collectionInternals，出网走注入的 fetcher / stub 过的 global fetch。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { CollectionFetchError, fetchText } from '../src/lib/collection/fetch';
import { bucketDate, normalizeItems } from '../src/lib/collection/normalize';
import { CollectionParseError, parseHeat, parseSource } from '../src/lib/collection/parsers';
import {
  assertFetchAllowed,
  assertSourceEnabled,
  canEnableSource,
  CollectionBlockedError,
} from '../src/lib/collection/robots';
import {
  ALLOWED_SOURCES,
  BACKOFF_CAP_MS,
  MIN_INTERVAL_MS,
  backoffMs,
  sourceByKey,
} from '../src/lib/collection/sources';
import { collectionInternals } from '../src/lib/collection/worker';

test('robots 守卫：微博永久禁采（R-3，任何路径都拦）', () => {
  for (const url of ['https://s.weibo.com/top/summary', 'https://m.weibo.cn/hot', 'http://weibo.com/']) {
    assert.throws(() => assertFetchAllowed(url), CollectionBlockedError, `未拦住 ${url}`);
  }
});

test('robots 守卫：只放行白名单域名 + 白名单路径前缀', () => {
  // 允许：头条 hot-event 聚合页、百度热搜 board
  assert.equal(assertFetchAllowed('https://www.toutiao.com/hot-event/').hostname, 'www.toutiao.com');
  assert.equal(assertFetchAllowed('https://top.baidu.com/board?tab=realtime').hostname, 'top.baidu.com');
  // 拒绝：Disallow 路径
  for (const path of ['/trending/', '/item/123', '/group/456', '/search?q=x']) {
    assert.throws(
      () => assertFetchAllowed(`https://www.toutiao.com${path}`),
      CollectionBlockedError,
      `Disallow 路径未拦：${path}`,
    );
  }
  // 拒绝：白名单域名但非白名单前缀
  assert.throws(() => assertFetchAllowed('https://top.baidu.com/buzz'), CollectionBlockedError);
  // 拒绝：域名不在白名单
  assert.throws(() => assertFetchAllowed('https://example.com/hot'), CollectionBlockedError);
  // 拒绝：非 http(s) 协议与非法 URL
  assert.throws(() => assertFetchAllowed('file:///etc/passwd'), CollectionBlockedError);
  assert.throws(() => assertFetchAllowed('not-a-url'), CollectionBlockedError);
});

test('源级守卫：robots 未核验的源即使被启用也禁止出网（知乎/B站）', () => {
  const unverified = ALLOWED_SOURCES.filter((s) => !s.robotsAllowed);
  assert.ok(unverified.length >= 2, '知乎/B站应为未核验状态');
  for (const def of unverified) {
    assert.throws(() => assertSourceEnabled(def), CollectionBlockedError, `${def.key} 未拦`);
    assert.equal(canEnableSource(def.key).ok, false, `${def.key} 不应允许启用`);
  }
  const verified = ALLOWED_SOURCES.filter((s) => s.robotsAllowed);
  for (const def of verified) {
    assert.doesNotThrow(() => assertSourceEnabled(def));
    assert.equal(canEnableSource(def.key).ok, true);
  }
  assert.equal(canEnableSource('weibo_hot').ok, false, '白名单外的 key 不得启用');
  assert.equal(sourceByKey('weibo_hot'), undefined);
});

test('fetchText：非法地址在出网前被拦，零流量', async () => {
  const original = globalThis.fetch;
  let called = 0;
  globalThis.fetch = (async () => {
    called += 1;
    return new Response('should not happen');
  }) as typeof fetch;
  try {
    await assert.rejects(() => fetchText('https://s.weibo.com/top/summary'), CollectionBlockedError);
    assert.equal(called, 0, 'robots 守卫必须在 fetch 之前生效');
  } finally {
    globalThis.fetch = original;
  }
});

test('fetchText：非 2xx 与 3xx 跳转都转成 CollectionFetchError（带状态码）', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response('rate limited', { status: 429 })) as typeof fetch;
    await assert.rejects(
      () => fetchText('https://top.baidu.com/board?tab=realtime'),
      (err: unknown) => err instanceof CollectionFetchError && err.status === 429,
    );
    globalThis.fetch = (async () =>
      new Response(null, { status: 302, headers: { location: 'https://evil.example.com' } })) as typeof fetch;
    await assert.rejects(
      () => fetchText('https://top.baidu.com/board?tab=realtime'),
      (err: unknown) => err instanceof CollectionFetchError && err.status === 302,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('指数退避：60s 起翻倍，30min 封顶（不指数爆炸）', () => {
  assert.equal(backoffMs(0), 0);
  assert.equal(backoffMs(1), 60_000);
  assert.equal(backoffMs(2), 120_000);
  assert.equal(backoffMs(3), 240_000);
  assert.equal(backoffMs(10), BACKOFF_CAP_MS, '第 10 次失败应已封顶');
  assert.equal(backoffMs(99), BACKOFF_CAP_MS);
  for (let f = 1; f <= 20; f += 1) assert.ok(backoffMs(f) <= BACKOFF_CAP_MS);
});

const DEF = ALLOWED_SOURCES[0];
const NOW = new Date('2026-08-16T12:00:00Z');

function cfg(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cfg-1',
    key: DEF.key,
    name: DEF.label,
    endpoint: DEF.endpoint,
    enabled: true,
    lastFetch: null,
    failures: 0,
    nextRetryAt: null,
    createdAt: NOW,
    ...over,
  } as never;
}

test('采集闸门：未启用 / 退避中 / 未到 30min 间隔都要 skip', () => {
  const { gate } = collectionInternals;
  assert.match(gate(DEF, cfg({ enabled: false }), {}, NOW) ?? '', /未启用/);
  assert.match(
    gate(DEF, cfg({ failures: 2, nextRetryAt: new Date(NOW.getTime() + 60_000) }), {}, NOW) ?? '',
    /退避中/,
  );
  assert.match(
    gate(DEF, cfg({ lastFetch: new Date(NOW.getTime() - MIN_INTERVAL_MS + 60_000) }), {}, NOW) ?? '',
    /最小采集间隔/,
  );
  // 刚好到点 / 从未采过 → 放行
  assert.equal(gate(DEF, cfg({ lastFetch: new Date(NOW.getTime() - MIN_INTERVAL_MS) }), {}, NOW), null);
  assert.equal(gate(DEF, cfg(), {}, NOW), null);
});

test('采集闸门：force 只跳过间隔，不跳过退避与启停', () => {
  const { gate } = collectionInternals;
  const recent = cfg({ lastFetch: new Date(NOW.getTime() - 60_000) });
  assert.match(gate(DEF, recent, {}, NOW) ?? '', /最小采集间隔/);
  assert.equal(gate(DEF, recent, { force: true }, NOW), null, 'force 应跳过间隔');
  const backing = cfg({ failures: 3, nextRetryAt: new Date(NOW.getTime() + 120_000) });
  assert.match(gate(DEF, backing, { force: true }, NOW) ?? '', /退避中/, 'force 不得绕过退避');
  assert.match(gate(DEF, cfg({ enabled: false }), { force: true }, NOW) ?? '', /未启用/);
});

test('归一化幂等：同日同条目键去重，只留标题/热度/榜位', () => {
  const rows = normalizeItems('toutiao', [
    { id: 'c-1', title: '一个足够长的热榜标题', heat: 12345.9, rank: 1 },
    { id: 'c-1', title: '一个足够长的热榜标题（重复条目）', heat: 99999, rank: 2 },
    { id: '', title: '没有 id 用榜位兜底的标题', heat: 500, rank: 3 },
    { title: '短', heat: 1, rank: 4 },
  ], { now: NOW });
  assert.equal(rows.length, 2, '重复 id 与过短标题都应被丢掉');
  assert.equal(rows[0].sourceItemKey, 'c-1');
  assert.equal(rows[0].heat, 12345, '热度取整');
  assert.equal(rows[1].sourceItemKey, 'rank-3', '缺 id 用榜位兜底');
  assert.equal(rows[0].bucketDate, bucketDate(NOW));
  // 字段白名单：不存在正文类字段（C-4 不抓正文）
  for (const row of rows) {
    assert.deepEqual(
      Object.keys(row).sort(),
      ['bucketDate', 'domain', 'heat', 'platform', 'rank', 'sourceItemKey', 'title'],
    );
  }
});

test('归一化幂等：同一输入跑两次结果完全一致（可安全重放）', () => {
  const input = [
    { id: 'a', title: '重放一致性验证标题', heat: 10, rank: 1 },
    { id: 'b', title: '第二条重放一致性标题', heat: 20, rank: 2 },
  ];
  assert.deepEqual(normalizeItems('baidu', input, { now: NOW }), normalizeItems('baidu', input, { now: NOW }));
});

test('热度解析：万 / 亿 / 千分位 / 脏数据', () => {
  assert.equal(parseHeat(4382109), 4382109);
  assert.equal(parseHeat('4,382,109'), 4382109);
  assert.equal(parseHeat('1234万'), 12_340_000);
  assert.equal(parseHeat('1.5亿'), 150_000_000);
  assert.equal(parseHeat('暂无'), 0);
  assert.equal(parseHeat(undefined), 0);
  assert.equal(parseHeat(-5), 0);
});

test('解析器：0 条一律抛错，不静默返回空（失效模式 #2）', () => {
  const html = '<html><body><script>window._ROUTER_DATA = {"data":{"list":[]}}</script></body></html>';
  assert.throws(() => parseSource('toutiao_hot_event', html), CollectionParseError);
  assert.throws(() => parseSource('toutiao_hot_event', '<html>没有 JSON</html>'), CollectionParseError);
});

test('解析器：从页面内嵌 JSON 提取标题与热度', () => {
  const html = `<html><script>window._ROUTER_DATA = {"data":{"list":[
    {"ClusterIdStr":"7001","Title":"第一条热榜标题","HotValue":"1234万"},
    {"ClusterIdStr":"7002","Title":"第二条热榜标题","HotValue":"88,000"}
  ]}}</script></html>`;
  const items = parseSource('toutiao_hot_event', html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, '第一条热榜标题');
  assert.equal(items[0].heat, 12_340_000);
  assert.equal(items[0].rank, 1);
  assert.equal(items[1].id, '7002');
});
