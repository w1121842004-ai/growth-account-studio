import { ok, route } from '@/lib/http/envelope';
import { optionalString, readJson, requireEmail, requirePassword } from '@/lib/http/params';
import { clientKey, enforceLimit } from '@/lib/http/rate-limit';
import { register } from '@/lib/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  return route('auth.register', async () => {
    enforceLimit('auth', clientKey(req));
    const body = await readJson(req);
    const result = await register({
      email: requireEmail(body.email),
      password: requirePassword(body.password),
      name: optionalString(body.name, 'name', 60),
    });
    return ok(result, 201);
  });
}
