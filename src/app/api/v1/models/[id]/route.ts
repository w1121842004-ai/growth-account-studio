import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { optionalEnum, optionalString, readJson, requireUuid } from '@/lib/http/params';
import { updateModel } from '@/lib/services/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES = ['primary', 'fallback'] as const;
const TIERS = ['generate', 'score'] as const;

/** 热切换模型（ADR-004）：baseUrl/apiKey/model/role/priority 全部来自配置，不改代码。 */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return route('models.update', async () => {
    await requireUser(req);
    const { id } = await ctx.params;
    const body = await readJson(req);
    const patch = {
      baseUrl: optionalString(body.baseUrl, 'baseUrl', 300),
      apiKey: optionalString(body.apiKey, 'apiKey', 500),
      model: optionalString(body.model, 'model', 120),
      role: optionalEnum(body.role, ROLES, 'role'),
      tier: optionalEnum(body.tier, TIERS, 'tier'),
      priority: typeof body.priority === 'number' ? body.priority : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    };
    return ok(await updateModel(requireUuid(id), patch));
  });
}
