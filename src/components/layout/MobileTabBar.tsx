"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav";
import { useEditorStore } from "@/store/editorStore";
import { cn } from "@/lib/utils";

/** 移动端底部 TabBar（≤5 项，触摸目标 ≥44px，DESIGN §8）。 */
export function MobileTabBar() {
  const pathname = usePathname();
  const draftId = useEditorStore((s) => s.currentDraftId);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[1100] flex border-t border-border bg-surface lg:hidden">
      {NAV_ITEMS.map((item) => {
        const href = item.dynamicHref ? item.dynamicHref(draftId) : item.href ?? "#";
        const active =
          item.requiresDraft
            ? draftId != null && pathname.includes("/preview")
            : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        const disabled = item.requiresDraft && draftId == null;
        return (
          <Link
            key={item.label}
            href={disabled ? "#" : href}
            aria-disabled={disabled}
            className={cn(
              "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs",
              active ? "text-accent" : "text-muted",
              disabled && "pointer-events-none opacity-40",
            )}
          >
            <Icon size={20} aria-hidden />
            <span className="font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
