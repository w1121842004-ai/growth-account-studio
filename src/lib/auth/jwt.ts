/**
 * JWT 签发/校验（Spec §4：access 15min + refresh 7d）。
 * 过期时间统一用「秒」传给 jsonwebtoken，避免 @types 对 StringValue 的收窄导致类型漂移。
 */
import jwt from 'jsonwebtoken';
import { unauthorized } from '../http/envelope';

export type TokenKind = 'access' | 'refresh';

export interface TokenPayload {
  sub: string;
  email: string;
  kind: TokenKind;
}

const ACCESS_TTL_SEC = Number(process.env.JWT_ACCESS_TTL_MIN ?? 15) * 60;
const REFRESH_TTL_SEC = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 7) * 24 * 60 * 60;

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 8) {
    // 开发默认值仅在非生产可用；生产缺失直接拒绝，避免用弱密钥签发令牌
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET 未配置：生产环境拒绝启动认证流程');
    }
    return 'dev-only-insecure-secret';
  }
  return value;
}

export const accessTtlSeconds = ACCESS_TTL_SEC;
export const refreshTtlSeconds = REFRESH_TTL_SEC;

export function signToken(payload: Omit<TokenPayload, 'kind'>, kind: TokenKind): string {
  const ttl = kind === 'access' ? ACCESS_TTL_SEC : REFRESH_TTL_SEC;
  return jwt.sign({ ...payload, kind }, secret(), { expiresIn: ttl });
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function issueTokens(user: { id: string; email: string }): TokenPair {
  const base = { sub: user.id, email: user.email };
  return {
    accessToken: signToken(base, 'access'),
    refreshToken: signToken(base, 'refresh'),
    expiresIn: ACCESS_TTL_SEC,
  };
}

/** 校验令牌；失败（过期/签名不符/kind 不符）抛 401。 */
export function verifyToken(token: string, expected: TokenKind): TokenPayload {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, secret());
  } catch (err) {
    const name = (err as Error).name;
    throw unauthorized(name === 'TokenExpiredError' ? '令牌已过期，请重新登录' : '令牌无效');
  }
  if (typeof decoded !== 'object' || decoded === null) throw unauthorized('令牌无效');
  const rec = decoded as Record<string, unknown>;
  if (typeof rec.sub !== 'string' || typeof rec.email !== 'string' || rec.kind !== expected) {
    throw unauthorized('令牌类型不匹配');
  }
  return { sub: rec.sub, email: rec.email, kind: expected };
}
