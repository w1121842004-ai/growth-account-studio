import { requireUser } from '@/lib/auth/session';
import { badRequest, ok, route } from '@/lib/http/envelope';
import { readJson, requireUuid } from '@/lib/http/params';
import { deleteDraft, getDraft, updateDraft } from '@/lib/services/draft-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return route('drafts.get', async () => {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    return ok(await getDraft(user.id, requireUuid(id)));
  });
}

/** 保存人工编辑：编辑距离与留痕由 service 计算写入 edit_trails（C-7/AC-06）。 */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return route('drafts.update', async () => {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    const body = await readJson(req);
    if (!body.blocks) throw badRequest('blocks 必填');
    const draft = await updateDraft({ userId: user.id, id: requireUuid(id), blocks: body.blocks });
    return ok(draft);
  });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return route('drafts.delete', async () => {
    const user = await requireUser(req);
    const { id } = await ctx.params;
    return ok(await deleteDraft(user.id, requireUuid(id)));
  });
}
