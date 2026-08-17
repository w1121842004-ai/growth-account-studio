/**
 * 请求解析与白名单校验（第一层：参数校验 → 400/422）。
 * 不引入额外校验库（zod 未在 package.json 声明为直接依赖，C-10 禁凭印象引依赖）。
 */
import { badRequest, unprocessable } from './envelope';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function requireUuid(value: string | undefined, field = 'id'): string {
  if (!value || !UUID_RE.test(value)) throw badRequest(`${field} 必须是合法 uuid`);
  return value;
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** 邮箱：先去首尾空白再校验（表单常带尾空格，不该因此 422），统一小写入库。 */
export function requireEmail(value: unknown): string {
  if (typeof value !== 'string') throw unprocessable('邮箱格式不合法');
  const normalized = value.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) throw unprocessable('邮箱格式不合法');
  return normalized;
}

export function requirePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8) throw unprocessable('密码至少 8 位');
  if (value.length > 128) throw unprocessable('密码过长（上限 128 位）');
  return value;
}

export function requireString(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw badRequest(`${field} 必填`);
  if (value.length > max) throw badRequest(`${field} 超长（上限 ${max} 字符）`);
  return value.trim();
}

export function optionalString(value: unknown, field: string, max = 200): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireString(value, field, max);
}

export function requireEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw badRequest(`${field} 必填且为 ${allowed.join('|')}`);
  }
  return value as T;
}

export function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireEnum(value, allowed, field);
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw badRequest(`${field} 必须是布尔值`);
  return value;
}

export interface PageQuery {
  page: number;
  limit: number;
  offset: number;
}

/** 分页参数（默认 page=1 limit=20，limit 上限 100，防全量拉取）。 */
export function pageQuery(url: URL, defaultLimit = 20): PageQuery {
  const page = clampInt(url.searchParams.get('page'), 1, 1, 10_000);
  const limit = clampInt(url.searchParams.get('limit'), defaultLimit, 1, 100);
  return { page, limit, offset: (page - 1) * limit };
}

export function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function optionalNumber(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** 读取 JSON body；空 body 返回 {}（openapi 中若干端点 requestBody 非必填）。 */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text.trim()) return {};
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw badRequest('请求体必须是 JSON 对象');
  }
  return parsed as Record<string, unknown>;
}
