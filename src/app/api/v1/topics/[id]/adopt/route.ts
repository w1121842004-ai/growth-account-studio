import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { requireUuid } from '@/lib/http/params';
import { adoptTopic } from '@/lib/services/topic-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return route('topics.adopt', async () => {
    await requireUser(req);
    const { id } = await ctx.params;
    return ok(await adoptTopic(requireUuid(id)));
  });
}
