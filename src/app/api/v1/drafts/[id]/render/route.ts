import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { requireEnum, requireUuid } from '@/lib/http/params';
import { renderDraft, renderDraftBoth } from '@/lib/services/render-service';
import { RENDER_PLATFORMS } from '@/lib/renderer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 渲染指定平台 HTML（AC-04/AC-05）。AI 标识由渲染器强制注入且经合规断言（C-5）。
 * platform=both 时一次返回双平台，供对照预览面板少跑一次往返。
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return route('drafts.render', async () => {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const draftId = requireUuid(id);
    const raw = new URL(req.url).searchParams.get('platform');
    if (raw === 'both') return ok(await renderDraftBoth(user.id, draftId));
    const platform = requireEnum(raw ?? undefined, RENDER_PLATFORMS, 'platform');
    return ok(await renderDraft(user.id, draftId, platform));
  });
}
