/**
 * 前端令牌存储（JWT 访问 15min + 刷新 7d，Spec §4）。
 * 单用户本地账号起步；令牌存 localStorage，SSR 安全（仅在浏览器读取）。
 */

const ACCESS_KEY = "gos_access_token";
const REFRESH_KEY = "gos_refresh_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_KEY, access);
  window.localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

let onUnauthorized: (() => void) | null = null;

/** 注册 401 回调（在 Providers 中指向 /login 跳转）。 */
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

export function notifyUnauthorized(): void {
  if (onUnauthorized) onUnauthorized();
}
