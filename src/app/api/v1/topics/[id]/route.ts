import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { requireUuid } from '@/lib/http/params';
import { getTopic } from '@/lib/services/topic-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return route('topics.get', async () => {
    await requireUser(req);
    const { id } = await ctx.params;
    return ok(await getTopic(requireUuid(id)));
  });
}
