import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { optionalEnum, optionalNumber, optionalString, pageQuery } from '@/lib/http/params';
import { listTopics } from '@/lib/services/topic-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLATFORMS = ['toutiao', 'baidu', 'zhihu', 'bilibili'] as const;

export async function GET(req: Request): Promise<Response> {
  return route('topics.list', async () => {
    await requireUser(req);
    const url = new URL(req.url);
    const { page, limit } = pageQuery(url, 20);
    const data = await listTopics({
      domain: optionalString(url.searchParams.get('domain') ?? undefined, 'domain', 40),
      platform: optionalEnum(url.searchParams.get('platform') ?? undefined, PLATFORMS, 'platform'),
      minScore: optionalNumber(url.searchParams.get('minScore')),
      page,
      limit,
    });
    return ok(data);
  });
}
