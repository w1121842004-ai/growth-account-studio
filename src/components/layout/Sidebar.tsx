"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav";
import { useEditorStore } from "@/store/editorStore";
import { cn } from "@/lib/utils";

/** 桌面左侧 Sidebar（全局框架）。选中态用 --accent 文字/细线（DESIGN §4）。 */
export function Sidebar() {
  const pathname = usePathname();
  const draftId = useEditorStore((s) => s.currentDraftId);

  const isActive = (item: (typeof NAV_ITEMS)[number]) => {
    if (item.requiresDraft) return draftId != null && pathname.startsWith("/drafts/") && pathname.includes("/preview");
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <span className="font-serif text-xl font-medium text-fg">成长号工坊</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => {
          const href = item.dynamicHref ? item.dynamicHref(draftId) : item.href ?? "#";
          const active = isActive(item);
          const Icon = item.icon;
          const disabled = item.requiresDraft && draftId == null;
          return (
            <Link
              key={item.label}
              href={disabled ? "#" : href}
              aria-disabled={disabled}
              title={disabled ? "先生成或打开一份草稿" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-base transition-colors duration-150",
                "focus-visible:outline-none focus-visible:border-accent",
                active ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-surface-warm",
                disabled && "pointer-events-none opacity-40",
              )}
            >
              <Icon size={20} aria-hidden />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-4 text-xs text-meta">
        半自动内容工坊 · 个人成长号
      </div>
    </aside>
  );
}
