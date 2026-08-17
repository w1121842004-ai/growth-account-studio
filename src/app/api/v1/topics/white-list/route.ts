import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { whiteList } from '@/lib/services/topic-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 采集白名单与禁采名单（前端设置页展示合规依据，C-4）。 */
export async function GET(req: Request): Promise<Response> {
  return route('topics.whiteList', async () => {
    await requireUser(req);
    return ok(whiteList());
  });
}
