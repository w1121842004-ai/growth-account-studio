import { requireUser } from '@/lib/auth/session';
import { badRequest, ok, route } from '@/lib/http/envelope';
import { getUsage } from '@/lib/services/usage-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function date(raw: string | null, field: string): string | undefined {
  if (!raw) return undefined;
  if (!DATE.test(raw)) throw badRequest(`${field} 需为 YYYY-MM-DD`);
  return raw;
}

export async function GET(req: Request): Promise<Response> {
  return route('usage.get', async () => {
    const user = await requireUser(req);
    const params = new URL(req.url).searchParams;
    const data = await getUsage(user.id, {
      from: date(params.get('from'), 'from'),
      to: date(params.get('to'), 'to'),
    });
    return ok(data);
  });
}
