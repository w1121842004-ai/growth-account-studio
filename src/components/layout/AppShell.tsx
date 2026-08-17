"use client";

// 该组件用 useEffect 做未登录跳转、useRouter 做导航，必须是 Client Component。
// 父级 (app)/layout.tsx 保持 Server Component，只负责渲染本组件。
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileTabBar } from "./MobileTabBar";
import { getAccessToken } from "@/lib/auth";

/** 应用外壳：桌面左 Sidebar + 顶栏；移动底 TabBar。 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // 轻量守卫：无 token 跳登录（SSR 不读 localStorage，仅在客户端挂载后判断）
  useEffect(() => {
    if (!getAccessToken()) router.replace("/login");
  }, [router]);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-8">{children}</main>
      </div>
      <MobileTabBar />
    </div>
  );
}
