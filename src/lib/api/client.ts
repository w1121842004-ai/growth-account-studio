/**
 * fetch 封装（Spec §5：前缀 /api/v1，统一 {code,data,message} 包络）。
 * - 自动附加 Bearer；401 清理令牌并触发未授权回调（跳转 /login）。
 * - 解包 ApiEnvelope；非 0 code 抛 ApiError（含 message 供 Error 态展示）。
 * 路径与 openapi.yaml 严格一致，禁止偏离。
 */
import { getAccessToken, clearTokens, notifyUnauthorized } from "@/lib/auth";
import type { ApiEnvelope } from "./types";

const BASE = "/api/v1";

export class ApiError extends Error {
  code: number;
  status: number;
  constructor(message: string, code: number, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** 跳过统一包络解析（如 SSE 调用方自行处理） */
  rawResponse?: boolean;
}

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { body, headers, rawResponse, ...rest } = init;
  const token = getAccessToken();

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearTokens();
    notifyUnauthorized();
    throw new ApiError("未登录或 token 已失效", 401, 401);
  }

  if (rawResponse) {
    return res as unknown as T;
  }

  const envelope = (await res.json()) as ApiEnvelope<T>;
  if (envelope.code !== 0 || envelope.data === null) {
    throw new ApiError(envelope.message || "请求失败", envelope.code, res.status);
  }
  return envelope.data;
}

export const api = {
  get: <T>(path: string, init?: RequestOptions) => request<T>(path, { ...init, method: "GET" }),
  post: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: "POST", body }),
  put: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: "PUT", body }),
  del: <T>(path: string, init?: RequestOptions) => request<T>(path, { ...init, method: "DELETE" }),
  /** 返回原生 Response（SSE 场景）。 */
  stream: (path: string, init?: RequestOptions) =>
    request<Response>(path, { ...init, rawResponse: true }),
};

export { BASE };
