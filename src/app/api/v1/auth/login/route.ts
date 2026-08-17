import { ok, route } from '@/lib/http/envelope';
import { readJson, requireEmail, requireString } from '@/lib/http/params';
import { clientKey, enforceLimit } from '@/lib/http/rate-limit';
import { login } from '@/lib/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  return route('auth.login', async () => {
    // 登录限流：同一 IP 每分钟 10 次（撞库门槛）
    enforceLimit('auth', clientKey(req));
    const body = await readJson(req);
    const result = await login({
      email: requireEmail(body.email),
      password: requireString(body.password, 'password', 200),
    });
    return ok(result);
  });
}
