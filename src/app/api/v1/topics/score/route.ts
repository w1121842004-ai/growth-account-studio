import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { optionalString, readJson } from '@/lib/http/params';
import { clientKey, enforceLimit } from '@/lib/http/rate-limit';
import { scoreTopics } from '@/lib/services/topic-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** 批量打分可能跑到 30s 超时上限，给足预算 */
export const maxDuration = 120;

export async function POST(req: Request): Promise<Response> {
  return route('topics.score', async () => {
    const user = await requireUser(req);
    // 打分要烧钱，按用户限流（每分钟 6 次）
    enforceLimit('score', clientKey(req, user.id));
    const body = await readJson(req);
    const batchSize = typeof body.batchSize === 'number' ? body.batchSize : undefined;
    const result = await scoreTopics({
      domain: optionalString(body.domain, 'domain', 40),
      batchSize,
      userId: user.id,
    });
    // 契约里 data 是 Topic[]；降级信息走响应头，不污染数据结构
    const res = ok(result.items);
    if (result.degraded) {
      res.headers.set('x-score-degraded', '1');
      res.headers.set('x-score-degraded-reason', encodeURIComponent(result.degradedReason ?? ''));
    }
    if (result.model) res.headers.set('x-score-model', encodeURIComponent(result.model));
    return res;
  });
}
