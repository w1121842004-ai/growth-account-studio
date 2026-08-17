/**
 * 密码哈希（bcryptjs 2.4.3，实测已安装版本）。
 * cost 因子 10：MVP 单用户下登录耗时约 60–80ms，兼顾安全与响应时间。
 */
import bcrypt from 'bcryptjs';

const COST = Number(process.env.BCRYPT_COST ?? 10);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}
