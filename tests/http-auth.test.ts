/**
 * HTTP 契约层单测：响应包络、参数白名单、限流、JWT、SSE 帧格式。
 * 这些是所有端点共用底座，一处错则全线错，所以断言到字节级（SSE 帧格式与前端解析器对齐）。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { accessTtlSeconds, issueTokens, refreshTtlSeconds, verifyToken } from '../src/lib/auth/jwt';
import { hashPassword, verifyPassword } from '../src/lib/auth/password';
import {
  ApiError,
  badRequest,
  conflict,
  fail,
  forbidden,
  notFound,
  ok,
  paginate,
  rateLimited,
  route,
  unauthorized,
  unavailable,
  unprocessable,
} from '../src/lib/http/envelope';
import {
  clampInt,
  pageQuery,
  readJson,
  requireBoolean,
  requireEmail,
  requireEnum,
  requirePassword,
  requireString,
  requireUuid,
} from '../src/lib/http/params';
import { LIMITS, clientKey, enforceLimit, resetLimits } from '../src/lib/http/rate-limit';
import { sseResponse, type SseEvent } from '../src/lib/http/sse';

const UUID = '3f1c9a4e-8b2d-4c1a-9f3e-6d7a2b5c8e10';

test('响应包络：成功 code=0，失败 code 与 status 一致', async () => {
  const good = ok({ id: 1 }, 201);
  assert.equal(good.status, 201);
  assert.deepEqual(await good.json(), { code: 0, data: { id: 1 }, message: '' });
  assert.equal(good.headers.get('cache-control'), 'no-store');

  const bad = fail(409, '已存在');
  assert.equal(bad.status, 409);
  assert.deepEqual(await bad.json(), { code: 409, data: null, message: '已存在' });
});

test('错误构造器：status 与 code 一一对应（400/401/403/404/409/422/429/503）', () => {
  const cases: [ApiError, number][] = [
    [badRequest('x'), 400],
    [unauthorized(), 401],
    [forbidden(), 403],
    [notFound(), 404],
    [conflict('x'), 409],
    [unprocessable('x'), 422],
    [rateLimited('x'), 429],
    [unavailable('x'), 503],
  ];
  for (const [err, status] of cases) {
    assert.equal(err.status, status);
    assert.equal(err.code, status, 'code 必须与 status 一致（前端按 code 分支）');
  }
});

test('route 包裹器：ApiError 映射对应状态，未知错误统一 500 且不外泄细节', async () => {
  const mapped = await route('test', async () => {
    throw conflict('冲突了');
  });
  assert.equal(mapped.status, 409);
  assert.equal((await mapped.json()).message, '冲突了');

  const unknown = await route('test', async () => {
    throw new Error('数据库连接串 postgres://user:pass@host');
  });
  assert.equal(unknown.status, 500);
  const body = await unknown.json();
  assert.equal(body.message, '内部错误，请重试');
  assert.doesNotMatch(JSON.stringify(body), /postgres:\/\//, '内部细节不得外泄');

  const badJson = await route('test', async () => {
    throw new SyntaxError('Unexpected token');
  });
  assert.equal(badJson.status, 400);
});

test('分页信封：items/total/page/limit/hasMore（Spec §5）', () => {
  assert.deepEqual(paginate([1, 2], 50, 1, 20), {
    items: [1, 2],
    total: 50,
    page: 1,
    limit: 20,
    hasMore: true,
  });
  assert.equal(paginate([], 40, 2, 20).hasMore, false, '最后一页 hasMore 必须为 false');
  assert.equal(paginate([], 41, 2, 20).hasMore, true);
});

test('分页参数：默认值 + 上限 100（禁止全量拉取）', () => {
  const base = 'https://x.test/api/v1/topics';
  assert.deepEqual(pageQuery(new URL(base)), { page: 1, limit: 20, offset: 0 });
  assert.equal(pageQuery(new URL(`${base}?limit=9999`)).limit, 100, 'limit 必须封顶 100');
  assert.equal(pageQuery(new URL(`${base}?limit=0`)).limit, 1);
  assert.equal(pageQuery(new URL(`${base}?page=abc`)).page, 1, '非法 page 回落 1');
  assert.equal(pageQuery(new URL(`${base}?page=3&limit=10`)).offset, 20);
  assert.equal(clampInt('-5', 1, 1, 100), 1);
});

test('参数白名单：uuid / email / password / enum / boolean 都拒绝脏输入', () => {
  assert.equal(requireUuid(UUID), UUID);
  assert.throws(() => requireUuid('123'), (e: unknown) => e instanceof ApiError && e.status === 400);
  assert.throws(() => requireUuid(undefined), ApiError);

  assert.equal(requireEmail('  USER@Example.COM '), 'user@example.com', '邮箱须归一化小写');
  assert.throws(() => requireEmail('not-an-email'), (e: unknown) => e instanceof ApiError && e.status === 422);

  assert.equal(requirePassword('12345678'), '12345678');
  assert.throws(() => requirePassword('short'), ApiError);
  assert.throws(() => requirePassword('x'.repeat(129)), ApiError);

  assert.equal(requireEnum('toutiao', ['toutiao', 'wechat'] as const, 'platform'), 'toutiao');
  assert.throws(() => requireEnum('weibo', ['toutiao', 'wechat'] as const, 'platform'), ApiError);

  assert.equal(requireBoolean(true, 'enabled'), true);
  assert.throws(() => requireBoolean('true', 'enabled'), ApiError, '字符串 true 不得当布尔');

  assert.equal(requireString('  有内容  ', 'title'), '有内容');
  assert.throws(() => requireString('   ', 'title'), ApiError);
  assert.throws(() => requireString('x'.repeat(201), 'title'), ApiError);
});

test('readJson：空 body 返回 {}，数组/标量拒绝', async () => {
  const empty = new Request('https://x.test', { method: 'POST', body: '' });
  assert.deepEqual(await readJson(empty), {});
  const arr = new Request('https://x.test', { method: 'POST', body: '[1,2]' });
  await assert.rejects(() => readJson(arr), ApiError);
  const bad = new Request('https://x.test', { method: 'POST', body: '{oops' });
  await assert.rejects(() => readJson(bad), SyntaxError);
});

test('限流：登录 10 次/分钟，超限抛 429 且提示剩余秒数', () => {
  resetLimits();
  assert.equal(LIMITS.auth.max, 10);
  for (let i = 0; i < LIMITS.auth.max; i += 1) {
    assert.doesNotThrow(() => enforceLimit('auth', 'ip:1.2.3.4'), `第 ${i + 1} 次不应被拦`);
  }
  assert.throws(
    () => enforceLimit('auth', 'ip:1.2.3.4'),
    (err: unknown) => err instanceof ApiError && err.status === 429 && /秒后重试/.test(err.message),
  );
  // 不同 key 互不影响
  assert.doesNotThrow(() => enforceLimit('auth', 'ip:5.6.7.8'));
  // 不同 scope 独立计数
  assert.doesNotThrow(() => enforceLimit('score', 'ip:1.2.3.4'));
  resetLimits();
});

test('限流：打分/生成 6 次/分钟（贵操作更严）', () => {
  resetLimits();
  assert.equal(LIMITS.score.max, 6);
  assert.equal(LIMITS.generate.max, 6);
  for (let i = 0; i < 6; i += 1) enforceLimit('generate', 'u:user-1');
  assert.throws(() => enforceLimit('generate', 'u:user-1'), ApiError);
  resetLimits();
});

test('限流 key：优先用户 id，否则取代理链首个 IP', () => {
  const req = new Request('https://x.test', {
    headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'x-real-ip': '10.0.0.1' },
  });
  assert.equal(clientKey(req, 'user-1'), 'u:user-1');
  assert.equal(clientKey(req), 'ip:203.0.113.9', '须取最左侧客户端 IP');
  assert.equal(clientKey(new Request('https://x.test')), 'ip:unknown');
});

test('JWT：access 15min / refresh 7d，kind 不匹配一律 401', () => {
  assert.equal(accessTtlSeconds, 15 * 60);
  assert.equal(refreshTtlSeconds, 7 * 24 * 3_600);
  const pair = issueTokens({ id: UUID, email: 'user@example.com' });
  assert.equal(pair.expiresIn, 15 * 60);

  const access = verifyToken(pair.accessToken, 'access');
  assert.equal(access.sub, UUID);
  assert.equal(access.email, 'user@example.com');
  assert.equal(verifyToken(pair.refreshToken, 'refresh').kind, 'refresh');

  // 用 refresh 冒充 access（或反之）必须拒绝
  assert.throws(
    () => verifyToken(pair.refreshToken, 'access'),
    (e: unknown) => e instanceof ApiError && e.status === 401,
  );
  assert.throws(() => verifyToken(pair.accessToken, 'refresh'), ApiError);
  // 篡改签名
  assert.throws(() => verifyToken(`${pair.accessToken}x`, 'access'), ApiError);
  assert.throws(() => verifyToken('garbage', 'access'), ApiError);
});

test('密码：bcrypt 哈希不可逆、同密码两次哈希不同、校验正确', async () => {
  const hash = await hashPassword('correct horse battery');
  assert.notEqual(hash, 'correct horse battery');
  assert.match(hash, /^\$2[aby]\$/, '必须是 bcrypt 格式');
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
  const hash2 = await hashPassword('correct horse battery');
  assert.notEqual(hash, hash2, '必须带随机 salt');
});

test('SSE：帧格式为 data: <json> + 空行，与前端解析器对齐', async () => {
  const events: SseEvent[] = [
    { type: 'block', payload: { type: 'paragraph' } },
    { type: 'done', payload: { draftId: UUID } },
  ];
  const res = sseResponse(async function* () {
    for (const e of events) yield e;
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.equal(res.headers.get('x-accel-buffering'), 'no', '必须关反代缓冲，否则流被攒成一坨');
  const body = await res.text();
  assert.equal(
    body,
    'data: {"type":"block","payload":{"type":"paragraph"}}\n\n' +
      `data: {"type":"done","payload":{"draftId":"${UUID}"}}\n\n`,
  );
});

test('SSE：生成器抛错转 error 事件，流仍正常关闭（不留半截连接）', async () => {
  const res = sseResponse(async function* () {
    yield { type: 'block', payload: 1 };
    throw new Error('模型不可用');
  });
  const body = await res.text();
  assert.match(body, /"type":"block"/);
  assert.match(body, /"type":"error"/);
  assert.match(body, /模型不可用/);
  assert.ok(body.endsWith('\n\n'), '最后一帧必须完整结尾');
});

test('SSE：客户端断开时中止生成器（不继续烧 token）', async () => {
  const abort = new AbortController();
  let produced = 0;
  const res = sseResponse(async function* (signal) {
    for (let i = 0; i < 100; i += 1) {
      if (signal.aborted) return;
      produced += 1;
      if (produced === 2) abort.abort();
      yield { type: 'block', payload: i };
    }
  }, abort.signal);
  await res.text();
  assert.ok(produced <= 3, `断开后应立即停产，实际产出 ${produced} 块`);
});
