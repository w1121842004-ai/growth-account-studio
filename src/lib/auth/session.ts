/**
 * 请求级认证：Bearer access token → 数据库用户。
 * 每个受保护端点必须先调用 requireUser（授权检查在 service 层按资源归属再做一次）。
 */
import { eq } from 'drizzle-orm';
import { getDb, users } from '../../db';
import { unauthorized } from '../http/envelope';
import { verifyToken } from './jwt';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

function bearer(req: Request): string {
  const header = req.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') throw unauthorized();
  return token.trim();
}

/** 校验访问令牌并回读用户（令牌有效但用户已删除 → 401）。 */
export async function requireUser(req: Request): Promise<AuthUser> {
  const payload = verifyToken(bearer(req), 'access');
  const db = getDb();
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);
  const row = rows[0];
  if (!row) throw unauthorized('用户不存在或已注销');
  return { id: row.id, email: row.email, name: row.name, createdAt: row.createdAt.toISOString() };
}
