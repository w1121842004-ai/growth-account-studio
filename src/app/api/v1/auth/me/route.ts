import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return route('auth.me', async () => {
    const user = await requireUser(req);
    return ok(user);
  });
}
