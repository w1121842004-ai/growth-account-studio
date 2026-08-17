/**
 * 认证业务（Spec §4：JWT access 15min + refresh 7d）。
 * 路由层只做参数解析与限流，登录/注册的所有判定在这里。
 */
import { eq, sql } from 'drizzle-orm';
import { getDb, users } from '../../db';
import { issueTokens, verifyToken, type TokenPair } from '../auth/jwt';
import { hashPassword, verifyPassword } from '../auth/password';
import { conflict, unauthorized } from '../http/envelope';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResult extends TokenPair {
  user: PublicUser;
}

type UserRow = typeof users.$inferSelect;

function toPublic(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 邮箱统一小写去空格存储 —— 否则 "A@x.com" 与 "a@x.com" 会绕过唯一约束。 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findByEmail(email: string): Promise<UserRow | undefined> {
  const rows = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0];
}

export async function register(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  if (await findByEmail(email)) throw conflict('该邮箱已注册');
  const passwordHash = await hashPassword(input.password);
  const name = (input.name ?? '').trim() || email.split('@')[0];
  try {
    const [row] = await getDb().insert(users).values({ email, passwordHash, name }).returning();
    return { ...issueTokens(row), user: toPublic(row) };
  } catch (err) {
    // 并发注册撞唯一索引：语义等同「已注册」，不能吐 500
    if (/duplicate key|unique/i.test((err as Error).message)) throw conflict('该邮箱已注册');
    throw err;
  }
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const row = await findByEmail(normalizeEmail(input.email));
  // 用户不存在与密码错误返回同一文案，避免账号枚举
  const fail = () => unauthorized('邮箱或密码不正确');
  if (!row) {
    // 仍走一次哈希校验，抹平时序差异
    await verifyPassword(input.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    throw fail();
  }
  const okPassword = await verifyPassword(input.password, row.passwordHash);
  if (!okPassword) throw fail();
  return { ...issueTokens(row), user: toPublic(row) };
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  const payload = verifyToken(refreshToken, 'refresh');
  const rows = await getDb().select().from(users).where(eq(users.id, payload.sub)).limit(1);
  const row = rows[0];
  if (!row) throw unauthorized('用户不存在或已注销');
  return { ...issueTokens(row), user: toPublic(row) };
}

/** 是否已存在任何账号（前端首启引导用；不泄露具体邮箱）。 */
export async function hasAnyUser(): Promise<boolean> {
  const [row] = await getDb().select({ n: sql<number>`count(*)::int` }).from(users);
  return (row?.n ?? 0) > 0;
}
