import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { readJson, requireBoolean, requireUuid } from '@/lib/http/params';
import { updateSource } from '@/lib/services/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 启停采集源。启用未核验 robots 的源会被 service 拒绝（409），这是 C-4 的守卫点之一，
 * 不允许通过接口把 zhihu/bilibili 打开。
 */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return route('sources.update', async () => {
    await requireUser(req);
    const { id } = await ctx.params;
    const body = await readJson(req);
    const enabled = requireBoolean(body.enabled, 'enabled');
    return ok(await updateSource(requireUuid(id), enabled));
  });
}
