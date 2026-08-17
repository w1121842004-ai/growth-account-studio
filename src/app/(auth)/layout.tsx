import Link from "next/link";

/** 认证页布局：居中极简，无 Sidebar 外壳（登录/注册不应带编辑框架）。 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <Link href="/" className="mb-8 font-serif text-2xl font-medium text-fg">
        成长号工坊
      </Link>
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-xs">
        {children}
      </div>
      <p className="mt-4 text-xs text-meta">面向文科运营者的半自动内容工坊</p>
    </div>
  );
}
