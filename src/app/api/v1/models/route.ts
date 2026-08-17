import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { listModels } from '@/lib/services/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 模型配置列表（apiKey 永不回传，只给 hasApiKey）。 */
export async function GET(req: Request): Promise<Response> {
  return route('models.list', async () => {
    await requireUser(req);
    return ok(await listModels());
  });
}
