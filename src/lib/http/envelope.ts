/**
 * 统一响应包络 {code, data, message}（Spec §5 / openapi ApiEnvelope）。
 * 成功 code=0；错误 code 与 HTTP status 一致（400/401/403/404/409/422/429/500/503）。
 * 路由层只允许经此模块产出响应，禁止裸 NextResponse.json。
 */
import { AstError } from '../block-ast/validate';

export class ApiError extends Error {
  readonly status: number;
  readonly code: number;
  constructor(status: number, message: string, code?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code ?? status;
  }
}

export const badRequest = (msg: string) => new ApiError(400, msg);
export const unauthorized = (msg = '未登录或 token 已失效') => new ApiError(401, msg);
export const forbidden = (msg = '无权访问该资源') => new ApiError(403, msg);
export const notFound = (msg = 'not found') => new ApiError(404, msg);
export const conflict = (msg: string) => new ApiError(409, msg);
export const unprocessable = (msg: string) => new ApiError(422, msg);
export const rateLimited = (msg: string) => new ApiError(429, msg);
export const unavailable = (msg: string) => new ApiError(503, msg);

export interface Envelope<T> {
  code: number;
  data: T | null;
  message: string;
}

function json<T>(body: Envelope<T>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** 成功响应（data 不得为 null——前端客户端把 null 视为失败）。 */
export function ok<T>(data: T, status = 200): Response {
  return json({ code: 0, data, message: '' }, status);
}

export function fail(status: number, message: string, code?: number): Response {
  return json({ code: code ?? status, data: null, message }, status);
}

/** 分页信封（Spec §5：items/total/page/limit/hasMore）。 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export function paginate<T>(items: T[], total: number, page: number, limit: number): Page<T> {
  return { items, total, page, limit, hasMore: page * limit < total };
}

/**
 * 路由包裹器：统一异常 → 响应映射，并记录服务端日志（不外泄内部细节）。
 * 日志为纯文字，无 emoji（P0 规则）。
 */
export async function route(name: string, handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status >= 500) console.error(`[api] ${name} failed:`, err.message);
      return fail(err.status, err.message, err.code);
    }
    if (err instanceof AstError) {
      return fail(400, `Block AST 校验失败：${err.message}`);
    }
    if (err instanceof SyntaxError) {
      return fail(400, '请求体不是合法 JSON');
    }
    console.error(`[api] ${name} unhandled error:`, err);
    return fail(500, '内部错误，请重试');
  }
}
