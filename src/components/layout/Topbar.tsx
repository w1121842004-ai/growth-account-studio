"use client";

import Link from "next/link";
import { Lightbulb, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 顶栏：工作区名 + 今日灵感 + 新建按钮（设计 Token 暖纸白/松绿）。 */
export function Topbar({ workspace = "小林的内容工坊" }: { workspace?: string }) {
  return (
    <header className="sticky top-0 z-[1100] flex h-16 items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur lg:px-6">
      <div className="min-w-0">
        <p className="truncate font-serif text-lg font-medium text-fg">{workspace}</p>
        <p className="hidden truncate text-xs text-muted sm:block">成长 / AI 提效 · 半自动内容工坊</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-full border border-accent-soft bg-accent-soft/50 px-3 py-1.5 text-sm text-accent md:inline-flex">
          <Lightbulb size={16} aria-hidden />
          今日灵感：用 AI 做年度复盘
        </span>
        <Link href="/drafts/new">
          <Button size="sm">
            <PenLine size={20} /> 新建草稿
          </Button>
        </Link>
      </div>
    </header>
  );
}
