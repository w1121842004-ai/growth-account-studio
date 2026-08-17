"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/common/states";
import { api, ApiError } from "@/lib/api/client";
import { setTokens } from "@/lib/auth";
import type { AuthResult } from "@/lib/api/types";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<AuthResult>("/auth/register", { name, email, password });
      setTokens(res.accessToken, res.refreshToken);
      router.push("/topics");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "注册失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-xl font-medium text-fg">注册</h1>
        <p className="mt-1 text-sm text-muted">单用户本地账号，先把人设配好更好用</p>
      </div>
      {error && <ErrorState message={error} />}
      <label className="flex flex-col gap-1.5 text-sm text-fg-2">
        昵称
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="小林" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-fg-2">
        邮箱
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-fg-2">
        密码
        <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" />
      </label>
      <Button type="submit" disabled={loading}>
        {loading ? "创建中…" : "创建账号"}
      </Button>
      <p className="text-center text-sm text-muted">
        已有账号？
        <a href="/login" className="ml-1 text-accent hover:underline">登录</a>
      </p>
    </form>
  );
}
