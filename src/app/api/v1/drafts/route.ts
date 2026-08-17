import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { optionalEnum, pageQuery } from '@/lib/http/params';
import { listDrafts } from '@/lib/services/draft-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = ['draft', 'exported'] as const;

export async function GET(req: Request): Promise<Response> {
  return route('drafts.list', async () => {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const { page, limit } = pageQuery(url, 20);
    const data = await listDrafts({
      userId: user.id,
      status: optionalEnum(url.searchParams.get('status') ?? undefined, STATUSES, 'status'),
      page,
      limit,
    });
    return ok(data);
  });
}
