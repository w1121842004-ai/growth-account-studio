/**
 * 手动触发一轮采集（前端「立即刷新选题池」按钮）。
 * force 只跳过 30min 间隔闸；robots 守卫与退避状态一律照常生效（C-4 不可绕过）。
 */
import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { optionalString, readJson } from '@/lib/http/params';
import { clientKey, enforceLimit } from '@/lib/http/rate-limit';
import { collectAll } from '@/lib/collection/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request): Promise<Response> {
  return route('collect.run', async () => {
    const user = await requireUser(req);
    // 出网动作按用户限流，避免手动按钮被连点成压测
    enforceLimit('score', clientKey(req, user.id));
    const body = await readJson(req);
    const report = await collectAll({
      force: body.force === true,
      onlyKey: optionalString(body.key, 'key', 40),
    });
    return ok(report);
  });
}
