/**
 * 导出（AC-06/AC-07/C-6）。
 * POST：编辑距离未达阈值 → 409，且不改 status；达标则返回 HTML + 文本 + 发布 checklist。
 * GET ：导出前自检，供前端提前灰掉按钮（避免用户点了才吃 409）。
 * 这里没有、也不会有任何自动发布逻辑（Spec §3 / ADR-003）。
 */
import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { readJson, requireEnum, requireUuid } from '@/lib/http/params';
import { exportDraft, exportReadiness } from '@/lib/services/render-service';
import { RENDER_PLATFORMS } from '@/lib/renderer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return route('drafts.export', async () => {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const body = await readJson(req);
    const platform = requireEnum(body.platform, RENDER_PLATFORMS, 'platform');
    return ok(await exportDraft(user.id, requireUuid(id), platform));
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return route('drafts.exportReadiness', async () => {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    return ok(await exportReadiness(user.id, requireUuid(id)));
  });
}
