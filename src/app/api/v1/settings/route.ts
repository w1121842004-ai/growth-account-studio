import { requireUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/envelope';
import { optionalEnum, optionalString, readJson } from '@/lib/http/params';
import { getSettings, updateSettings } from '@/lib/services/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LAYOUTS = ['minimal', 'book', 'columns'] as const;

export async function GET(req: Request): Promise<Response> {
  return route('settings.get', async () => {
    const user = await requireUser(req);
    return ok(await getSettings(user.id));
  });
}

export async function PUT(req: Request): Promise<Response> {
  return route('settings.update', async () => {
    const user = await requireUser(req);
    const body = await readJson(req);
    const next = await updateSettings(user.id, {
      profile: optionalString(body.profile, 'profile', 2000),
      tone: optionalString(body.tone, 'tone', 200),
      layout: optionalEnum(body.layout, LAYOUTS, 'layout'),
    });
    return ok(next);
  });
}
