import { ok, route } from '@/lib/http/envelope';
import { readJson, requireString } from '@/lib/http/params';
import { clientKey, enforceLimit } from '@/lib/http/rate-limit';
import { refresh } from '@/lib/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  return route('auth.refresh', async () => {
    enforceLimit('auth', clientKey(req));
    const body = await readJson(req);
    const result = await refresh(requireString(body.refreshToken, 'refreshToken', 4000));
    return ok(result);
  });
}
