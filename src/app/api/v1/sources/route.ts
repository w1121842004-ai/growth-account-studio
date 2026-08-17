import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { listSources } from '@/lib/services/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 采集源列表（白名单定义 + 库内启停状态 + robots 合规备注，AC-02/C-4）。 */
export async function GET(req: Request): Promise<Response> {
  return route('sources.list', async () => {
    await requireUser(req);
    return ok(await listSources());
  });
}
